// Erzeugt die Testdateien des Fallbeispiels „Oktober“ (Spezifikation 9.1, Schritt 6.3) aus der
// KoSIT-Testsuite: gleiche Rechnungen, nur das Rechnungsdatum (BT-2) liegt im Oktober 2026. Jede Datei
// nennt ihre Änderung im Dateikopf (Apache-2.0 § 4 b). Die Ergebnisse liegen im Repo.
//
//   node scripts/fallbeispiel.mjs        (setzt npm run artefakte voraus)
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const QUELLE = join(WURZEL, 'testdaten', 'kosit', 'instances')
const ZIEL = join(WURZEL, 'testdaten', 'fallbeispiel')

/** Nr., Quelle, neues Rechnungsdatum */
export const OKTOBER = [
  ['01', 'standard/01.01a-INVOICE_ubl.xml', '2026-10-01'],
  ['02', 'standard/01.02a-INVOICE_ubl.xml', '2026-10-02'],
  ['03', 'standard/01.03a-INVOICE_uncefact.xml', '2026-10-05'],
  ['04', 'standard/01.07a-INVOICE_ubl.xml', '2026-10-06'],
  ['05', 'standard/01.09a-INVOICE_ubl.xml', '2026-10-08'],
  ['06', 'standard/02.01a-INVOICE_ubl.xml', '2026-10-12'],
  ['07', 'standard/03.01a-INVOICE_ubl.xml', '2026-10-14'],
  ['08', 'standard/01.04a-INVOICE_ubl.xml', '2026-10-15'],
  ['09', 'standard/01.21a-INVOICE_ubl.xml', '2026-10-20'],
  ['10', 'standard/01.20a-INVOICE_ubl.xml', '2026-10-22'],
  ['11', 'standard/01.01a-INVOICE_uncefact.xml', '2026-10-01'],
]

function datumErsetzen(text, rel, datum) {
  if (rel.endsWith('_ubl.xml')) {
    const re = /<cbc:IssueDate>\d{4}-\d{2}-\d{2}<\/cbc:IssueDate>/
    if (!re.test(text)) throw new Error(`${rel}: cbc:IssueDate fehlt`)
    return text.replace(re, `<cbc:IssueDate>${datum}</cbc:IssueDate>`)
  }
  const re = /(<ram:IssueDateTime>\s*<udt:DateTimeString format="102">)\d{8}(<\/udt:DateTimeString>)/
  if (!re.test(text)) throw new Error(`${rel}: ram:IssueDateTime fehlt`)
  return text.replace(re, `$1${datum.replaceAll('-', '')}$2`)
}

await mkdir(ZIEL, { recursive: true })
for (const [nr, rel, datum] of OKTOBER) {
  const text = await readFile(join(QUELLE, rel), 'utf8')
  const dekl = /^<\?xml[^>]*\?>\r?\n/.exec(text)
  if (!dekl) throw new Error(`${rel}: XML-Deklaration fehlt`)
  const nl = dekl[0].endsWith('\r\n') ? '\r\n' : '\n'
  const kopf = `<!-- Belegbrücke, Fallbeispiel Oktober Nr. ${nr}: Rechnungsdatum (BT-2) auf ${datum} gesetzt, sonst unverändert.${nl}     Geändert gegenüber KoSIT XRechnung-Testsuite v2026-08-31, instances/${rel} (Apache-2.0). -->${nl}`
  const neu = dekl[0] + kopf + datumErsetzen(text.slice(dekl[0].length), rel, datum)
  const name = `${nr}-${rel.split('/')[1]}`
  await writeFile(join(ZIEL, name), neu)
  console.log(`testdaten/fallbeispiel/${name}`)
}
