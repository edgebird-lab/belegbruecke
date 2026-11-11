import { createContext, useContext } from 'react'
import { formatBetrag, formatDatum } from '../fach/anzeige.ts'
import { ortszeitBerlin } from '../fach/datum.ts'
import { statusText } from '../fach/freigabe.ts'
import type { Belegstatus } from '../fach/typen.ts'
import type { Benutzerinfo, EinstellungenAntwort } from './api.ts'
import type { Route } from './route.ts'

export interface AppApi {
  benutzer: Benutzerinfo
  erklaerungen: boolean
  setErklaerungen: (an: boolean) => void
  /** kurze Meldung oben in der Kopfzeile (aria-live) */
  melde: (text: string) => void
  zaehler: { offen: number; freigegeben: number }
  aktualisiereZaehler: () => void
  gehe: (r: Route) => void
  einstellungen: EinstellungenAntwort | null
  ladeEinstellungen: () => Promise<void>
}

export const AppKontext = createContext<AppApi | null>(null)

export function useApp(): AppApi {
  const a = useContext(AppKontext)
  if (!a) throw new Error('AppKontext fehlt')
  return a
}

export const betrag = (cent: number | null | undefined, waehrung = 'EUR') => (cent === null || cent === undefined ? '–' : formatBetrag(cent, waehrung === 'EUR' ? '€' : waehrung))
export const datum = (iso: string | null | undefined) => formatDatum(iso) || '–'

/** Zeitpunkt in Ortszeit Berlin, z. B. „11.11.2026, 10:30 Uhr“. */
export function zeit(iso: string | null | undefined): string {
  if (!iso) return '–'
  const o = ortszeitBerlin(iso)
  return `${o.tag}.${o.monat}.${o.jahr}, ${o.stunde}:${o.minute} Uhr`
}

export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} Byte`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

export const status = (s: Belegstatus) => statusText(s)
