// Kompiliert die benötigten XSLT der Prüfartefakte mit xslt3 (Saxonica, ohne Java) zu SEF.
// Die SEF-Dateien sind abgeleitete Werke und behalten die Lizenz ihrer Quelle (vendor/LIZENZEN.md).
// Sie sind relokierbar (-relocate:on): Die Ansicht setzt beim Ausführen die Basis-URI auf die
// Original-XSLT, damit unparsed-text() und doc() CSS, JavaScript und Übersetzungen dort finden.
//
//   node scripts/sef.mjs           kompiliert nur, was fehlt oder älter als die Quelle ist
//   node scripts/sef.mjs --neu     kompiliert alles neu
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const ZIEL = join(WURZEL, 'vendor', 'sef')
const XSLT3 = join(WURZEL, 'node_modules', 'xslt3', 'xslt3.js')
const NEU = process.argv.includes('--neu')

/** Pfade relativ zum Projekt; die Namen der SEF-Dateien folgen dem Dateinamen der Quelle. */
export const QUELLEN = [
  'vendor/konfiguration/resources/ubl/2.1/xsl/EN16931-UBL-validation.xsl',
  'vendor/konfiguration/resources/cii/16b/xsl/EN16931-CII-validation.xsl',
  'vendor/konfiguration/resources/xrechnung/3.0.2/xsl/XRechnung-UBL-validation.xsl',
  'vendor/konfiguration/resources/xrechnung/3.0.2/xsl/XRechnung-CII-validation.xsl',
  'vendor/visualisierung/xsl/ubl-invoice-xr.xsl',
  'vendor/visualisierung/xsl/ubl-creditnote-xr.xsl',
  'vendor/visualisierung/xsl/cii-xr.xsl',
  'vendor/visualisierung/xsl/xrechnung-html.xsl',
]

function kompiliere(quelle) {
  const sef = join(ZIEL, basename(quelle).replace(/\.xsl$/, '.sef.json'))
  const quellpfad = join(WURZEL, quelle)
  if (!existsSync(quellpfad)) return Promise.reject(new Error(`${quelle} fehlt. Erst: npm run artefakte`))
  if (!NEU && existsSync(sef) && statSync(sef).mtimeMs >= statSync(quellpfad).mtimeMs) return Promise.resolve({ quelle, sef, uebersprungen: true })
  const start = performance.now()
  return new Promise((ok, fehler) => {
    const p = spawn(process.execPath, [XSLT3, `-xsl:${quellpfad}`, `-export:${sef}`, '-nogo', '-relocate:on'], { stdio: ['ignore', 'pipe', 'pipe'] })
    let ausgabe = ''
    p.stdout.on('data', (d) => (ausgabe += d))
    p.stderr.on('data', (d) => (ausgabe += d))
    p.on('close', (code) => {
      if (code === 0 && existsSync(sef)) ok({ quelle, sef, sekunden: (performance.now() - start) / 1000 })
      else fehler(new Error(`${quelle}: xslt3 endete mit ${code}\n${ausgabe}`))
    })
  })
}

await mkdir(ZIEL, { recursive: true })
const warteschlange = [...QUELLEN]
const ergebnisse = []
async function arbeiter() {
  while (warteschlange.length) ergebnisse.push(await kompiliere(warteschlange.shift()))
}
await Promise.all([arbeiter(), arbeiter(), arbeiter()])
for (const e of ergebnisse) {
  console.log(e.uebersprungen ? `ok        ${basename(e.sef)}` : `kompiliert ${basename(e.sef)} in ${e.sekunden.toFixed(1)} s`)
}
// Verzeichnis der SEF-Dateien mit Herkunft, für den Prüfbericht und die Fehlersuche
const verzeichnis = {}
for (const quelle of QUELLEN) {
  const sef = join(ZIEL, basename(quelle).replace(/\.xsl$/, '.sef.json'))
  verzeichnis[basename(sef)] = { quelle, bytes: statSync(sef).size }
}
const xslt3Version = JSON.parse(await readFile(join(WURZEL, 'node_modules', 'xslt3', 'package.json'), 'utf8')).version
await writeFile(join(ZIEL, 'verzeichnis.json'), JSON.stringify({ xslt3: xslt3Version, dateien: verzeichnis }, null, 2))
