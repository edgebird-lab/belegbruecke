import { useEffect, useState } from 'react'

export type Darstellung = 'system' | 'hell' | 'dunkel'

const SCHLUESSEL = 'belegbruecke.darstellung'

function gespeichert(): Darstellung {
  try {
    const wert = localStorage.getItem(SCHLUESSEL)
    return wert === 'hell' || wert === 'dunkel' ? wert : 'system'
  } catch {
    return 'system'
  }
}

/** Hell oder Dunkel nach Systemeinstellung, umschaltbar; die Wahl gilt nur in diesem Browser. */
export function useDarstellung(): [Darstellung, (d: Darstellung) => void] {
  const [wert, setWert] = useState<Darstellung>(gespeichert)
  useEffect(() => {
    const wurzel = document.documentElement
    if (wert === 'system') wurzel.removeAttribute('data-theme')
    else wurzel.setAttribute('data-theme', wert === 'hell' ? 'light' : 'dark')
    try {
      localStorage.setItem(SCHLUESSEL, wert)
    } catch {
      // ohne Speicher gilt die Wahl nur bis zum Neuladen
    }
  }, [wert])
  return [wert, setWert]
}
