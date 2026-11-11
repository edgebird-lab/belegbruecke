/**
 * Zugriff der Oberfläche auf die API: JSON hin und zurück, Pflicht-Kopfzeile gegen CSRF bei
 * ändernden Anfragen, Fehler mit deutschem Text vom Server. Antworttypen der wichtigsten Pfade.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ampel } from '../fach/pruefbericht.ts'
import type { Belegstatus, Einstellungen, Exportlauf, Kontierung, Lieferant, Protokolleintrag, Beleg, Sachkonto, Dublettenhinweis, Kontierungsregel } from '../fach/typen.ts'

export class ApiFehler extends Error {
  readonly status: number
  readonly code: string
  readonly antwort: unknown

  constructor(status: number, code: string, text: string, antwort: unknown) {
    super(text)
    this.name = 'ApiFehler'
    this.status = status
    this.code = code
    this.antwort = antwort
  }
}

export interface Anfrage {
  methode?: 'GET' | 'POST' | 'PUT'
  daten?: unknown
  formular?: FormData
}

async function senden(pfad: string, o: Anfrage): Promise<Response> {
  const methode = o.methode ?? (o.daten !== undefined || o.formular ? 'POST' : 'GET')
  const kopf: Record<string, string> = {}
  if (methode !== 'GET') kopf['X-Belegbruecke'] = '1'
  let body: BodyInit | undefined
  if (o.formular) body = o.formular
  else if (o.daten !== undefined) {
    kopf['Content-Type'] = 'application/json'
    body = JSON.stringify(o.daten)
  }
  let r: Response
  try {
    r = await fetch(`/api${pfad}`, { method: methode, headers: kopf, body, credentials: 'same-origin' })
  } catch {
    throw new ApiFehler(0, 'NETZ', 'Der Server ist nicht erreichbar. Läuft die Belegbrücke noch?', null)
  }
  if (!r.ok) {
    const antwort = (await r.json().catch(() => null)) as { fehler?: { code?: string; text?: string } } | null
    throw new ApiFehler(r.status, antwort?.fehler?.code ?? 'FEHLER', antwort?.fehler?.text ?? `Der Server antwortet mit Status ${r.status}.`, antwort)
  }
  return r
}

export async function api<T>(pfad: string, o: Anfrage = {}): Promise<T> {
  return (await (await senden(pfad, o)).json()) as T
}

/** Ändernde Anfrage, deren Antwort eine Datei ist (z. B. Prüferexport): im Browser speichern. */
export async function herunterladen(pfad: string, o: Anfrage, ersatzname: string): Promise<string> {
  const r = await senden(pfad, o)
  const name = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get('content-disposition') ?? '')?.[1]
  const dateiname = name ? decodeURIComponent(name) : ersatzname
  const url = URL.createObjectURL(await r.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = dateiname
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return dateiname
}

export function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Lädt JSON und hält Ladezustand und Fehler; `pfad` null lädt nichts. `neu()` lädt erneut und ist
 * erledigt, wenn die neuen Daten da sind; so wechselt ein Assistent erst danach den Schritt.
 */
export function useLaden<T>(pfad: string | null): { daten: T | null; fehler: string | null; laedt: boolean; neu: () => Promise<void> } {
  const [stand, setStand] = useState<{ pfad: string; daten: T | null; fehler: string | null } | null>(null)
  const aktuell = useRef(pfad)
  useEffect(() => {
    aktuell.current = pfad
    if (pfad === null) return
    let aktiv = true
    api<T>(pfad)
      .then((daten) => aktiv && setStand({ pfad, daten, fehler: null }))
      .catch((e: unknown) => aktiv && setStand((s) => ({ pfad, daten: s?.pfad === pfad ? s.daten : null, fehler: fehlerText(e) })))
    return () => {
      aktiv = false
    }
  }, [pfad])
  const neu = useCallback(async () => {
    if (pfad === null) return
    try {
      const daten = await api<T>(pfad)
      // Ist inzwischen ein anderer Pfad gewählt, gehört das Ergebnis nicht mehr hierher
      if (aktuell.current === pfad) setStand({ pfad, daten, fehler: null })
    } catch (e) {
      if (aktuell.current === pfad) setStand((s) => ({ pfad, daten: s?.pfad === pfad ? s.daten : null, fehler: fehlerText(e) }))
    }
  }, [pfad])
  // Beim Neuladen desselben Pfads bleiben die alten Daten sichtbar; bei einem anderen Pfad nicht
  const passend = stand !== null && stand.pfad === pfad
  return { daten: passend ? stand.daten : null, fehler: passend ? stand.fehler : null, laedt: pfad !== null && !passend, neu }
}

