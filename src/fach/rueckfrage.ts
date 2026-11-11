/**
 * Text für die Rückfrage an den Lieferanten (Schritt B2, „Text kopieren“): Befunde der Stufen
 * Fehler und Warnung mit Regel-ID, Klartext und Originalmeldung. Rein, ohne Node-APIs.
 */
import { formatBetrag, formatDatum } from './anzeige.ts'
import type { Beleg, Befund } from './typen.ts'

/** Befunde für Anzeige und Rückfrage gruppiert (Abschnitt 5.3, B2). */
export type Befundgruppe = 'formatfehler' | 'geschaeftsregelfehler' | 'pflichtangaben' | 'hinweise'

export const GRUPPENTITEL: Record<Befundgruppe, string> = {
  formatfehler: 'Formatfehler',
  geschaeftsregelfehler: 'Geschäftsregelfehler',
  pflichtangaben: 'Pflichtangaben',
  hinweise: 'Hinweise',
}

export function befundgruppe(b: Befund): Befundgruppe {
  if (b.fehlerklasse === 'formatfehler') return 'formatfehler'
  if (b.fehlerklasse === 'geschaeftsregelfehler') return 'geschaeftsregelfehler'
  if (b.quelle === 'ustg') return 'pflichtangaben'
  return 'hinweise'
}

export function gruppiereBefunde(befunde: readonly Befund[]): { gruppe: Befundgruppe; befunde: Befund[] }[] {
  const reihenfolge: Befundgruppe[] = ['formatfehler', 'geschaeftsregelfehler', 'pflichtangaben', 'hinweise']
  return reihenfolge.map((gruppe) => ({ gruppe, befunde: befunde.filter((b) => befundgruppe(b) === gruppe) })).filter((g) => g.befunde.length > 0)
}

export function rueckfrageText(b: Pick<Beleg, 'daten' | 'handerfassung' | 'pruefung' | 'original'>, absender: string): string {
  const nummer = b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? null
  const datum = b.handerfassung?.rechnungsdatum ?? b.daten?.rechnungsdatum ?? null
  const brutto = b.handerfassung?.bruttoCent ?? b.daten?.summen.bruttoCent ?? null
  const bezug = nummer ? `Ihrer Rechnung ${nummer}${datum ? ` vom ${formatDatum(datum)}` : ''}` : `der Datei „${b.original.dateiname}“`
  const relevant = (b.pruefung?.befunde ?? []).filter((x) => x.stufe === 'fehler' || x.stufe === 'warnung')
  const punkte = relevant.map((x, i) => {
    const zeilen = [`${i + 1}. ${x.regelId}: ${x.klartext}`]
    if (x.btBezug.length) zeilen.push(`   Betroffene Angaben: ${x.btBezug.join(', ')}`)
    if (x.originaltext) zeilen.push(`   Meldung des Regelwerks: ${x.originaltext}`)
    if (x.ort) zeilen.push(`   Fundstelle: ${x.ort}`)
    return zeilen.join('\n')
  })
  return [
    `Betreff: Rückfrage zu ${bezug}`,
    '',
    'Guten Tag,',
    '',
    `bei der Prüfung ${bezug}${brutto !== null ? ` über ${formatBetrag(brutto)}` : ''} sind uns folgende Punkte aufgefallen:`,
    '',
    ...(punkte.length ? punkte : ['(keine Fehler oder Warnungen)']),
    '',
    'Bitte senden Sie uns eine korrigierte Rechnung als E-Rechnung (XRechnung oder ZUGFeRD ab Profil EN 16931).',
    '',
    'Mit freundlichen Grüßen',
    absender,
  ].join('\n')
}
