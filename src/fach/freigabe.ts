/**
 * Statusübergänge des Belegs (Abschnitt 4) und Bedingungen der Freigabe (R14). Rein, ohne Node-APIs.
 */
import { dubletteSperrt } from './dubletten.ts'
import { kontierungVollstaendig } from './kontierung.ts'
import type { Beleg, Belegstatus } from './typen.ts'

/** Mindestlänge der Begründungen für Freigabe trotz Fehler und Ablehnung. */
export const BEGRUENDUNG_MIN = 10

export type Belegaktion = 'zuordnen' | 'kontieren' | 'handerfassung' | 'dublette' | 'freigeben' | 'ablehnen' | 'freigabe-zuruecknehmen' | 'ablehnung-aufheben'

/**
 * Erlaubte Ausgangsstatus je Aktion. Abweichung von der Tabelle in Abschnitt 4: Ablehnen geht auch
 * aus „eingegangen“, damit eine PDF ohne Rechnung (z. B. AGB im Mailanhang) nicht erfasst werden muss.
 */
const ERLAUBT: Record<Belegaktion, readonly Belegstatus[]> = {
  zuordnen: ['geprueft', 'kontiert'],
  kontieren: ['geprueft', 'kontiert'],
  handerfassung: ['eingegangen', 'geprueft', 'kontiert'],
  dublette: ['eingegangen', 'geprueft', 'kontiert'],
  freigeben: ['kontiert'],
  ablehnen: ['eingegangen', 'geprueft', 'kontiert'],
  'freigabe-zuruecknehmen': ['freigegeben'],
  'ablehnung-aufheben': ['abgelehnt'],
}

const STATUS_TEXT: Record<Belegstatus, string> = {
  eingegangen: 'eingegangen',
  geprueft: 'geprüft',
  kontiert: 'kontiert',
  freigegeben: 'freigegeben',
  exportiert: 'exportiert',
  abgelehnt: 'abgelehnt',
}

export function statusText(s: Belegstatus): string {
  return STATUS_TEXT[s]
}

/** Fehler in Klartext, wenn die Aktion im aktuellen Status nicht erlaubt ist; sonst null. */
export function aktionErlaubt(status: Belegstatus, aktion: Belegaktion): string | null {
  if (ERLAUBT[aktion].includes(status)) return null
  if (status === 'exportiert') return 'Der Beleg ist an die Kanzlei übergeben und lässt sich nicht mehr ändern.'
  if (status === 'freigegeben') return 'Der Beleg ist freigegeben. Nehmen Sie zuerst die Freigabe zurück.'
  if (status === 'abgelehnt') return 'Der Beleg ist abgelehnt. Heben Sie zuerst die Ablehnung auf.'
  if (status === 'eingegangen' && aktion !== 'freigeben') return 'Erfassen Sie zuerst die Rechnungsdaten von Hand.'
  return `Im Status „${STATUS_TEXT[status]}“ ist das nicht möglich.`
}

/** Status nach Zuordnen oder Kontieren: kontiert, wenn Lieferant und vollständige Kontierung vorliegen. */
export function statusNachZuordnung(b: Pick<Beleg, 'lieferantId' | 'kontierung'>): 'geprueft' | 'kontiert' {
  return b.lieferantId && kontierungVollstaendig(b.kontierung) ? 'kontiert' : 'geprueft'
}

/** Status nach „Ablehnung aufheben“: zurück zu geprüft; sonstige Rechnungen ohne Erfassung von Hand zu eingegangen. */
export function statusNachAufhebung(b: Pick<Beleg, 'format' | 'handerfassung'>): 'eingegangen' | 'geprueft' {
  return b.format.belegart === 'sonstige-rechnung' && !b.handerfassung ? 'eingegangen' : 'geprueft'
}

/** R14: Was einer Freigabe im Weg steht, in Klartext (leer = Freigabe möglich, sofern „Inhalt geprüft“ bestätigt). */
export function freigabeHindernisse(b: Beleg): string[] {
  const hindernisse: string[] = []
  if (b.status === 'eingegangen') hindernisse.push('Die Rechnungsdaten sind noch nicht von Hand erfasst.')
  else if (b.status !== 'kontiert' && b.status !== 'geprueft') hindernisse.push(aktionErlaubt(b.status, 'freigeben')!)
  const nurBeleg = b.kontierung?.nurBeleg ?? false
  if (!b.lieferantId) hindernisse.push(nurBeleg ? 'Der Geschäftspartner ist noch nicht zugeordnet.' : 'Der Lieferant ist noch nicht zugeordnet.')
  if (dubletteSperrt(b.dubletten, b.dublettenEntscheidung !== null)) hindernisse.push('Möglicherweise dieselbe Rechnung wie ein anderer Beleg: Entscheiden Sie im Schritt „Zuordnen“, ob es eine Dublette ist.')
  if (!b.kontierung) hindernisse.push('Der Beleg ist noch nicht kontiert.')
  else if (!kontierungVollstaendig(b.kontierung)) hindernisse.push('Nicht jede Buchungszeile hat ein Sachkonto.')
  // z. B. nach „Ablehnung aufheben“: Daten vollständig, aber die Kontierung ist noch einmal zu bestätigen
  if (b.status === 'geprueft' && hindernisse.length === 0) hindernisse.push('Bestätigen Sie die Kontierung im Schritt „Kontieren“.')
  return hindernisse
}

/** R14: Bei Befunden der Stufe fehler ist eine Begründung mit mindestens 10 Zeichen Pflicht. */
export function begruendungNoetig(b: Pick<Beleg, 'pruefung'>): boolean {
  return b.pruefung?.befunde.some((x) => x.stufe === 'fehler') ?? false
}

/** R14: Hinweis „Vorsteuerabzug gefährdet“, wenn ein Fehler umsatzsteuerlich relevant ist. */
export function vorsteuerGefaehrdet(b: Pick<Beleg, 'pruefung'>): boolean {
  return b.pruefung?.befunde.some((x) => x.stufe === 'fehler' && x.ustRelevant === true) ?? false
}

/** Prüft die Eingaben einer Freigabe; liefert den ersten Fehler in Klartext oder null. */
export function pruefeFreigabe(b: Beleg, eingabe: { inhaltGeprueft: boolean; begruendung: string | null }): string | null {
  const hindernisse = freigabeHindernisse(b)
  if (hindernisse.length) return hindernisse[0]
  if (!eingabe.inhaltGeprueft) return 'Bestätigen Sie, dass Sie die Leistung erhalten und Preise und Mengen geprüft haben (BMF-Schreiben vom 15.10.2025, Rn. 35a).'
  if (begruendungNoetig(b) && (eingabe.begruendung ?? '').trim().length < BEGRUENDUNG_MIN) {
    return `Die Prüfung hat Fehler gefunden. Begründen Sie die Freigabe mit mindestens ${BEGRUENDUNG_MIN} Zeichen.`
  }
  return null
}
