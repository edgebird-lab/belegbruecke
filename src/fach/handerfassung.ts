/**
 * Erfassung von Hand für sonstige Rechnungen (R16): Pflichtfelder, Summenprüfung auf den Cent,
 * Steuer je Zeile kaufmännisch gerundet (sonst Warnung), Plausibilität wie R11 (Steuersatz, Datum).
 * Danach gelten R8 bis R15 wie für E-Rechnungen. Rein, ohne Node-APIs.
 */
import { formatBetrag } from './anzeige.ts'
import { befund } from './befunde.ts'
import { steuerAusSatz } from './betrag.ts'
import { istGueltigesDatum, tageZwischen } from './datum.ts'
import type { Befund, Datum, Handerfassung } from './typen.ts'

export interface Handerfassungspruefung {
  /** Fehler, die das Speichern verhindern (Pflichtfelder, Summe) */
  fehler: string[]
  /** Befunde für den Prüfbericht (Warnungen) */
  befunde: Befund[]
}

const KATEGORIE_TEXT = { S: 'Normalsatz (S)', E: 'steuerfrei (E)', AE: 'Steuerschuldnerschaft des Empfängers (AE)' } as const

export function pruefeHanderfassung(h: Handerfassung, heute: Datum): Handerfassungspruefung {
  const fehler: string[] = []
  const befunde: Befund[] = []
  if (!h.lieferantName.trim()) fehler.push('Lieferant fehlt.')
  if (!h.rechnungsnummer.trim()) fehler.push('Rechnungsnummer fehlt.')
  if (!istGueltigesDatum(h.rechnungsdatum)) fehler.push('Rechnungsdatum fehlt oder ist kein gültiges Datum.')
  if (h.leistungsdatum !== null && !istGueltigesDatum(h.leistungsdatum)) fehler.push('Das Leistungsdatum ist kein gültiges Datum.')
  if (h.steuern.length === 0) fehler.push('Mindestens eine Steuerzeile ist nötig.')
  for (const [i, s] of h.steuern.entries()) {
    const nr = `Steuerzeile ${i + 1}`
    if (!Number.isSafeInteger(s.bemessungCent) || !Number.isSafeInteger(s.steuerCent)) {
      fehler.push(`${nr}: Beträge müssen ganze Cent sein.`)
      continue
    }
    if (s.kategorie !== 'S') {
      if (s.steuerCent !== 0) fehler.push(`${nr}: Bei ${KATEGORIE_TEXT[s.kategorie]} weist die Rechnung keine Steuer aus.`)
      continue
    }
    const erwartet = steuerAusSatz(s.bemessungCent, s.satz)
    if (erwartet === null || Number(s.satz) <= 0) {
      fehler.push(`${nr}: Der Steuersatz „${s.satz}“ ist keine Zahl größer 0.`)
      continue
    }
    if (erwartet !== s.steuerCent) {
      befunde.push(
        befund('HAND-STEUER', {
          zusatz: `${nr}: ${s.satz} % von ${formatBetrag(s.bemessungCent)} ergeben ${formatBetrag(erwartet)}, erfasst sind ${formatBetrag(s.steuerCent)}.`,
        }),
      )
    }
    if (Number(s.satz) !== 19 && Number(s.satz) !== 7) befunde.push(befund('PLAUS-STEUERSATZ', { zusatz: `${nr}: ${s.satz} %.` }))
  }
  const ganzeCent = h.steuern.every((s) => Number.isSafeInteger(s.bemessungCent) && Number.isSafeInteger(s.steuerCent))
  if (Number.isSafeInteger(h.bruttoCent)) {
    const summe = h.steuern.reduce((n, s) => n + s.bemessungCent + s.steuerCent, 0)
    if (h.steuern.length && ganzeCent && summe !== h.bruttoCent) {
      fehler.push(`Die Steuerzeilen ergeben ${formatBetrag(summe)}, der Bruttobetrag ist ${formatBetrag(h.bruttoCent)}. Beide müssen auf den Cent übereinstimmen.`)
    }
  } else fehler.push('Der Bruttobetrag fehlt.')
  if (istGueltigesDatum(h.rechnungsdatum) && tageZwischen(heute, h.rechnungsdatum) > 1) befunde.push(befund('PLAUS-DATUM'))
  return { fehler, befunde }
}