// ---------- Antworttypen ----------

export interface Benutzerinfo {
  id: string
  anmeldename: string
  name: string
}

export interface Sitzung {
  angemeldet: boolean
  benutzer: Benutzerinfo | null
  einrichtungNoetig: boolean
}

export type EinstellungenAntwort = Einstellungen & { passwortGesetzt: boolean }

export interface Belegzeile {
  id: string
  laufnummer: number
  belegnummer: string
  status: Belegstatus
  eingangAm: string
  quelle: 'upload' | 'imap'
  dateiname: string
  format: string
  belegart: 'e-rechnung' | 'sonstige-rechnung'
  lieferant: string | null
  rechnungsnummer: string | null
  rechnungsdatum: string | null
  bruttoCent: number | null
  waehrung: string
  ampel: Ampel
  dubletten: number
  aufbewahrenBis: string
  exportlaufId: string | null
}

export interface Belegdetail {
  beleg: Beleg
  zusammenfassung: Belegzeile
  aufbewahrung: string
  protokoll: Protokolleintrag[]
  lieferant: Lieferant | null
  lieferantenvorschlag: { schluessel: string; vorhanden: Lieferant | null; neu: Pick<Lieferant, 'schluessel' | 'name' | 'ustId' | 'steuernummer' | 'anschrift'> } | null
  kreditorVorschlag: number | null
  /** nächstes freies Kreditorenkonto (für einen neuen Lieferanten oder einen ohne Konto) */
  naechsterKreditor: number | null
  kontierungsvorschlag: Kontierung | null
  freigabe: { hindernisse: string[]; begruendungNoetig: boolean; vorsteuerGefaehrdet: boolean }
  dublettenVergleich: { hinweis: Dublettenhinweis; anderer: Belegzeile | null }[]
  exportlauf: Exportlauf | null
}

export interface Eingangsergebnis {
  dateiname: string
  ok: boolean
  code?: string
  text?: string
  belegId?: string
  laufnummer?: number
  status?: Belegstatus
  format?: string
  ampel?: Ampel
  dubletten?: Dublettenhinweis[]
}

export type LieferantMitStatistik = Lieferant & { belege: number; regeln: Kontierungsregel[] }

export interface Sachkontenantwort {
  sachkonten: Sachkonto[]
  zuletzt: number[]
}

export interface Sperre {
  belegId: string | null
  laufnummer: number | null
  grund: string
}

export interface Uebergabeplan {
  monat: string
  nachtragNr: number
  belege: Belegzeile[]
  nurBeleg: string[]
  anzahlJeStatus: Record<Belegstatus, number>
  offen: Belegzeile[]
  sperren: Sperre[]
  summen: { kategorie: string; satz: string; bruttoCent: number }[]
  summeBruttoCent: number
  buchungen: number
  mitBuchungsstapel: boolean
  mandant: { beraternummer: number; mandantennummer: number }
}

export interface Kettenbericht {
  geprueftAm: string
  ok: boolean
  eintraege: number
  dateien: number
  fehler: string[]
  letzterEintrag: { nr: number; hash: string } | null
  anker: { nr: number; hash: string }[]
  dauerMs: number
}

export interface Systeminfo {
  version: string
  datenOrdner: string
  artefakte: { konfiguration: string; enSchematron: string; xrSchematron: string; visualisierung: string } | null
}
