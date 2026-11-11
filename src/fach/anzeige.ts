/**
 * Anzeige von Beträgen und Daten im deutschen Format (Spezifikation 5.6):
 * Beträge `1.234,56 €`, Datum `11.11.2026`. Ohne Intl, damit das Ergebnis
 * nicht von der Laufzeit (ICU-Daten, Leerzeichenart) abhängt.
 */

/** Cent-Ganzzahl als Betrag mit Tausenderpunkt und Dezimalkomma, z. B. 123456 → "1.234,56 €". */
export function formatBetrag(cent: number, waehrung = '€'): string {
  if (!Number.isSafeInteger(cent)) throw new RangeError(`Kein Cent-Betrag: ${cent}`)
  const negativ = cent < 0
  const betrag = Math.abs(cent)
  const euro = Math.floor(betrag / 100)
  const rest = betrag % 100
  const gruppiert = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativ ? '−' : ''}${gruppiert},${String(rest).padStart(2, '0')} ${waehrung}`
}

/** ISO-Datum "2026-11-11" als "11.11.2026"; ungültige Eingaben bleiben unverändert. */
export function formatDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return treffer ? `${treffer[3]}.${treffer[2]}.${treffer[1]}` : iso
}
