// Erzeugt die ZUGFeRD-/Factur-X-Testdateien in testdaten/zugferd/ (Spezifikation 9.1, Schritt 0.7).
// Grundlage ist die CII-Fassung von 01.01a aus der KoSIT-Testsuite (Apache-2.0); geändert wird nur
// BT-24 (Profilkennung), vermerkt im Dateikopf. Die PDFs sind keine PDF/A-Dateien, enthalten aber
// das XML wie ZUGFeRD als eingebettete Datei (Name-Tree /EmbeddedFiles, /AF).
//
//   node scripts/zugferd-testdaten.mjs        (setzt npm run artefakte voraus)
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { erzeugePdf } from '../src/testhilfen/pdf.ts'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const BASIS = join(WURZEL, 'testdaten', 'kosit', 'instances', 'standard', '01.01a-INVOICE_uncefact.xml')
const BASIS_SHA256 = createHash('sha256').update(await readFile(BASIS)).digest('hex')
const ZIEL = join(WURZEL, 'testdaten', 'zugferd')
const XRECHNUNG = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'

const original = await readFile(BASIS, 'utf8')
const NL = original.includes('\r\n') ? '\r\n' : '\n'
const DEKL = `<?xml version="1.0" encoding="UTF-8"?>${NL}`
if (!original.startsWith(DEKL)) throw new Error('Unerwartete XML-Deklaration')

/** CII mit anderer Profilkennung (BT-24) und Änderungsvermerk (Apache-2.0 § 4 b). */
function mitProfil(kennung, profilname) {
  const alt = `<ram:ID>${XRECHNUNG}</ram:ID>`
  if (original.split(alt).length !== 2) throw new Error('BT-24 nicht genau einmal gefunden')
  const vermerk =
    `<!-- Belegbrücke, Testdatei ${profilname}: BT-24 (GuidelineSpecifiedDocumentContextParameter/ID) geändert zu ${kennung}.${NL}` +
    `     Geändert gegenüber KoSIT XRechnung-Testsuite v2026-08-31, instances/standard/01.01a-INVOICE_uncefact.xml${NL}` +
    `     (SHA-256 ${BASIS_SHA256}), Lizenz Apache-2.0. Erzeugt mit scripts/zugferd-testdaten.mjs. -->${NL}`
  return new TextEncoder().encode(DEKL + vermerk + original.slice(DEKL.length).replace(alt, `<ram:ID>${kennung}</ram:ID>`))
}

const dateien = [
  {
    datei: 'zf-en16931.pdf',
    text: 'Testrechnung ZUGFeRD EN 16931 (Belegbruecke)',
    facturX: { dateiname: 'factur-x.xml', profil: 'EN 16931' },
    anhaenge: [{ name: 'factur-x.xml', bytes: mitProfil('urn:cen.eu:en16931:2017', 'EN 16931') }],
  },
  {
    datei: 'zf-basic.pdf',
    text: 'Testrechnung ZUGFeRD BASIC (Belegbruecke)',
    facturX: { dateiname: 'factur-x.xml', profil: 'BASIC' },
    anhaenge: [{ name: 'factur-x.xml', bytes: mitProfil('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic', 'BASIC') }],
  },
  {
    datei: 'zf-extended.pdf',
    text: 'Testrechnung ZUGFeRD EXTENDED (Belegbruecke)',
    facturX: { dateiname: 'factur-x.xml', profil: 'EXTENDED' },
    anhaenge: [{ name: 'factur-x.xml', bytes: mitProfil('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended', 'EXTENDED') }],
  },
  {
    // XML unverändert: Der Hash des eingebetteten XML ist der Hash der KoSIT-Datei
    datei: 'zf-xrechnung.pdf',
    text: 'Testrechnung ZUGFeRD XRECHNUNG (Belegbruecke)',
    facturX: { dateiname: 'xrechnung.xml', profil: 'XRECHNUNG' },
    anhaenge: [{ name: 'xrechnung.xml', bytes: new Uint8Array(await readFile(BASIS)) }],
  },
  {
    datei: 'zf-minimum.pdf',
    text: 'Testrechnung ZUGFeRD MINIMUM (Belegbruecke)',
    facturX: { dateiname: 'factur-x.xml', profil: 'MINIMUM' },
    anhaenge: [{ name: 'factur-x.xml', bytes: mitProfil('urn:factur-x.eu:1p0:minimum', 'MINIMUM') }],
  },
  {
    datei: 'pdf-ohne-xml.pdf',
    text: 'Testrechnung ohne eingebettetes XML (Belegbruecke)',
    anhaenge: [],
  },
]

await mkdir(ZIEL, { recursive: true })
for (const d of dateien) {
  const pdf = erzeugePdf({ text: d.text, anhaenge: d.anhaenge, facturX: d.facturX })
  await writeFile(join(ZIEL, d.datei), pdf)
  const xml = d.anhaenge[0]
  console.log(`${d.datei} (${pdf.length} Byte)${xml ? `, ${xml.name} SHA-256 ${createHash('sha256').update(xml.bytes).digest('hex')}` : ''}`)
}
