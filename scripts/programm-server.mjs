/**
 * Baut den Server für das Windows-Programm (Spezifikation 7.8, Weg A, Schritt 7.2) nach
 * src-tauri/server/ und legt die Node-Laufzeit als Sidecar nach src-tauri/binaries/:
 *
 *   server.mjs        Server (src/server/programm.ts) als eine ES-Moduldatei, mit rolldown gebündelt
 *   worker.mjs        Prüf-Worker (src/pruefung/worker.ts) samt pdf.js-Worker
 *   saxon.cjs         SaxonJS mit axios als CommonJS: SaxonJS setzt globale Variablen ohne
 *                     Deklaration und läuft deshalb nicht im strikten Modus eines ES-Moduls
 *   xmllint-node.js, xmllint.wasm   unverändert aus xmllint-wasm (startet eigene Worker aus Dateien)
 *   oberflaeche/      gebaute Oberfläche (dist/, vorher npm run build)
 *   vendor/           KoSIT-Konfiguration, Visualisierung, SEF und Lizenztexte (vorher npm run vorbereiten)
 *   LIZENZEN.txt      Lizenztexte aller gebündelten Pakete, von Node.js und Hinweise zu den Artefakten
 *
 * Die Laufzeit ist die node.exe, mit der dieses Skript läuft (mindestens 24.15), unverändert und
 * damit mit gültiger Signatur der OpenJS Foundation. Warum keine Node-Einzeldatei (SEA):
 * docs/entscheidungen.md, T15.
 *
 *   node scripts/programm-server.mjs
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rolldown } from 'rolldown'

const WURZEL = resolve(fileURLToPath(new URL('..', import.meta.url)))
const ZIEL = join(WURZEL, 'src-tauri', 'server')
const LAUFZEIT = join(WURZEL, 'src-tauri', 'binaries', 'belegbruecke-server-x86_64-pc-windows-msvc.exe')
const paket = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'))

function pruefeVoraussetzungen() {
  const [haupt, neben] = process.versions.node.split('.').map(Number)
  if (haupt < 24 || (haupt === 24 && neben < 15)) throw new Error(`Node ${process.versions.node}: Für das Programm wird Node 24.15 oder neuer gebraucht.`)
  if (process.platform !== 'win32') throw new Error('Das Windows-Programm wird unter Windows gebaut.')
  if (!existsSync(join(WURZEL, 'dist', 'index.html'))) throw new Error('dist/ fehlt. Erst: npm run build')
  if (!existsSync(join(WURZEL, 'vendor', 'sef', 'verzeichnis.json'))) throw new Error('Prüfartefakte fehlen. Erst: npm run vorbereiten')
}

/**
 * Stellen, die im Bündel anders sein müssen als beim direkten Start mit Node. Jede Ersetzung muss
 * genau einmal greifen; sonst bricht der Bau ab, statt still ein falsches Programm zu bauen.
 */
const ERSETZUNGEN = [
  {
    datei: 'src/server/start.ts',
    // Im Bündel ist import.meta.url für alle Module gleich: start.ts darf sich nicht selbst starten
    alt: 'if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {',
    neu: 'if (false) {',
  },
  {
    datei: 'src/pruefung/pool.ts',
    alt: "new URL('./worker.ts', import.meta.url)",
    neu: "new URL('./worker.mjs', import.meta.url)",
  },
  {
    datei: 'src/server/dienste/kontext.ts',
    alt: "JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }",
    neu: `${JSON.stringify({ version: paket.version })} as { version: string }`,
  },
]

function ersetzungen(erwartet) {
  const getroffen = new Map(ERSETZUNGEN.map((e) => [e, 0]))
  return {
    name: 'belegbruecke-programm',
    transform(code, id) {
      const pfad = relative(WURZEL, id.split('?')[0]).split(sep).join('/')
      let neu = code
      for (const e of ERSETZUNGEN) {
        if (e.datei !== pfad) continue
        const anzahl = neu.split(e.alt).length - 1
        if (anzahl !== 1) throw new Error(`${e.datei}: „${e.alt}“ ${anzahl}-mal gefunden statt einmal`)
        neu = neu.replace(e.alt, e.neu)
        getroffen.set(e, getroffen.get(e) + 1)
      }
      return neu === code ? null : { code: neu, map: null }
    },
    buildEnd(fehler) {
      if (fehler) return
      for (const [e, n] of getroffen) if (n === 0 && erwartet) throw new Error(`${e.datei}: Ersetzung nicht angewandt`)
    },
  }
}

