// Erzeugt die Mutationen M1 bis M8 (Spezifikation 9.1) aus der KoSIT-Testdatei
// instances/standard/01.01a-INVOICE_ubl.xml. Jede Datei nennt ihre Änderung im Dateikopf
// (Apache-2.0 § 4 b). Die Ergebnisse liegen im Repo; das Skript dokumentiert, wie sie entstehen.
//
//   node scripts/mutationen.mjs        (setzt npm run artefakte voraus)
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const BASIS = join(WURZEL, 'testdaten', 'kosit', 'instances', 'standard', '01.01a-INVOICE_ubl.xml')
const BASIS_SHA256 = '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb'
const ZIEL = join(WURZEL, 'testdaten', 'mutationen')

const bytes = await readFile(BASIS)
const hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== BASIS_SHA256) throw new Error(`Basisdatei hat SHA-256 ${hash}, erwartet ${BASIS_SHA256}`)
const original = bytes.toString('utf8')
// Die Testdateien haben CRLF; alle Muster unten verwenden \n und werden an das Zeilenende angepasst
const NL = original.includes('\r\n') ? '\r\n' : '\n'
const z = (s) => s.replaceAll('\n', NL)
const DEKL = z('<?xml version="1.0" encoding="UTF-8"?>\n')
if (!original.startsWith(DEKL)) throw new Error('Unerwartete XML-Deklaration')
const rumpf = original.slice(DEKL.length)

/** Ersetzt genau ein Vorkommen; sonst Abbruch, damit eine geänderte Basisdatei auffällt. */
function ersetzeEinmal(text, altRoh, neuRoh) {
  const alt = z(altRoh)
  const neu = z(neuRoh)
  const erstes = text.indexOf(alt)
  if (erstes < 0 || text.indexOf(alt, erstes + 1) >= 0) throw new Error(`Nicht genau einmal gefunden: ${alt}`)
  return text.slice(0, erstes) + neu + text.slice(erstes + alt.length)
}

function ersetzeAlle(text, alt, neu, anzahl) {
  const teile = text.split(z(alt))
  if (teile.length - 1 !== anzahl) throw new Error(`${alt}: ${teile.length - 1}-mal statt ${anzahl}-mal gefunden`)
  return teile.join(z(neu))
}

function kopf(id, aenderung) {
  return z(
    `<!-- Belegbrücke, Testmutation ${id}: ${aenderung}\n` +
    `     Geändert gegenüber KoSIT XRechnung-Testsuite v2026-08-31, instances/standard/01.01a-INVOICE_ubl.xml\n` +
    `     (SHA-256 ${BASIS_SHA256}), Lizenz Apache-2.0. Erzeugt mit scripts/mutationen.mjs. -->\n`
  )
}

const TAX_TOTAL_ALT = '<cac:TaxTotal>\n        <cbc:TaxAmount currencyID="EUR">22.04</cbc:TaxAmount>'

