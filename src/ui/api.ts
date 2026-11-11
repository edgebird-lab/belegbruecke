/**
 * Zugriff der Oberfläche auf die API: JSON hin und zurück, Pflicht-Kopfzeile gegen CSRF bei
 * ändernden Anfragen, Fehler mit deutschem Text vom Server. Antworttypen der wichtigsten Pfade.
 */
import { useCallback, useEffect, useState } from 'react'
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

/** Lädt JSON und hält Ladezustand und Fehler; `pfad` null lädt nichts. */
export function useLaden<T>(pfad: string | null): { daten: T | null; fehler: string | null; laedt: boolean; neu: () => void } {
  const [zaehler, setZaehler] = useState(0)
  // Ergebnis je Anfrage (Pfad und Zähler); solange es fehlt, läuft das Laden
  const [stand, setStand] = useState<{ schluessel: string; pfad: string; daten: T | null; fehler: string | null } | null>(null)
  const schluessel = `${pfad}#${zaehler}`
  useEffect(() => {
    if (pfad === null) return
    let aktiv = true
    api<T>(pfad)
      .then((daten) => aktiv && setStand({ schluessel: `${pfad}#${zaehler}`, pfad, daten, fehler: null }))
      .catch((e: unknown) => aktiv && setStand((s) => ({ schluessel: `${pfad}#${zaehler}`, pfad, daten: s?.pfad === pfad ? s.daten : null, fehler: fehlerText(e) })))
    return () => {
      aktiv = false
    }
  }, [pfad, zaehler])
  const neu = useCallback(() => setZaehler((z) => z + 1), [])
  // Beim Neuladen desselben Pfads bleiben die alten Daten sichtbar; bei einem anderen Pfad nicht
  const daten = stand && stand.pfad === pfad ? stand.daten : null
  return { daten, fehler: stand && stand.pfad === pfad ? stand.fehler : null, laedt: pfad !== null && stand?.schluessel !== schluessel, neu }
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
