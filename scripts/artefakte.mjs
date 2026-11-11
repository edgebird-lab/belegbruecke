// Lädt die offiziellen Prüfartefakte (KoSIT, CEN über die KoSIT-Konfiguration) und die
// Lizenztexte, prüft SHA-256 und entpackt die Archive unverändert.
//
//   node scripts/artefakte.mjs              Laufzeit- und Testartefakte
//   node scripts/artefakte.mjs --referenz   zusätzlich KoSIT-Validator und Mustang-CLI (Java, nur Referenzlauf)
//
// Bereits vorhandene Dateien mit passender Prüfsumme werden nicht erneut geladen.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync } from 'fflate'

const WURZEL = fileURLToPath(new URL('..', import.meta.url))
const LISTE = JSON.parse(await readFile(join(WURZEL, 'vendor', 'artefakte.json'), 'utf8'))
const MIT_REFERENZ = process.argv.includes('--referenz')
const MARKE = '.artefakt.json'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function lade(url, erwartet) {
  const antwort = await fetch(url, { redirect: 'follow' })
  if (!antwort.ok) throw new Error(`${url}: HTTP ${antwort.status}`)
  const bytes = new Uint8Array(await antwort.arrayBuffer())
  const ist = sha256(bytes)
  if (ist !== erwartet) throw new Error(`${url}: Prüfsumme ${ist} statt ${erwartet}`)
  return bytes
}

/** Datei aus vendor/downloads holen oder laden; die Prüfsumme wird immer geprüft. */
async function holeDownload(artefakt) {
  const datei = join(WURZEL, 'vendor', 'downloads', artefakt.url.split('/').pop())
  if (existsSync(datei)) {
    const bytes = new Uint8Array(await readFile(datei))
    if (sha256(bytes) === artefakt.sha256) return { datei, bytes, neu: false }
  }
  const bytes = await lade(artefakt.url, artefakt.sha256)
  await mkdir(dirname(datei), { recursive: true })
  await writeFile(datei, bytes)
  return { datei, bytes, neu: true }
}

/** Entpackt ein ZIP nach `ziel`; Einträge mit Pfaden außerhalb des Ziels werden abgelehnt. */
async function entpacke(bytes, ziel) {
  const eintraege = unzipSync(bytes)
  await rm(ziel, { recursive: true, force: true })
  let anzahl = 0
  for (const [name, inhalt] of Object.entries(eintraege)) {
    if (name.endsWith('/')) continue
    const pfad = normalize(join(ziel, name))
    const rel = relative(ziel, pfad)
    if (rel.startsWith('..') || rel.includes(`..${sep}`) || /^[a-zA-Z]:/.test(rel)) throw new Error(`Unzulässiger Pfad im Archiv: ${name}`)
    await mkdir(dirname(pfad), { recursive: true })
    await writeFile(pfad, inhalt)
    anzahl++
  }
  return anzahl
}

let fehler = 0
for (const artefakt of LISTE.artefakte) {
  if (artefakt.zweck === 'referenz' && !MIT_REFERENZ) continue
  try {
    const { bytes, neu } = await holeDownload(artefakt)
    if (artefakt.entpacken) {
      const ziel = join(WURZEL, artefakt.entpacken)
      const marke = join(ziel, MARKE)
      const vorhanden = existsSync(marke) ? JSON.parse(await readFile(marke, 'utf8')).sha256 : null
      if (vorhanden === artefakt.sha256) {
        console.log(`ok       ${artefakt.id} ${artefakt.version}`)
      } else {
        const anzahl = await entpacke(bytes, ziel)
        await writeFile(marke, JSON.stringify({ id: artefakt.id, version: artefakt.version, sha256: artefakt.sha256 }, null, 2))
        console.log(`entpackt ${artefakt.id} ${artefakt.version}: ${anzahl} Dateien nach ${artefakt.entpacken}${neu ? ' (neu geladen)' : ''}`)
      }
    } else if (artefakt.ablage) {
      const ziel = join(WURZEL, artefakt.ablage)
      const gleich = existsSync(ziel) && sha256(new Uint8Array(await readFile(ziel))) === artefakt.sha256
      if (!gleich) {
        await mkdir(dirname(ziel), { recursive: true })
        await copyFile(join(WURZEL, 'vendor', 'downloads', artefakt.url.split('/').pop()), ziel)
      }
      console.log(`${gleich ? 'ok      ' : 'abgelegt'} ${artefakt.id} ${artefakt.version}`)
    }
  } catch (e) {
    fehler++
    console.error(`FEHLER   ${artefakt.id}: ${e.message}`)
  }
}

for (const text of LISTE.lizenztexte) {
  const ziel = join(WURZEL, text.datei)
  try {
    if (existsSync(ziel) && sha256(new Uint8Array(await readFile(ziel))) === text.sha256) continue
    const bytes = await lade(text.url, text.sha256)
    await mkdir(dirname(ziel), { recursive: true })
    await writeFile(ziel, bytes)
    console.log(`abgelegt ${text.datei}`)
  } catch (e) {
    fehler++
    console.error(`FEHLER   ${text.datei}: ${e.message}`)
  }
}

if (fehler) {
  console.error(`${fehler} Artefakt(e) fehlerhaft.`)
  process.exit(1)
}
