/**
 * Baut den Server für das Windows-Programm (Spezifikation 7.8, Weg A, Schritt 7.2) nach
 * src-tauri/server/ und legt die Node-Laufzeit als Sidecar nach src-tauri/binaries/:
 *
 *   server.mjs        Server (src/server/programm.ts) als eine ES-Moduldatei, mit rolldown gebündelt
 *   worker.mjs        Prüf-Worker (src/pruefung/worker.ts) samt pdf.js-Worker
 *   node_modules/saxon-js/   SaxonJS bytegleich aus dem npm-Paket: Die Saxonica-Lizenz erlaubt die
 *                     Weitergabe nur unverändert; außerdem setzt SaxonJS globale Variablen ohne
 *                     Deklaration und läuft deshalb nicht im strikten Modus eines ES-Moduls
 *   node_modules/axios/      axios (lädt SaxonJS per require) als eine CommonJS-Datei
 *   xmllint-node.js, xmllint.wasm   unverändert aus xmllint-wasm (startet eigene Worker aus Dateien)
 *   oberflaeche/      gebaute Oberfläche (dist/, vorher npm run build)
 *   vendor/           KoSIT-Konfiguration, Visualisierung, SEF und Lizenztexte (vorher npm run vorbereiten)
 *   LIZENZEN.txt      Lizenztexte aller mitgelieferten npm-Pakete, von Node.js und der Rust-Crates
 *                     der Hülle (aus cargo metadata) sowie Hinweise zu den Artefakten
 *
 * Die Laufzeit ist die node.exe, mit der dieses Skript läuft (mindestens 24.15), unverändert und
 * damit mit gültiger Signatur der OpenJS Foundation. Warum keine Node-Einzeldatei (SEA):
 * docs/entscheidungen.md, T15. SaxonJS und Lizenztexte: T16.
 *
 *   node scripts/programm-server.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
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

/** SaxonJS nicht ins ES-Bündel: Node lädt es aus node_modules/saxon-js/ neben dem Bündel. */
function saxonExtern() {
  return {
    name: 'belegbruecke-saxon-extern',
    resolveId: (id) => (id === 'saxon-js' ? { id: 'saxon-js', external: true } : null),
  }
}

/** axios für SaxonJS: Einstieg per require, damit module.exports wie im Paket die axios-Funktion ist. */
const AXIOS_EINSTIEG = '\0axios-fuer-saxon'
function axiosEinstieg() {
  return {
    name: 'belegbruecke-axios-einstieg',
    resolveId: (id) => (id === AXIOS_EINSTIEG ? id : null),
    load: (id) => (id === AXIOS_EINSTIEG ? "module.exports = require('axios')" : null),
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

const sha256 = (datei) => createHash('sha256').update(readFileSync(datei)).digest('hex')

/** SaxonJS unverändert neben das Bündel legen (Saxonica-Lizenz: Weitergabe nur ohne Änderung). */
function legeSaxonAb() {
  const quelle = join(WURZEL, 'node_modules', 'saxon-js')
  const ziel = join(ZIEL, 'node_modules', 'saxon-js')
  cpSync(quelle, ziel, { recursive: true })
  for (const datei of readdirSync(quelle)) {
    if (sha256(join(quelle, datei)) !== sha256(join(ziel, datei))) throw new Error(`SaxonJS: ${datei} ist nach dem Kopieren nicht bytegleich`)
  }
  pakete.add('saxon-js')
}

/** axios als node_modules/axios/index.js, damit require('axios') in SaxonJS es findet. */
async function legeAxiosAb() {
  await buendle(AXIOS_EINSTIEG, join('node_modules', 'axios', 'index.js'), [axiosEinstieg()], false, 'cjs')
  const axios = JSON.parse(readFileSync(join(WURZEL, 'node_modules', 'axios', 'package.json'), 'utf8'))
  const beschreibung = `axios ${axios.version} mit seinen Abhängigkeiten als eine Datei gebündelt; Lizenzen in LIZENZEN.txt`
  writeFileSync(join(ZIEL, 'node_modules', 'axios', 'package.json'), `${JSON.stringify({ name: 'axios', version: axios.version, description: beschreibung, license: axios.license, main: 'index.js', type: 'commonjs' }, null, 2)}\n`)
  const text = lizenztext(join(WURZEL, 'node_modules', 'axios'))
  if (text) writeFileSync(join(ZIEL, 'node_modules', 'axios', 'LICENSE'), `${text}\n`)
}

function kopiere(von, nach, filter) {
  cpSync(join(WURZEL, von), join(ZIEL, nach), { recursive: true, filter })
}

function lizenztext(ordner) {
  const name = readdirSync(ordner).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n))
  return name ? readFileSync(join(ordner, name), 'utf8').trim() : null
}

