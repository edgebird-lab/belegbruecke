/**
 * Aufbewahrungsfrist (R15): 31.12. des Jahres (J + regel.jahre), J = größtes Jahr aus
 * Rechnungs-, Eingangs- und Freigabedatum. Eingangs- und Freigabejahr nach Ortszeit
 * Europe/Berlin, sonst fiele ein Eingang in der Neujahrsnacht ins Vorjahr. Bewusst vorsichtig:
 * § 147 Abs. 4 AO knüpft an die Entstehung des Buchungsbelegs, § 14b Abs. 1 UStG an die Ausstellung.
 */
import { formatDatum } from './anzeige.ts'
import { datumInBerlin, istGueltigesDatum, jahr } from './datum.ts'
import type { Aufbewahrungsregel, Datum, Zeitpunkt } from './typen.ts'

export const STANDARD_AUFBEWAHRUNG: Aufbewahrungsregel = {
  id: 'buchungsbeleg',
  jahre: 8,
  rechtsgrundlage: '§ 147 Abs. 3 AO; § 14b Abs. 1 UStG',
  gueltigAb: '2025-01-01',
}

export function aufbewahrenBis(regel: Pick<Aufbewahrungsregel, 'jahre'>, d: { rechnungsdatum: Datum | null; eingangAm: Zeitpunkt; freigabeAm?: Zeitpunkt | null }): Datum {
  const jahre = [jahr(datumInBerlin(d.eingangAm))]
  if (istGueltigesDatum(d.rechnungsdatum)) jahre.push(jahr(d.rechnungsdatum))
  if (d.freigabeAm) jahre.push(jahr(datumInBerlin(d.freigabeAm)))
  return `${Math.max(...jahre) + regel.jahre}-12-31`
}

/** Anzeige mit Zusatz (R15): Version 0.1 löscht nie. */
export function aufbewahrungText(bis: Datum): string {
  return `aufzubewahren bis ${formatDatum(bis)} – frühestens; die Frist läuft nicht ab, solange die Festsetzungsfrist offen ist (§ 147 Abs. 3 AO)`
}