/** SaxonJS nicht ins ES-Bündel, sondern aus saxon.cjs daneben laden. */
function saxonExtern() {
  return {
    name: 'belegbruecke-saxon-extern',
    resolveId: (id) => (id === 'saxon-js' ? { id: './saxon.cjs', external: true } : null),
  }
}

/** Prüf-Worker: pdf.js liest im Worker ohne eigenen Worker; den „Fake-Worker“ vorher bereitstellen. */
const WORKER_EINSTIEG = '\0programm-worker'
function workerEinstieg() {
  return {
    name: 'belegbruecke-worker-einstieg',
    resolveId: (id) => (id === WORKER_EINSTIEG ? id : null),
    load: (id) =>
      id === WORKER_EINSTIEG
        ? [
            "import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'",
            `import ${JSON.stringify(join(WURZEL, 'src', 'pruefung', 'worker.ts').split(sep).join('/'))}`,
            'globalThis.pdfjsWorker = pdfjsWorker',
          ].join('\n')
        : null,
  }
}

// CommonJS-Pakete im ES-Bündel erwarten require, __filename und __dirname; Pfade relativ zum Bündel
const BANNER = `import { createRequire as __bbRequire } from 'node:module';
import { fileURLToPath as __bbDatei } from 'node:url';
import { dirname as __bbOrdner, join as __bbPfad } from 'node:path';
const require = __bbRequire(import.meta.url);
const __filename = __bbDatei(import.meta.url);
const __dirname = __bbOrdner(__filename);
process.env.BB_VENDOR ??= __bbPfad(__dirname, 'vendor');
process.env.BB_OBERFLAECHE ??= __bbPfad(__dirname, 'oberflaeche');`

const pakete = new Set()

async function buendle(eingabe, datei, plugins, alleErsetzungen, format = 'esm') {
  const bundle = await rolldown({
    input: eingabe,
    platform: 'node',
    plugins: [ersetzungen(alleErsetzungen), ...plugins],
    logLevel: 'warn',
  })
  const { output } = await bundle.write({ file: join(ZIEL, datei), format, banner: format === 'esm' ? BANNER : undefined, codeSplitting: false, sourcemap: false })
  for (const teil of output) {
    if (teil.type !== 'chunk') continue
    for (const id of teil.moduleIds) {
      const t = /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)[\\/]/.exec(id)
      if (t) pakete.add(t[1].replace('\\', '/'))
    }
  }
  await bundle.close()
}

function kopiere(von, nach, filter) {
  cpSync(join(WURZEL, von), join(ZIEL, nach), { recursive: true, filter })
}

function lizenztext(ordner) {
  const name = readdirSync(ordner).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n))
  return name ? readFileSync(join(ordner, name), 'utf8').trim() : null
}

function schreibeLizenzen() {
  const teile = [
    'Belegbrücke – Lizenzen der mitgelieferten Teile',
    '',
    'Die Belegbrücke selbst ist noch nicht lizenziert (privat). Mitgeliefert werden:',
    '',
    '1. Node.js als Laufzeit des Servers (belegbruecke-server.exe ist die unveränderte node.exe).',
    '2. Die Prüfartefakte der KoSIT und des CEN in vendor/ mit ihren Lizenztexten in vendor/lizenzen/',
    '   (Herkunft und Prüfsummen: vendor/LIZENZEN.md). Die SEF-Dateien in vendor/sef/ sind mit xslt3',
    '   aus den XSLT-Dateien dieser Artefakte kompiliert und behalten deren Lizenz (EUPL-1.2 für die',
    '   CEN-Schematron, sonst Apache-2.0).',
    '3. Die folgenden npm-Pakete, gebündelt in server.mjs und worker.mjs bzw. als Datei (xmllint-wasm).',
    '',
  ]
  const nodeLizenz = join(dirname(process.execPath), 'LICENSE')
  teile.push('='.repeat(78), `Node.js ${process.version}`, '='.repeat(78), existsSync(nodeLizenz) ? readFileSync(nodeLizenz, 'utf8').trim() : 'MIT-Lizenz, siehe https://github.com/nodejs/node/blob/main/LICENSE', '')
  for (const name of [...pakete].sort()) {
    const ordner = join(WURZEL, 'node_modules', name)
    const p = JSON.parse(readFileSync(join(ordner, 'package.json'), 'utf8'))
    const text = lizenztext(ordner)
    teile.push('='.repeat(78), `${name} ${p.version} (${p.license ?? 'Lizenz nicht angegeben'})`, '='.repeat(78), text ?? `Kein Lizenztext im Paket; Lizenz laut package.json: ${p.license}`, '')
  }
  writeFileSync(join(ZIEL, 'LIZENZEN.txt'), teile.join('\r\n'))
}

