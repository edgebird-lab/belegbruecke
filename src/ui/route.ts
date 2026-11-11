/**
 * Navigation über den Hash der Adresse (#/eingang, #/beleg/<id>/pruefen …): ohne Router-Bibliothek,
 * Zurück und Lesezeichen funktionieren, der Server liefert immer dieselbe Seite aus.
 */
import { useCallback, useEffect, useState } from 'react'

export const BELEGSCHRITTE = ['eingang', 'pruefen', 'ansehen', 'zuordnen', 'kontieren', 'freigeben'] as const
export type Belegschritt = (typeof BELEGSCHRITTE)[number]

export const EINSTELLUNGSBEREICHE = ['firma', 'kanzlei', 'konten', 'lieferanten', 'eingang', 'benutzer', 'system'] as const
export type Einstellungsbereich = (typeof EINSTELLUNGSBEREICHE)[number]

export type Route =
  | { seite: 'eingang' }
  | { seite: 'belege' }
  | { seite: 'beleg'; id: string; schritt: Belegschritt | null }
  | { seite: 'uebergabe'; laufId: string | null }
  | { seite: 'archiv'; id: string | null }
  | { seite: 'einstellungen'; bereich: Einstellungsbereich }
  | { seite: 'einrichtung'; schritt: number }

const ID = /^[0-9A-Fa-f-]{36}$/

export function leseRoute(hash: string): Route {
  const teile = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const [seite, a, b] = teile
  switch (seite) {
    case 'belege':
      return { seite: 'belege' }
    case 'beleg':
      if (a && ID.test(a)) return { seite: 'beleg', id: a.toUpperCase(), schritt: (BELEGSCHRITTE as readonly string[]).includes(b ?? '') ? (b as Belegschritt) : null }
      break
    case 'uebergabe':
      return { seite: 'uebergabe', laufId: a && ID.test(a) ? a.toUpperCase() : null }
    case 'archiv':
      return { seite: 'archiv', id: a && ID.test(a) ? a.toUpperCase() : null }
    case 'einstellungen':
      return { seite: 'einstellungen', bereich: (EINSTELLUNGSBEREICHE as readonly string[]).includes(a ?? '') ? (a as Einstellungsbereich) : 'firma' }
    case 'einrichtung': {
      const n = Number(a)
      return { seite: 'einrichtung', schritt: Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1 }
    }
  }
  return { seite: 'eingang' }
}

export function routeZuHash(r: Route): string {
  switch (r.seite) {
    case 'eingang':
    case 'belege':
      return `#/${r.seite}`
    case 'beleg':
      return `#/beleg/${r.id}${r.schritt ? `/${r.schritt}` : ''}`
    case 'uebergabe':
      return r.laufId ? `#/uebergabe/${r.laufId}` : '#/uebergabe'
    case 'archiv':
      return r.id ? `#/archiv/${r.id}` : '#/archiv'
    case 'einstellungen':
      return `#/einstellungen/${r.bereich}`
    case 'einrichtung':
      return `#/einrichtung/${r.schritt}`
  }
}

/** Aktuelle Route und eine Funktion zum Wechseln (legt einen Eintrag im Verlauf an). */
export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => leseRoute(window.location.hash))
  useEffect(() => {
    const geaendert = () => setRoute(leseRoute(window.location.hash))
    window.addEventListener('hashchange', geaendert)
    return () => window.removeEventListener('hashchange', geaendert)
  }, [])
  const gehe = useCallback((r: Route) => {
    const hash = routeZuHash(r)
    if (window.location.hash !== hash) window.location.hash = hash
    else setRoute(r)
  }, [])
  return [route, gehe]
}
