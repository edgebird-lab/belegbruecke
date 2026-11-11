/**
 * Dubletten in drei Stufen (R9): identische Datei, gleiche Rechnung, ähnliche Rechnung.
 * Abgelehnte Belege zählen mit.
 */
import { formatBetrag, formatDatum } from './anzeige.ts'
import { tageZwischen, istGueltigesDatum } from './datum.ts'
import type { Cent, Datum, Dublettenhinweis, Sha256, Uuid } from './typen.ts'

/** Was die Dublettenprüfung je Beleg braucht. */
export interface Dublettenmerkmale {
  id: Uuid
  laufnummer: number
  originalSha256: Sha256
  xmlSha256: Sha256 | null
  lieferantSchluessel: string | null
  rechnungsnummer: string | null
  typcode: string | null
  rechnungsdatum: Datum | null
  bruttoCent: Cent | null
  zahlbetragCent: Cent | null
  format: string
}

/** normNr: Großbuchstaben, Leerraum und `- _ / . #` entfernt. */
export function normNr(nr: string): string {
  return nr.toUpperCase().replace(/[\s\-_/.#]+/g, '')
}

const RECHNUNG = new Set(['326', '380', '384', '389', '875', '876', '877'])
const GUTSCHRIFT = new Set(['381'])

/** Typgruppe nach R9: Rechnung oder Gutschrift; andere Codes bilden je eine eigene Gruppe. */
export function typgruppe(typcode: string | null): string {
  if (typcode && RECHNUNG.has(typcode)) return 'rechnung'
  if (typcode && GUTSCHRIFT.has(typcode)) return 'gutschrift'
  return `sonstige:${typcode ?? ''}`
}

export function belegnummer(laufnummer: number): string {
  return `B-${String(laufnummer).padStart(5, '0')}`
}

/** Abweichungen in Klartext, z. B. „Zahlbetrag 336,90 € ↔ 336,91 €“ (vorhandener ↔ neuer Beleg). */
function abweichungen(alt: Dublettenmerkmale, neu: Dublettenmerkmale): string[] {
  const liste: string[] = []
  const betrag = (c: Cent | null) => (c === null ? '–' : formatBetrag(c))
  if (alt.rechnungsnummer !== neu.rechnungsnummer) liste.push(`Rechnungsnummer ${alt.rechnungsnummer ?? '–'} ↔ ${neu.rechnungsnummer ?? '–'}`)
  if (alt.rechnungsdatum !== neu.rechnungsdatum) liste.push(`Rechnungsdatum ${formatDatum(alt.rechnungsdatum) || '–'} ↔ ${formatDatum(neu.rechnungsdatum) || '–'}`)
  if (alt.bruttoCent !== neu.bruttoCent) liste.push(`Brutto ${betrag(alt.bruttoCent)} ↔ ${betrag(neu.bruttoCent)}`)
  if (alt.zahlbetragCent !== neu.zahlbetragCent) liste.push(`Zahlbetrag ${betrag(alt.zahlbetragCent)} ↔ ${betrag(neu.zahlbetragCent)}`)
  if (alt.format !== neu.format) liste.push(`Format ${alt.format} ↔ ${neu.format}`)
  return liste
}

/** Stufen 1 bis 3 für einen neuen Beleg gegen alle vorhandenen (auch abgelehnte). */
export function findeDubletten(neu: Dublettenmerkmale, vorhandene: readonly Dublettenmerkmale[]): Dublettenhinweis[] {
  const hinweise: Dublettenhinweis[] = []
  for (const alt of vorhandene) {
    if (alt.id === neu.id) continue
    const nummer = belegnummer(alt.laufnummer)
    if (alt.originalSha256 === neu.originalSha256) {
      hinweise.push({ stufe: 'identische-datei', andererBelegId: alt.id, grund: `Dieselbe Datei liegt bereits als ${nummer} im Archiv.` })
      continue
    }
    const gleicherLieferant = !!neu.lieferantSchluessel && neu.lieferantSchluessel === alt.lieferantSchluessel
    const gleicheNummer = !!neu.rechnungsnummer && !!alt.rechnungsnummer && normNr(neu.rechnungsnummer) === normNr(alt.rechnungsnummer)
    const gleicheGruppe = typgruppe(neu.typcode) === typgruppe(alt.typcode)
    const gleichesXml = !!neu.xmlSha256 && neu.xmlSha256 === alt.xmlSha256
    if ((gleicherLieferant && gleicheNummer && gleicheGruppe) || gleichesXml) {
      const diff = abweichungen(alt, neu)
      const anlass = gleichesXml ? 'gleicher XML-Inhalt' : `Rechnungsnummer ${neu.rechnungsnummer} vom selben Lieferanten`
      hinweise.push({
        stufe: 'gleiche-rechnung',
        andererBelegId: alt.id,
        grund: `Gleiche Rechnung wie ${nummer}: ${anlass}.${diff.length ? ` Abweichungen: ${diff.join('; ')}.` : ' Keine Abweichungen.'}`,
      })
      continue
    }
    if (
      gleicherLieferant &&
      !gleicheNummer &&
      neu.bruttoCent !== null &&
      neu.bruttoCent === alt.bruttoCent &&
      istGueltigesDatum(neu.rechnungsdatum) &&
      istGueltigesDatum(alt.rechnungsdatum) &&
      Math.abs(tageZwischen(alt.rechnungsdatum, neu.rechnungsdatum)) <= 3
    ) {
      hinweise.push({
        stufe: 'aehnliche-rechnung',
        andererBelegId: alt.id,
        grund: `Ähnlich wie ${nummer}: gleicher Lieferant und Betrag ${formatBetrag(neu.bruttoCent)}, Rechnungsdatum ${formatDatum(alt.rechnungsdatum)} ↔ ${formatDatum(neu.rechnungsdatum)}, aber andere Rechnungsnummer (${alt.rechnungsnummer ?? '–'} ↔ ${neu.rechnungsnummer ?? '–'}).`,
      })
    }
  }
  return hinweise
}

/** Freigabe gesperrt, solange eine Dublette der Stufe 2 nicht entschieden ist (R9, R14). */
export function dubletteSperrt(hinweise: readonly Dublettenhinweis[], entschieden: boolean): boolean {
  return !entschieden && hinweise.some((h) => h.stufe === 'gleiche-rechnung')
}