function legeLaufzeitAb() {
  mkdirSync(dirname(LAUFZEIT), { recursive: true })
  const quelle = statSync(process.execPath)
  if (existsSync(LAUFZEIT) && statSync(LAUFZEIT).size === quelle.size && statSync(LAUFZEIT).mtimeMs >= quelle.mtimeMs) return
  copyFileSync(process.execPath, LAUFZEIT)
}

const beginn = performance.now()
pruefeVoraussetzungen()
rmSync(ZIEL, { recursive: true, force: true })
mkdirSync(ZIEL, { recursive: true })

// Der Server enthält start.ts, pool.ts und kontext.ts: dort müssen alle Ersetzungen greifen
await buendle(join(WURZEL, 'src', 'server', 'programm.ts'), 'server.mjs', [saxonExtern()], true)
await buendle(WORKER_EINSTIEG, 'worker.mjs', [saxonExtern(), workerEinstieg()], false)
await buendle('saxon-js', 'saxon.cjs', [], false, 'cjs')

// xmllint-wasm startet seinen Worker aus einer Datei neben dem Bündel und lädt die WASM von dort
pakete.add('xmllint-wasm')
for (const datei of ['xmllint-node.js', 'xmllint.wasm']) copyFileSync(join(WURZEL, 'node_modules', 'xmllint-wasm', datei), join(ZIEL, datei))
// Die Bündel sind .mjs; .js-Dateien in diesem Ordner sind CommonJS wie im Paket xmllint-wasm
writeFileSync(join(ZIEL, 'package.json'), `${JSON.stringify({ name: 'belegbruecke-server', version: paket.version, private: true, type: 'commonjs' }, null, 2)}\n`)

kopiere('dist', 'oberflaeche')
kopiere('vendor/konfiguration', 'vendor/konfiguration', (q) => !q.includes(`${sep}docs`))
kopiere('vendor/visualisierung', 'vendor/visualisierung', (q) => !/[\\/](doc|test)([\\/]|$)/.test(relative(join(WURZEL, 'vendor', 'visualisierung'), q)))
kopiere('vendor/sef', 'vendor/sef')
kopiere('vendor/LIZENZEN.md', 'vendor/LIZENZEN.md')
mkdirSync(join(ZIEL, 'vendor', 'lizenzen'), { recursive: true })
for (const datei of readdirSync(join(WURZEL, 'vendor', 'lizenzen'))) {
  // Validator, Mustang und Testsuite werden nicht mitgeliefert
  if (/^(validator|mustang|testsuite)-/.test(datei)) continue
  copyFileSync(join(WURZEL, 'vendor', 'lizenzen', datei), join(ZIEL, 'vendor', 'lizenzen', datei))
}
schreibeLizenzen()
legeLaufzeitAb()

let groesse = 0
let dateien = 0
for (const e of readdirSync(ZIEL, { recursive: true, withFileTypes: true })) {
  if (!e.isFile()) continue
  groesse += statSync(join(e.parentPath, e.name)).size
  dateien++
}
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`
console.log(`Programm-Server gebaut in ${((performance.now() - beginn) / 1000).toFixed(1)} s: ${dateien} Dateien, ${mb(groesse)} in ${relative(WURZEL, ZIEL)}; Laufzeit Node ${process.version} (${mb(statSync(LAUFZEIT).size)}); ${pakete.size} Pakete gebündelt`)
