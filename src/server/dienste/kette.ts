/**
 * Kettenprüfung (R18): Nummern, Verkettung, Hashes, dann die Dateien unter originale/ und
 * berichte/ gegen die Werte aus den Protokolleinträgen, optional Kettenanker. Ergebnis als
 * Kettenbericht plus Protokolleintrag `kette-geprueft`.
 */
import { formatDatum } from '../../fach/anzeige.ts'
import { belegnummer } from '../../fach/dubletten.ts'
import { pruefeKette, type Kettenanker } from '../../fach/hashkette.ts'
import type { Akteur, Protokolleintrag } from '../../fach/typen.ts'
import type { Ablage } from '../speicher/ablage.ts'
import type { Datenbank } from '../speicher/db.ts'
import { sha256, type Protokoll } from '../speicher/protokoll.ts'

export interface Kettenbericht {
  geprueftAm: string
  ok: boolean
  eintraege: number
  dateien: number
  fehler: string[]
  letzterEintrag: { nr: number; hash: string } | null
  anker: Kettenanker[]
  dauerMs: number
}

interface ErwarteteDatei {
  pfad: string
  sha256: string
  beschreibung: string
}

/** Welche Dateien die Einträge mit welchem Hash erwarten (R17 Punkt 5: eingang, pruefung). */
function erwarteteDateien(eintraege: Protokolleintrag[], belegnr: (id: string | null) => string): ErwarteteDatei[] {
  const liste: ErwarteteDatei[] = []
  for (const e of eintraege) {
    const d = e.daten as Record<string, unknown>
    if (e.aktion === 'eingang' && typeof d.pfad === 'string' && typeof d.sha256 === 'string') {
      liste.push({ pfad: d.pfad, sha256: d.sha256, beschreibung: `Original von ${belegnr(e.belegId)}` })
    }
    if (e.aktion === 'eingang' && typeof d.emlPfad === 'string' && typeof d.emlSha256 === 'string') {
      liste.push({ pfad: d.emlPfad, sha256: d.emlSha256, beschreibung: `E-Mail zu ${belegnr(e.belegId)}` })
    }
    if (e.aktion === 'pruefung' && typeof d.bericht === 'string' && typeof d.berichtSha256 === 'string') {
      liste.push({ pfad: d.bericht, sha256: d.berichtSha256, beschreibung: `Prüfbericht von ${belegnr(e.belegId)}` })
    }
  }
  return liste
}

function sammle(fehler: string[], liste: string[]) {
  if (liste.length === 0) return
  fehler.push(liste.length === 1 ? liste[0] : `${liste[0]} (und ${liste.length - 1} weitere)`)
}

export async function pruefeArchiv(
  db: Datenbank,
  ablage: Ablage,
  protokoll: Protokoll,
  optionen: { anker?: Kettenanker[]; akteur?: Akteur; uhr?: () => Date } = {},
): Promise<Kettenbericht> {
  const start = performance.now()
  const uhr = optionen.uhr ?? (() => new Date())
  const anker = optionen.anker ?? []
  const eintraege = protokoll.alle()
  const fehler = pruefeKette(eintraege, sha256, anker).map((f) => f.text)

  const nummern = new Map(db.alle<{ id: string; laufnummer: number }>('SELECT id, laufnummer FROM belege').map((b) => [b.id, b.laufnummer]))
  const belegnr = (id: string | null) => (id && nummern.has(id) ? belegnummer(nummern.get(id)!) : (id ?? 'unbekanntem Beleg'))
  const erwartet = erwarteteDateien(eintraege, belegnr)
  const verandert: string[] = []
  const fehlend: string[] = []
  for (const d of erwartet) {
    const ist = await ablage.hash(d.pfad).catch(() => null)
    if (ist === null) fehlend.push(`${d.beschreibung} fehlt (${d.pfad})`)
    else if (ist !== d.sha256) verandert.push(`${d.beschreibung} verändert`)
  }
  sammle(fehler, verandert)
  sammle(fehler, fehlend)
  const bekannt = new Set(erwartet.map((d) => d.pfad))
  const vorhanden = [...(await ablage.alleDateien('originale')), ...(await ablage.alleDateien('berichte'))]
  sammle(
    fehler,
    vorhanden.filter((p) => !bekannt.has(p)).map((p) => `Datei ohne Protokolleintrag: ${p}`),
  )

  const bericht: Kettenbericht = {
    geprueftAm: uhr().toISOString(),
    ok: fehler.length === 0,
    eintraege: eintraege.length,
    dateien: vorhanden.length,
    fehler,
    letzterEintrag: eintraege.length ? { nr: eintraege.at(-1)!.nr, hash: eintraege.at(-1)!.hash } : null,
    anker,
    dauerMs: Math.round(performance.now() - start),
  }
  protokoll.anhaengen({
    akteur: optionen.akteur ?? { art: 'system', dienst: 'pruefung' },
    aktion: 'kette-geprueft',
    belegId: null,
    daten: { ok: bericht.ok, eintraege: bericht.eintraege, dateien: bericht.dateien, fehler: bericht.fehler, letzterEintrag: bericht.letzterEintrag },
  })
  return bericht
}

/** Kettenbericht als Text (Druckansicht, Prüferexport). */
export function kettenberichtText(b: Kettenbericht): string {
  const zeilen = [
    'Belegbrücke – Kettenbericht',
    '',
    `Geprüft am: ${formatDatum(b.geprueftAm.slice(0, 10))} ${b.geprueftAm.slice(11, 19)} UTC`,
    `Ergebnis: ${b.ok ? 'in Ordnung – Protokoll und Dateien unverändert' : 'FEHLER gefunden'}`,
    `Protokolleinträge: ${b.eintraege}`,
    `Dateien unter originale/ und berichte/: ${b.dateien}`,
    `Letzter Eintrag: ${b.letzterEintrag ? `Nr. ${b.letzterEintrag.nr}, Hash ${b.letzterEintrag.hash}` : '–'}`,
  ]
  if (b.anker.length) zeilen.push(`Abgeglichene Kettenanker: ${b.anker.map((a) => `Nr. ${a.nr}`).join(', ')}`)
  if (b.fehler.length) zeilen.push('', 'Fehler (je Art der erste):', ...b.fehler.map((f) => `- ${f}`))
  zeilen.push('', 'Die Hashkette erkennt Änderungen, verhindert sie aber nicht. Kettenanker aus den Übergabeprotokollen liegen außerhalb des Systems bei der Kanzlei.')
  return zeilen.join('\n') + '\n'
}
