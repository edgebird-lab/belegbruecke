// Referenz für ZUGFeRD/Factur-X mit Mustang-CLI 2.26.0 (Java 21), Schritt 0.7.
//
// 1. Extraktion: Mustang holt das XML aus jeder PDF in testdaten/zugferd/; der SHA-256 ist die
//    Referenz für T-Z1 (die Belegbrücke liest mit pdf.js).
// 2. EXTENDED: Mustang-Beispieldateien des Profils EXTENDED werden NUR LOKAL geladen
//    (testdaten/lokal/, nicht im Repo; Herkunft teils FeRD, Lizenz unklar). Für jede Datei, die
//    Mustang als gültig bewertet, prüft die Belegbrücke mit CII-XSD D16B und CEN-Schematron.
//    Regeln, die dabei als Fehler auftreten, gehören in die customLevel-Liste des eigenen
//    Szenarios „Factur-X EXTENDED (CII)“ (Spezifikation R6 Punkt 1).
//
//   npm run artefakte -- --referenz && npm run sef && node scripts/referenz-mustang.mjs
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, openSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(join(WURZEL, 'package.json'))
const SaxonJS = require('saxon-js')
const { validateXML, memoryPages } = require('xmllint-wasm')
const JAR = join(WURZEL, 'vendor', 'werkzeuge', 'Mustang-CLI-2.26.0.jar')
const ZIEL = join(WURZEL, 'testdaten', 'referenz', 'mustang-2.26.0.json')
const LOKAL = join(WURZEL, 'testdaten', 'lokal', 'mustang-extended')
const EXTENDED = 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended'
const QUELLE = 'https://raw.githubusercontent.com/ZUGFeRD/mustangproject/core-2.26.0/library/src/test/resources/'
const BEISPIELE = [
  'factur-x-extended.xml',
  'Extended_fremdwaehrung.xml',
  'cii/extended_warenrechnung_based_doublecashdiscount.xml',
  'cii/UC11_F202600022_EXTENDED_FX_CII_BT-X-589Only_on_GROUP_Line.xml',
  'migration/reference/ZUGFeRD2_EXTENDED_Warenrechnung.xml',
  'subinvoicelines/Extended_Fallschutz-Set_SubInvoiceLine_Bsp5.xml',
  'subinvoicelines/Extended_SubInvoiceLines_Hardware_Bsp2.xml',
  'subinvoicelines/Extended___SubInvoiceLines_Buero_Material_Bsp3__.xml',
  'subinvoicelines/Extended___SubInvoiceLines_Kaffee_Bundle_Set_Bsp4__.xml',
  'subinvoicelines/ZUGFeRD_Extended__Abschlagsrechnung_SubInvoiceLine_u_LV_Nr_.xml',
]

if (!existsSync(JAR)) {
  console.error('Mustang-CLI fehlt. Erst: npm run artefakte -- --referenz')
  process.exit(1)
}
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const temp = await mkdtemp(join(tmpdir(), 'belegbruecke-mustang-'))
const leer = join(temp, 'leer.txt')
await writeFile(leer, '')

