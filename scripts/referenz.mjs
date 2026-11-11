// Referenzlauf mit dem KoSIT-Validator 1.6.3 (Java 21) über alle Testdateien der KoSIT-Testsuite
// und die Mutationen M1 bis M8. Ergebnis: testdaten/referenz/kosit-1.6.3.json, gegen den die
// Prüfpipeline der Belegbrücke in den Tests verglichen wird (T-V1). Java braucht nur dieses Skript.
//
//   npm run artefakte -- --referenz && npm run referenz
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const JAR = join(WURZEL, 'vendor', 'werkzeuge', 'validator-1.6.3-standalone.jar')
const KONFIGURATION = join(WURZEL, 'vendor', 'konfiguration')
const INSTANZEN = join(WURZEL, 'testdaten', 'kosit', 'instances')
const MUTATIONEN = join(WURZEL, 'testdaten', 'mutationen')
const ZIEL = join(WURZEL, 'testdaten', 'referenz', 'kosit-1.6.3.json')

if (!existsSync(JAR)) {
  console.error('Validator fehlt. Erst: npm run artefakte -- --referenz')
  process.exit(1)
}

async function xmlDateien(ordner) {
  const ergebnis = []
  for (const eintrag of await readdir(ordner, { withFileTypes: true, recursive: true })) {
    if (eintrag.isFile() && eintrag.name.endsWith('.xml')) ergebnis.push(join(eintrag.parentPath, eintrag.name))
  }
  return ergebnis.sort()
}

const dateien = [...(await xmlDateien(INSTANZEN)), ...(await xmlDateien(MUTATIONEN))]
const namen = new Set(dateien.map((d) => basename(d)))
if (namen.size !== dateien.length) throw new Error('Dateinamen sind nicht eindeutig; Berichte würden sich überschreiben')

const ausgabe = await mkdtemp(join(tmpdir(), 'belegbruecke-referenz-'))
// Auch bei einem Abbruch aufräumen
process.on('exit', () => rmSync(ausgabe, { recursive: true, force: true }))
// Der Validator prüft beim Start, ob stdin eine Pipe ist; unter Windows scheitert das an der
// Null-Eingabe. Eine leere Datei als stdin umgeht das.
const leer = join(ausgabe, 'leer.txt')
await writeFile(leer, '')
const { openSync, closeSync } = await import('node:fs')
const stdin = openSync(leer, 'r')
const lauf = spawnSync('java', ['-jar', JAR, '-s', join(KONFIGURATION, 'scenarios.xml'), '-r', KONFIGURATION, '-o', ausgabe, ...dateien], {
  stdio: [stdin, 'pipe', 'pipe'],
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
closeSync(stdin)
if (lauf.error) throw lauf.error
const versionszeile = /KoSIT Validator version (\S+)/.exec(lauf.stdout)?.[1] ?? 'unbekannt'

const attribute = (text) => Object.fromEntries([...text.matchAll(/([\w:]+)="([^"]*)"/g)].map((t) => [t[1], t[2]]))
const entities = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

const ergebnis = {}
for (const datei of dateien) {
  const berichtsdatei = join(ausgabe, basename(datei).replace(/\.xml$/, '-report.xml'))
  const schluessel = datei.startsWith(INSTANZEN) ? relative(INSTANZEN, datei).replaceAll('\\', '/') : `mutationen/${basename(datei)}`
  if (!existsSync(berichtsdatei)) {
    ergebnis[schluessel] = { bericht: false }
    continue
  }
  const xml = await readFile(berichtsdatei, 'utf8')
  // Alles ab der Bewertung ist HTML-Erklärung; Meldungen stehen davor
  const bewertungAb = xml.indexOf('<rep:assessment>')
  const kopf = bewertungAb >= 0 ? xml.slice(0, bewertungAb) : xml
  const szenario = /<rep:scenarioMatched>\s*<s:scenario>[\s\S]*?<s:name>([\s\S]*?)<\/s:name>/.exec(kopf)?.[1]?.trim() ?? null
  const schritte = {}
  for (const t of kopf.matchAll(/<rep:validationStepResult\b([^>]*?)\/?>/g)) {
    const a = attribute(t[1])
    schritte[a.id] = a.valid === 'true'
  }
  const meldungen = []
  const xsd = []
  for (const t of kopf.matchAll(/<rep:message\b([^>]*)>([\s\S]*?)<\/rep:message>/g)) {
    const a = attribute(t[1])
    meldungen.push(`${a.code}:${a.level}`)
    if (a.id?.startsWith('val-xsd') || a.id?.startsWith('val-xml')) {
      xsd.push({ schritt: a.id.split('.')[0], zeile: a.lineNumber ? Number(a.lineNumber) : null, spalte: a.columnNumber ? Number(a.columnNumber) : null, code: a.code, text: entities(t[2]).trim() })
    }
  }
  const angenommen = /<rep:assessment>\s*<rep:accept>/.test(xml)
  ergebnis[schluessel] = {
    szenario,
    angenommen,
    schritte,
    meldungen: [...new Set(meldungen)].sort(),
    ...(xsd.length ? { xmlMeldungen: xsd } : {}),
  }
}

await rm(ausgabe, { recursive: true, force: true })
const snapshot = {
  formatVersion: 1,
  hinweis: 'Referenzlauf mit dem KoSIT-Validator (scripts/referenz.mjs). meldungen = Menge aus Regel-ID und Stufe, wie der Validator sie meldet (vor customLevel); angenommen = Bewertung des Validators (nach customLevel).',
  validator: versionszeile,
  konfiguration: 'xrechnung-3.0.2-validator-configuration-2026-08-31',
  java: spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr.split('\n')[0].trim(),
  dateien: ergebnis,
}
await mkdir(join(WURZEL, 'testdaten', 'referenz'), { recursive: true })
await writeFile(ZIEL, JSON.stringify(snapshot, null, 2) + '\n')

const liste = Object.entries(ergebnis)
const instanzen = liste.filter(([k]) => !k.startsWith('mutationen/'))
console.log(`Validator ${versionszeile}: ${liste.length} Dateien, davon ${instanzen.length} aus der Testsuite`)
console.log(`Testsuite angenommen: ${instanzen.filter(([, e]) => e.angenommen).length} von ${instanzen.length}`)
for (const [k, e] of liste.filter(([k]) => k.startsWith('mutationen/'))) {
  console.log(`${k}: ${e.angenommen ? 'angenommen' : 'abgelehnt'}, Szenario ${e.szenario ?? '–'}, ${e.meldungen.join(' ')}`)
}
console.log(`Geschrieben: ${relative(WURZEL, ZIEL)}`)