/** cargo aus CARGO, dem PATH oder %USERPROFILE%\.cargo\bin (dort liegt es auf Robins Rechner). */
function cargo() {
  if (process.env.CARGO) return process.env.CARGO
  if (spawnSync('cargo', ['--version'], { stdio: 'ignore' }).status === 0) return 'cargo'
  const daheim = join(homedir(), '.cargo', 'bin', 'cargo.exe')
  if (existsSync(daheim)) return daheim
  throw new Error('cargo nicht gefunden: Für die Lizenztexte der Rust-Crates wird Rust gebraucht (wie für den Bau des Programms).')
}

/**
 * Rust-Crates, die in belegbruecke.exe eingehen: alle normalen Abhängigkeiten der Hülle für
 * Windows x64 (ohne Build- und Entwicklungsabhängigkeiten), mit den Lizenzdateien aus dem Crate.
 */
function rustCrates() {
  const meta = JSON.parse(
    execFileSync(cargo(), ['metadata', '--format-version', '1', '--locked', '--manifest-path', join(WURZEL, 'src-tauri', 'Cargo.toml'), '--filter-platform', 'x86_64-pc-windows-msvc'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    }),
  )
  const knoten = new Map(meta.resolve.nodes.map((n) => [n.id, n]))
  const erreicht = new Set()
  const offen = [meta.resolve.root]
  while (offen.length > 0) {
    for (const d of knoten.get(offen.pop()).deps) {
      if (!d.dep_kinds.some((k) => k.kind === null) || erreicht.has(d.pkg)) continue
      erreicht.add(d.pkg)
      offen.push(d.pkg)
    }
  }
  return meta.packages
    .filter((p) => erreicht.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map((p) => {
      const ordner = dirname(p.manifest_path)
      const dateien = readdirSync(ordner, { withFileTypes: true })
        .filter((e) => e.isFile() && /^(licen[cs]e|copying|copyright|notice)/i.test(e.name))
        .map((e) => e.name)
        .sort()
      return { name: p.name, version: p.version, lizenz: p.license ?? 'nicht angegeben', autoren: p.authors ?? [], quelle: p.repository, ordner, dateien }
    })
}

function schreibeLizenzen() {
  const linie = '='.repeat(78)
  const teile = [
    'Belegbrücke – Lizenzen der mitgelieferten Teile',
    '',
    `Belegbrücke ${paket.version}: © 2026 Robin Olbricht – olbricht-digital. Alle Rechte vorbehalten.`,
    'Das Programm darf kostenlos genutzt werden; eine offene Lizenz ist noch nicht gewählt.',
    'Quelltext: https://github.com/edgebird-lab/belegbruecke',
    '',
    'Mitgeliefert werden:',
    '',
    '1. Node.js als Laufzeit des Servers (belegbruecke-server.exe ist die unveränderte node.exe).',
    '2. Die Prüfartefakte der KoSIT und des CEN in vendor/ mit ihren Lizenztexten in vendor/lizenzen/',
    '   (Herkunft, Quellen und Prüfsummen: vendor/LIZENZEN.md). Die SEF-Dateien in vendor/sef/ sind mit',
    '   xslt3 aus den XSLT-Dateien dieser Artefakte kompiliert und behalten deren Lizenz (EUPL-1.2 für die',
    '   CEN-Schematron, Quelle github.com/ConnectingEurope/eInvoicing-EN16931; sonst Apache-2.0).',
    '3. Die folgenden npm-Pakete, gebündelt in server.mjs, worker.mjs und node_modules/axios/ bzw. als',
    '   Datei (xmllint-wasm). SaxonJS liegt unverändert in node_modules/saxon-js/ (Saxonica-Lizenz).',
    '4. Die Rust-Crates der Programmhülle belegbruecke.exe (Tauri und Abhängigkeiten), am Ende dieser Datei.',
    '',
  ]
  const nodeLizenz = join(dirname(process.execPath), 'LICENSE')
  teile.push(linie, `Node.js ${process.version}`, linie, existsSync(nodeLizenz) ? readFileSync(nodeLizenz, 'utf8').trim() : 'MIT-Lizenz, siehe https://github.com/nodejs/node/blob/main/LICENSE', '')
  for (const name of [...pakete].sort()) {
    const ordner = join(WURZEL, 'node_modules', name)
    const p = JSON.parse(readFileSync(join(ordner, 'package.json'), 'utf8'))
    const text = lizenztext(ordner)
    teile.push(linie, `${name} ${p.version} (${p.license ?? 'Lizenz nicht angegeben'})`, linie, text ?? `Kein Lizenztext im Paket; Lizenz laut package.json: ${p.license}`, '')
  }

  // Rust: gleiche Texte nur einmal, danach Verweis auf das erste Crate mit diesem Text
  const crates = rustCrates()
  teile.push(
    linie,
    `Rust-Crates der Programmhülle belegbruecke.exe (${crates.length})`,
    linie,
    'Quelltext jedes Crates: https://crates.io/crates/<Name>/<Version> (auch für MPL-2.0, Abschnitt 3.2).',
    'Gleiche Lizenztexte stehen nur beim ersten Crate; spätere verweisen darauf.',
    '',
  )
  const schonDa = new Map()
  for (const c of crates) {
    teile.push('-'.repeat(78), `${c.name} ${c.version} (${c.lizenz})`, `Quelle: https://crates.io/crates/${c.name}/${c.version}${c.quelle ? ` · ${c.quelle}` : ''}`)
    if (c.dateien.length === 0) {
      teile.push(`Kein Lizenztext im Crate. Lizenz laut Cargo.toml: ${c.lizenz}; Autoren: ${c.autoren.join(', ') || 'nicht angegeben'}.`, '')
      continue
    }
    for (const datei of c.dateien) {
      const text = readFileSync(join(c.ordner, datei), 'utf8').trim()
      const hash = createHash('sha256').update(text).digest('hex')
      const erstes = schonDa.get(hash)
      if (erstes) {
        teile.push(`${datei}: gleicher Text wie bei ${erstes}`)
      } else {
        schonDa.set(hash, `${c.name} ${c.version} (${datei})`)
        teile.push(`${datei}:`, '', text)
      }
    }
    teile.push('')
  }
  writeFileSync(join(ZIEL, 'LIZENZEN.txt'), teile.join('\r\n'))
  return crates.length
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
legeSaxonAb()
await legeAxiosAb()

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
const crates = schreibeLizenzen()
legeLaufzeitAb()

let groesse = 0
let dateien = 0
for (const e of readdirSync(ZIEL, { recursive: true, withFileTypes: true })) {
  if (!e.isFile()) continue
  groesse += statSync(join(e.parentPath, e.name)).size
  dateien++
}
const mb = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`
console.log(`Programm-Server gebaut in ${((performance.now() - beginn) / 1000).toFixed(1)} s: ${dateien} Dateien, ${mb(groesse)} in ${relative(WURZEL, ZIEL)}; Laufzeit Node ${process.version} (${mb(statSync(LAUFZEIT).size)}); ${pakete.size} npm-Pakete und ${crates} Rust-Crates in LIZENZEN.txt`)
