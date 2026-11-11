/**
 * Protokoll mit SHA-256-Hashkette (R17) und Prüfung der Kette (R18, Punkte 1 bis 3 und 5).
 * Die Prüfung der Dateien (Punkt 4) braucht das Dateisystem und liegt im Server.
 */
import { kanonisch } from './kanonisch.ts'
import type { Protokolleintrag, Sha256, Sha256Funktion } from './typen.ts'

export const NULL_HASH: Sha256 = '0'.repeat(64)

const enc = new TextEncoder()

/** Die gehashten Felder eines Eintrags, ohne `hash` selbst. */
export type Eintragsinhalt = Omit<Protokolleintrag, 'hash'>

/** Kanonischer Text über { nr, zeitpunkt, akteur, aktion, belegId, daten, vorgaengerHash } (R17 Punkt 2). */
export function eintragsText(e: Eintragsinhalt): string {
  return kanonisch({
    nr: e.nr,
    zeitpunkt: e.zeitpunkt,
    akteur: e.akteur,
    aktion: e.aktion,
    belegId: e.belegId,
    daten: e.daten,
    vorgaengerHash: e.vorgaengerHash,
  })
}

export function eintragsHash(e: Eintragsinhalt, sha256: Sha256Funktion): Sha256 {
  return sha256(enc.encode(eintragsText(e)))
}

/** Hängt einen Eintrag an: nächste Nummer, Vorgänger-Hash, eigener Hash. */
export function neuerEintrag(
  vorgaenger: Pick<Protokolleintrag, 'nr' | 'hash'> | null,
  inhalt: Omit<Eintragsinhalt, 'nr' | 'vorgaengerHash'>,
  sha256: Sha256Funktion,
): Protokolleintrag {
  const ohneHash: Eintragsinhalt = {
    ...inhalt,
    nr: vorgaenger ? vorgaenger.nr + 1 : 1,
    vorgaengerHash: vorgaenger ? vorgaenger.hash : NULL_HASH,
  }
  return { ...ohneHash, hash: eintragsHash(ohneHash, sha256) }
}

export type Kettenfehler =
  | { art: 'luecke'; nachNr: number; text: string }
  | { art: 'verkettung'; nr: number; text: string }
  | { art: 'veraendert'; nr: number; text: string }
  | { art: 'anker'; nr: number; text: string }

export interface Kettenanker {
  nr: number
  hash: Sha256
}

/**
 * Prüft Nummernfolge, Verkettung und Hashes (R18 Punkte 1 bis 3) und optional Kettenanker
 * (Punkt 5). Meldet je Art nur den ersten Fehler. Erwartet die Einträge nach `nr` sortiert.
 */
export function pruefeKette(eintraege: readonly Protokolleintrag[], sha256: Sha256Funktion, anker: readonly Kettenanker[] = []): Kettenfehler[] {
  const fehler: Kettenfehler[] = []
  let luecke = false
  let verkettung = false
  let veraendert = false
  for (let i = 0; i < eintraege.length; i++) {
    const e = eintraege[i]
    const erwartet = i === 0 ? 1 : eintraege[i - 1].nr + 1
    if (!luecke && e.nr !== erwartet) {
      luecke = true
      fehler.push(i === 0 ? { art: 'luecke', nachNr: 0, text: `Das Protokoll beginnt mit Nr. ${e.nr} statt mit Nr. 1` } : { art: 'luecke', nachNr: eintraege[i - 1].nr, text: `Lücke nach Nr. ${eintraege[i - 1].nr}` })
    }
    const vorgaengerHash = i === 0 ? NULL_HASH : eintraege[i - 1].hash
    if (!verkettung && e.vorgaengerHash !== vorgaengerHash) {
      verkettung = true
      fehler.push({ art: 'verkettung', nr: e.nr, text: `Eintrag ${e.nr} verweist nicht auf den Hash seines Vorgängers` })
    }
    if (!veraendert && eintragsHash(e, sha256) !== e.hash) {
      veraendert = true
      fehler.push({ art: 'veraendert', nr: e.nr, text: `Eintrag ${e.nr} verändert` })
    }
  }
  const nachNr = new Map(eintraege.map((e) => [e.nr, e]))
  for (const a of anker) {
    const e = nachNr.get(a.nr)
    if (!e || e.hash !== a.hash) {
      fehler.push({ art: 'anker', nr: a.nr, text: e ? `Kettenanker Nr. ${a.nr} passt nicht zum Protokoll` : `Kettenanker Nr. ${a.nr} fehlt im Protokoll` })
      break
    }
  }
  return fehler
}