const mutationen = [
  {
    id: 'M1',
    datei: 'M1-steuerbetrag.xml',
    aenderung: 'Dokument-Steuerbetrag cac:TaxTotal/cbc:TaxAmount 22.04 -> 22.05',
    text: () => ersetzeEinmal(rumpf, TAX_TOTAL_ALT, '<cac:TaxTotal>\n        <cbc:TaxAmount currencyID="EUR">22.05</cbc:TaxAmount>'),
  },
  {
    id: 'M2',
    datei: 'M2-ohne-kaeuferreferenz.xml',
    aenderung: 'cbc:BuyerReference entfernt',
    text: () => ersetzeEinmal(rumpf, '    <cbc:BuyerReference>04011000-12345-03</cbc:BuyerReference>\n', ''),
  },
  {
    id: 'M3',
    datei: 'M3-unbekannte-kennung.xml',
    aenderung: 'cbc:CustomizationID = urn:beispiel:unbekannt',
    text: () =>
      ersetzeEinmal(
        rumpf,
        '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>',
        '<cbc:CustomizationID>urn:beispiel:unbekannt</cbc:CustomizationID>',
      ),
  },
  {
    id: 'M4',
    datei: 'M4-externe-entity.xml',
    aenderung: 'DOCTYPE mit externer Entity auf file:///C:/Windows/win.ini, verwendet in cbc:Note',
    vorRumpf: '<!DOCTYPE ubl:Invoice [\n  <!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">\n]>\n',
    text: () =>
      ersetzeEinmal(
        rumpf,
        '<cbc:Note>#ADU#Es gelten unsere Allgem. Geschäftsbedingungen, die Sie unter […] finden.</cbc:Note>',
        '<cbc:Note>&xxe;</cbc:Note>',
      ),
  },
  {
    id: 'M5',
    datei: 'M5-abgeschnitten.xml',
    aenderung: 'Datei nach 1000 Byte abgeschnitten',
    abschneiden: 1000,
    text: () => rumpf,
  },
  {
    id: 'M6',
    datei: 'M6-falsches-element.xml',
    aenderung: 'cbc:IssueDate -> cbc:IssueDat',
    text: () => ersetzeEinmal(rumpf, '<cbc:IssueDate>2016-04-04</cbc:IssueDate>', '<cbc:IssueDat>2016-04-04</cbc:IssueDat>'),
  },
  {
    id: 'M7',
    datei: 'M7-einheit-qqq.xml',
    aenderung: 'unitCode der ersten Position XPP -> QQQ (nicht in der Codeliste; XYZ steht darin)',
    text: () =>
      ersetzeEinmal(
        rumpf,
        '<cbc:InvoicedQuantity unitCode="XPP">1</cbc:InvoicedQuantity>\n        <cbc:LineExtensionAmount currencyID="EUR">288.79</cbc:LineExtensionAmount>',
        '<cbc:InvoicedQuantity unitCode="QQQ">1</cbc:InvoicedQuantity>\n        <cbc:LineExtensionAmount currencyID="EUR">288.79</cbc:LineExtensionAmount>',
      ),
  },
  {
    id: 'M8',
    datei: 'M8-steuersatz-16.xml',
    // 314,86 € × 16 % = 50,3776 € → 50,38 €; Brutto 314,86 € + 50,38 € = 365,24 €
    aenderung: 'Steuersatz 7 -> 16, Steuerbetrag 22.04 -> 50.38, Brutto und Zahlbetrag 336.9 -> 365.24',
    text: () => {
      let t = ersetzeAlle(rumpf, '<cbc:Percent>7</cbc:Percent>', '<cbc:Percent>16</cbc:Percent>', 3)
      t = ersetzeAlle(t, '<cbc:TaxAmount currencyID="EUR">22.04</cbc:TaxAmount>', '<cbc:TaxAmount currencyID="EUR">50.38</cbc:TaxAmount>', 2)
      t = ersetzeEinmal(t, '<cbc:TaxInclusiveAmount currencyID="EUR">336.9</cbc:TaxInclusiveAmount>', '<cbc:TaxInclusiveAmount currencyID="EUR">365.24</cbc:TaxInclusiveAmount>')
      t = ersetzeEinmal(t, '<cbc:PayableAmount currencyID="EUR">336.9</cbc:PayableAmount>', '<cbc:PayableAmount currencyID="EUR">365.24</cbc:PayableAmount>')
      return t
    },
  },
]

await mkdir(ZIEL, { recursive: true })
for (const m of mutationen) {
  let inhalt = Buffer.from(DEKL + kopf(m.id, m.aenderung) + z(m.vorRumpf ?? '') + m.text(), 'utf8')
  if (m.abschneiden) inhalt = inhalt.subarray(0, m.abschneiden)
  await writeFile(join(ZIEL, m.datei), inhalt)
  console.log(`${m.id} ${m.datei} (${inhalt.length} Byte)`)
}