function mustang(args) {
  // stdin aus einer leeren Datei: Mustang fragt sonst fehlende Angaben interaktiv ab
  const stdin = openSync(leer, 'r')
  const r = spawnSync('java', ['-jar', JAR, ...args, '--disable-file-logging'], { stdio: [stdin, 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  closeSync(stdin)
  return r.stdout + r.stderr
}

function mustangPruefung(datei) {
  const ausgabe = mustang(['--action', 'validate', '--no-notices', '--source', datei])
  const xmlTeil = ausgabe.slice(ausgabe.indexOf('<validation'))
  const status = /<summary status="(\w+)"\/>\s*<\/validation>/.exec(xmlTeil)?.[1] ?? 'unbekannt'
  const fehler = [...new Set([...xmlTeil.matchAll(/<error\b[^>]*>[\s\S]*?\[ID ([^\]]+)\]/g)].map((t) => t[1]))].sort()
  return { status, fehler }
}

// ---------- 1. Extraktion der eigenen Testdateien ----------
const extraktion = {}
const zugferd = join(WURZEL, 'testdaten', 'zugferd')
for (const name of (await readdir(zugferd)).filter((n) => n.endsWith('.pdf')).sort()) {
  const aus = join(temp, `${name}.xml`)
  mustang(['--action', 'extract', '--source', join(zugferd, name), '--out', aus])
  if (!existsSync(aus)) {
    extraktion[name] = { xmlSha256: null }
    continue
  }
  const bytes = await readFile(aus)
  extraktion[name] = { xmlSha256: sha256(bytes), bytes: bytes.length, mustang: mustangPruefung(aus) }
  console.log(`${name}: XML ${bytes.length} Byte, Mustang ${extraktion[name].mustang.status} ${extraktion[name].mustang.fehler.join(' ')}`)
}

// ---------- 2. EXTENDED-Vergleich ----------
const KONF = join(WURZEL, 'vendor', 'konfiguration', 'resources')
const cenCii = JSON.parse(await readFile(join(WURZEL, 'vendor', 'sef', 'EN16931-CII-validation.sef.json'), 'utf8'))
const ciiXsd = []
for (const e of await readdir(join(KONF, 'cii', '16b', 'xsd'), { withFileTypes: true })) {
  if (e.isFile()) ciiXsd.push({ fileName: `cii/${e.name}`, contents: await readFile(join(e.parentPath, e.name)) })
}
const stufe = (flag, role) => {
  const w = [flag, role].filter(Boolean)
  if (w.some((x) => ['fatal', 'error'].includes(x))) return 'error'
  if (w.some((x) => ['warning', 'warn'].includes(x))) return 'warning'
  if (w.some((x) => ['information', 'info'].includes(x))) return 'information'
  return 'error'
}
await mkdir(LOKAL, { recursive: true })
const vergleich = {}
const customLevel = new Set()
for (const pfad of BEISPIELE) {
  const datei = join(LOKAL, pfad.replaceAll('/', '__'))
  if (!existsSync(datei)) {
    const antwort = await fetch(QUELLE + pfad)
    if (!antwort.ok) {
      vergleich[pfad] = { fehler: `HTTP ${antwort.status}` }
      continue
    }
    await writeFile(datei, new Uint8Array(await antwort.arrayBuffer()))
  }
  const bytes = await readFile(datei)
  const text = bytes.toString('utf8')
  const profil = /<ram:GuidelineSpecifiedDocumentContextParameter>\s*<ram:ID>([^<]*)<\/ram:ID>/.exec(text)?.[1] ?? null
  if (profil !== EXTENDED) {
    vergleich[pfad] = { profil, uebersprungen: 'kein EXTENDED' }
    continue
  }
  const m = mustangPruefung(datei)
  const haupt = 'cii/CrossIndustryInvoice_100pD16B.xsd'
  const xsd = await validateXML({
    xml: [{ fileName: 'rechnung.xml', contents: bytes }],
    schema: [ciiXsd.find((f) => f.fileName === haupt)],
    preload: ciiXsd.filter((f) => f.fileName !== haupt),
    maxMemoryPages: 256 * memoryPages.MiB,
  })
  const doc = await SaxonJS.getResource({ text, type: 'xml' })
  let cen = []
  let verarbeitungsfehler = null
  try {
    const svrl = SaxonJS.transform({ stylesheetInternal: cenCii, sourceNode: doc, destination: 'document' }, 'sync').principalResult
    const meldungen = SaxonJS.XPath.evaluate('//(svrl:failed-assert|svrl:successful-report)', svrl, { namespaceContext: { svrl: 'http://purl.oclc.org/dsdl/svrl' }, resultForm: 'array' })
    cen = [...new Set(meldungen.map((a) => `${a.getAttribute('id') || 'UNSPECIFIC'}:${stufe(a.getAttribute('flag'), a.getAttribute('role'))}`))].sort()
  } catch (e) {
    // Wie beim KoSIT-Validator ein Verarbeitungsfehler: Die Prüfung liefert kein SVRL
    verarbeitungsfehler = `${e.code ?? ''} ${String(e.message).slice(0, 200)}`.trim()
  }
  const cenFehler = cen.filter((x) => x.endsWith(':error')).map((x) => x.split(':')[0])
  vergleich[pfad] = {
    sha256: sha256(bytes),
    mustang: m.status,
    mustangFehler: m.fehler,
    xsdD16B: xsd.valid,
    ...(xsd.valid ? {} : { xsdFehler: xsd.errors.slice(0, 5).map((e) => e.message.slice(0, 200)) }),
    cen,
    ...(verarbeitungsfehler ? { verarbeitungsfehler } : {}),
  }
  if (m.status === 'valid') for (const id of cenFehler) customLevel.add(id)
  console.log(`${pfad}: Mustang ${m.status}, XSD D16B ${xsd.valid ? 'gültig' : 'ungültig'}, CEN-Fehler ${cenFehler.join(' ') || '–'}${verarbeitungsfehler ? `, Verarbeitungsfehler ${verarbeitungsfehler.slice(0, 90)}` : ''}`)
}

await rm(temp, { recursive: true, force: true })
const snapshot = {
  formatVersion: 1,
  hinweis:
    'Referenz mit Mustang-CLI 2.26.0 (scripts/referenz-mustang.mjs). extraktion: SHA-256 des von Mustang extrahierten XML je Testdatei. extended: Mustang-Beispiele (nur lokal geladen, nicht im Repo) mit Bewertung durch Mustang und CEN-Meldungen der Belegbrücke. customLevelWarning: CEN-Regeln, die bei von Mustang als gültig bewerteten EXTENDED-Dateien als Fehler auftreten.',
  mustang: '2.26.0',
  java: spawnSync('java', ['-version'], { encoding: 'utf8' }).stderr.split('\n')[0].trim(),
  extraktion,
  extended: vergleich,
  customLevelWarning: [...customLevel].sort(),
}
await writeFile(ZIEL, JSON.stringify(snapshot, null, 2) + '\n')
console.log(`customLevel warning: ${snapshot.customLevelWarning.join(' ') || '(leer)'}`)
console.log(`Geschrieben: ${relative(WURZEL, ZIEL)}`)
