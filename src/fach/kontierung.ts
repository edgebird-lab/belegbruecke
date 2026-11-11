/**
 * Kontierungsvorschlag (R12) mit Steuerfall und BU-Schlüssel (R13), dazu die Fortschreibung der
 * Kontierungsregeln bei Freigabe und Rücknahme (R12 Punkt 8). Rein, ohne Node-APIs.
 */
import { formatBetrag } from './anzeige.ts'
import { typgruppe } from './dubletten.ts'
import type { Beleg, Cent, DatevEinstellungen, Kontierung, Kontierungsregel, Kontierungszeile, Sachkonto, Steuerfall, Uuid, Zeitpunkt } from './typen.ts'

/** Höchstlänge des Buchungstexts (EXTF-Feld 14). */
export const BUCHUNGSTEXT_LAENGE = 60

export const STEUERFALL_TEXT: Record<Steuerfall, string> = {
  'vorsteuer-19': 'Vorsteuer 19 %',
  'vorsteuer-7': 'Vorsteuer 7 %',
  'ohne-vorsteuer': 'ohne Vorsteuer',
  sonderfall: 'Sonderfall',
}

export const GRUND_NUR_BELEG = 'Gutschrift über Ihre Leistung (Erlös). Sie geht nur als Beleg an die Kanzlei.'

function satzIst(satz: string, wert: number): boolean {
  return satz.trim() !== '' && Number(satz) === wert
}

/**
 * R13: Steuerfall je Steuerzeile. AE, K, G, L und M bleiben auch bei einer Firma mit
 * Kleinunternehmerregelung Sonderfälle, weil dort trotzdem Steuer geschuldet sein kann (§ 13b UStG).
 */
export function steuerfall(kategorie: string, satz: string, kleinunternehmer: boolean): Steuerfall {
  const k = kategorie.trim().toUpperCase()
  if (kleinunternehmer && ['S', 'Z', 'E', 'O'].includes(k)) return 'ohne-vorsteuer'
  if (k === 'S' && satzIst(satz, 19)) return 'vorsteuer-19'
  if (k === 'S' && satzIst(satz, 7)) return 'vorsteuer-7'
  if (k === 'E' || k === 'Z' || k === 'O') return 'ohne-vorsteuer'
  return 'sonderfall'
}

/** R13: leer bei einem Automatikkonto, sonst der Schlüssel aus den Einstellungen. */
export function buSchluessel(fall: Steuerfall, konto: Pick<Sachkonto, 'automatikkonto'> | null | undefined, vorgaben: DatevEinstellungen['buSchluessel']): string | null {
  if (konto?.automatikkonto) return null
  return vorgaben[fall] ?? null
}

/**
 * R12 Punkt 6, bezogen auf das Kreditorenkonto: "S", wenn genau eine der Bedingungen „Typ 381“
 * und „BT-112 < 0“ gilt, sonst "H".
 */
export function sollHaben(typcode: string, bruttoCent: Cent): 'S' | 'H' {
  return (typcode === '381') !== bruttoCent < 0 ? 'S' : 'H'
}

/**
 * R12 Punkt 5: Lieferantenname, Leerzeichen, BT-1, auf 60 Zeichen gekürzt. Gekürzt wird zuerst der
 * Name, damit die Rechnungsnummer vollständig bleibt.
 */
export function buchungstext(name: string, nummer: string): string {
  const n = name.trim().replace(/\s+/g, ' ')
  const nr = nummer.trim().replace(/\s+/g, ' ')
  const voll = n && nr ? `${n} ${nr}` : n || nr
  if (voll.length <= BUCHUNGSTEXT_LAENGE) return voll
  const platz = BUCHUNGSTEXT_LAENGE - nr.length - 1
  if (n && platz >= 1) return `${n.slice(0, platz).trimEnd()} ${nr}`
  return nr.slice(0, BUCHUNGSTEXT_LAENGE)
}

/** Was die Kontierung aus einer E-Rechnung oder einer Erfassung von Hand braucht. */
export interface Kontierungsquelle {
  typcode: string
  waehrung: string
  rechnungsnummer: string
  steuern: { kategorie: string; satz: string; bemessungCent: Cent; steuerCent: Cent }[]
  bruttoCent: Cent
  vorausbezahltCent: Cent
  rundungCent: Cent
}

/** Daten für die Kontierung: Erfassung von Hand vor den Daten aus dem XML (R16). */
export function kontierungsquelle(b: Pick<Beleg, 'daten' | 'handerfassung'>): Kontierungsquelle | null {
  const h = b.handerfassung
  if (h) return { typcode: '380', waehrung: 'EUR', rechnungsnummer: h.rechnungsnummer, steuern: h.steuern, bruttoCent: h.bruttoCent, vorausbezahltCent: 0, rundungCent: 0 }
  const d = b.daten
  if (!d) return null
  return {
    typcode: d.typcode,
    waehrung: d.waehrung,
    rechnungsnummer: d.rechnungsnummer,
    steuern: d.steuern,
    bruttoCent: d.summen.bruttoCent,
    vorausbezahltCent: d.summen.vorausbezahltCent,
    rundungCent: d.summen.rundungCent,
  }
}

export interface Kontierungsrahmen {
  /** Name des Lieferanten (bei Typ 389 des Geschäftspartners) für den Buchungstext */
  lieferantName: string
  /** Kontierungsregeln dieses Lieferanten */
  regeln: readonly Kontierungsregel[]
  sachkonten: readonly Sachkonto[]
  kleinunternehmer: boolean
  buSchluessel: DatevEinstellungen['buSchluessel']
}

function fremdwaehrung(waehrung: string): string {
  return `Fremdwährung ${waehrung}: Die Belegbrücke übergibt nur Euro-Beträge; der Export ist für diesen Beleg gesperrt.`
}

/** R12: Vorschlag je Steuerzeile mit Sachkonto aus der Historie des Lieferanten. */
export function kontierungVorschlagen(q: Kontierungsquelle, r: Kontierungsrahmen): Kontierung {
  const sh = sollHaben(q.typcode, q.bruttoCent)
  // Punkt 7: Gutschrift über die eigene Leistung (389) geht nur als Beleg an die Kanzlei
  if (q.typcode === '389') {
    const gruende = [GRUND_NUR_BELEG]
    if (q.waehrung !== 'EUR') gruende.push(fremdwaehrung(q.waehrung))
    return { zeilen: [], nurBeleg: true, sollHaben: sh, herkunft: 'manuell', historieAnzahl: 0, manuellPruefen: gruende }
  }
  const text = buchungstext(r.lieferantName, q.rechnungsnummer)
  const aktiv = (nummer: number) => r.sachkonten.find((k) => k.nummer === nummer && k.aktiv) ?? null
  const haeufigste = [...r.regeln].filter((g) => aktiv(g.sachkonto)).sort((a, b) => b.anzahl - a.anzahl || b.zuletzt.localeCompare(a.zuletzt))[0] ?? null
  const genutzt = new Set<Kontierungsregel>()
  let steuersatzNeu = false
  const zeilen: Kontierungszeile[] = []
  for (const s of q.steuern) {
    // Punkt 1: Zeilen ohne Bemessung und ohne Steuer entfallen
    if (s.bemessungCent === 0 && s.steuerCent === 0) continue
    const fall = steuerfall(s.kategorie, s.satz, r.kleinunternehmer)
    // Punkt 3: gleiche Kategorie und gleicher Satz, sonst die häufigste Regel des Lieferanten
    const exakt = r.regeln.find((g) => g.steuerkategorie === s.kategorie && g.steuersatz === s.satz && aktiv(g.sachkonto)) ?? null
    const regel = exakt ?? haeufigste
    if (regel) genutzt.add(regel)
    if (!exakt && regel) steuersatzNeu = true
    const konto = regel ? aktiv(regel.sachkonto) : null
    let bu = buSchluessel(fall, konto, r.buSchluessel)
    // Sonderfälle haben keinen voreingestellten Schlüssel: den von Hand gewählten aus der Historie übernehmen
    if (bu === null && fall === 'sonderfall' && exakt && !konto?.automatikkonto) bu = exakt.buSchluessel
    zeilen.push({
      bruttoCent: Math.abs(s.bemessungCent + s.steuerCent),
      steuerkategorie: s.kategorie,
      steuersatz: s.satz,
      steuerfall: fall,
      sachkonto: konto?.nummer ?? null,
      buSchluessel: bu,
      buchungstext: text,
    })
  }
  return {
    zeilen,
    nurBeleg: false,
    sollHaben: sh,
    herkunft: genutzt.size > 0 ? 'historie' : 'manuell',
    historieAnzahl: [...genutzt].reduce((n, g) => n + g.anzahl, 0),
    manuellPruefen: gruendeFuer(q, zeilen, steuersatzNeu),
  }
}

/** R12 Punkt 7: Gründe für „manuell prüfen“ in Klartext. */
function gruendeFuer(q: Kontierungsquelle, zeilen: readonly Kontierungszeile[], steuersatzNeu: boolean): string[] {
  const gruende: string[] = []
  if (q.vorausbezahltCent !== 0) {
    gruende.push(`Anzahlung ${formatBetrag(q.vorausbezahltCent)} (BT-113): Gebucht wird der Bruttobetrag; die Verrechnung mit der Anzahlung klärt die Kanzlei.`)
  }
  if (q.rundungCent !== 0) gruende.push(`Rundungsbetrag ${formatBetrag(q.rundungCent)} (BT-114): Der Zahlbetrag weicht um diesen Betrag vom Bruttobetrag ab.`)
  const summe = zeilen.reduce((n, z) => n + z.bruttoCent, 0)
  if (summe !== Math.abs(q.bruttoCent)) {
    gruende.push(`Summe weicht ab: Buchungszeilen ${formatBetrag(summe)} ↔ Bruttobetrag ${formatBetrag(Math.abs(q.bruttoCent))} (BT-112).`)
  }
  if (zeilen.some((z) => z.steuerfall === 'sonderfall')) {
    gruende.push('Steuerfall von Hand klären: Kategorie oder Steuersatz passen zu keinem Standardfall (z. B. Steuerschuldnerschaft nach § 13b UStG); BU-Schlüssel mit der Kanzlei abstimmen.')
  }
  if (q.waehrung !== 'EUR') gruende.push(fremdwaehrung(q.waehrung))
  if (steuersatzNeu) gruende.push('Steuersatz neu für diesen Lieferanten: Das Sachkonto stammt aus früheren Rechnungen mit anderem Steuersatz.')
  const gruppe = typgruppe(q.typcode)
  if (gruppe !== 'rechnung' && gruppe !== 'gutschrift') gruende.push(`Rechnungstyp prüfen: Der Typcode ${q.typcode} (BT-3) ist weder Rechnung noch Gutschrift.`)
  return gruende
}

/** Eine Kontierung ist vollständig, wenn jede Zeile ein Sachkonto hat (bei nurBeleg ohne Zeilen). */
export function kontierungVollstaendig(k: Kontierung | null): boolean {
  if (!k) return false
  return k.nurBeleg || (k.zeilen.length > 0 && k.zeilen.every((z) => z.sachkonto !== null))
}

/** Änderungen des Benutzers an einer Zeile in Schritt B5. */
export interface Zeilenwahl {
  sachkonto: number | null
  /** Nur bei Sonderfällen frei wählbar; sonst gilt R13 */
  buSchluessel?: string | null
  buchungstext?: string
}

/**
 * Übernimmt die Wahl des Benutzers in den Vorschlag: Sachkonto je Zeile, Buchungstext, BU-Schlüssel
 * nach R13 (frei nur bei Sonderfällen). Liefert Fehler in Klartext statt einer Kontierung, wenn ein
 * Konto fehlt, inaktiv ist oder die Zahl der Zeilen nicht passt.
 */
export function kontierungUebernehmen(
  vorschlag: Kontierung,
  wahl: readonly Zeilenwahl[],
  sachkonten: readonly Sachkonto[],
  vorgaben: DatevEinstellungen['buSchluessel'],
): { ok: true; kontierung: Kontierung } | { ok: false; fehler: string } {
  if (vorschlag.nurBeleg) return { ok: true, kontierung: { ...vorschlag, zeilen: [] } }
  if (wahl.length !== vorschlag.zeilen.length) return { ok: false, fehler: `Erwartet werden ${vorschlag.zeilen.length} Buchungszeilen, übermittelt wurden ${wahl.length}.` }
  const zeilen: Kontierungszeile[] = []
  for (const [i, z] of vorschlag.zeilen.entries()) {
    const w = wahl[i]
    const konto = w.sachkonto === null ? null : (sachkonten.find((k) => k.nummer === w.sachkonto) ?? null)
    if (w.sachkonto !== null && !konto) return { ok: false, fehler: `Zeile ${i + 1}: Das Sachkonto ${w.sachkonto} steht nicht im Kontenplan.` }
    if (konto && !konto.aktiv) return { ok: false, fehler: `Zeile ${i + 1}: Das Sachkonto ${konto.nummer} ist inaktiv.` }
    const text = (w.buchungstext ?? z.buchungstext).trim().replace(/\s+/g, ' ')
    if (text.length > BUCHUNGSTEXT_LAENGE) return { ok: false, fehler: `Zeile ${i + 1}: Der Buchungstext hat mehr als ${BUCHUNGSTEXT_LAENGE} Zeichen.` }
    let bu = buSchluessel(z.steuerfall, konto, vorgaben)
    if (z.steuerfall === 'sonderfall' && !konto?.automatikkonto) bu = w.buSchluessel === undefined ? z.buSchluessel : w.buSchluessel
    zeilen.push({ ...z, sachkonto: konto?.nummer ?? null, buSchluessel: bu, buchungstext: text || z.buchungstext })
  }
  const vonHand = zeilen.some((z, i) => z.sachkonto !== vorschlag.zeilen[i].sachkonto)
  return { ok: true, kontierung: { ...vorschlag, zeilen, herkunft: vonHand ? 'manuell' : vorschlag.herkunft } }
}

type Regelschluessel = `${string}|${string}`
const schluessel = (kategorie: string, satz: string): Regelschluessel => `${kategorie}|${satz}`

/**
 * R12 Punkt 8: Bei der Freigabe je Zeile die Regel (Lieferant, Kategorie, Satz) anlegen oder
 * `anzahl` um 1 erhöhen; ein Beleg zählt je Regel einmal. Liefert die geänderten Regeln.
 */
export function regelnNachFreigabe(regeln: readonly Kontierungsregel[], lieferantId: Uuid, k: Kontierung, jetzt: Zeitpunkt): Kontierungsregel[] {
  const geaendert = new Map<Regelschluessel, Kontierungsregel>()
  for (const z of k.nurBeleg ? [] : k.zeilen) {
    if (z.sachkonto === null) continue
    const s = schluessel(z.steuerkategorie, z.steuersatz)
    const alt = geaendert.get(s) ?? regeln.find((g) => g.lieferantId === lieferantId && schluessel(g.steuerkategorie, g.steuersatz) === s)
    const anzahl = geaendert.has(s) ? alt!.anzahl : (alt?.anzahl ?? 0) + 1
    geaendert.set(s, { lieferantId, steuerkategorie: z.steuerkategorie, steuersatz: z.steuersatz, sachkonto: z.sachkonto, buSchluessel: z.buSchluessel, anzahl, zuletzt: jetzt })
  }
  return [...geaendert.values()]
}

/** Rücknahme einer Freigabe: `anzahl` je Regel um 1 senken; Regeln mit 0 entfallen (Liste „entfernen“). */
export function regelnNachRuecknahme(regeln: readonly Kontierungsregel[], lieferantId: Uuid, k: Kontierung): { aendern: Kontierungsregel[]; entfernen: Kontierungsregel[] } {
  const aendern: Kontierungsregel[] = []
  const entfernen: Kontierungsregel[] = []
  const gesehen = new Set<Regelschluessel>()
  for (const z of k.nurBeleg ? [] : k.zeilen) {
    const s = schluessel(z.steuerkategorie, z.steuersatz)
    if (gesehen.has(s)) continue
    gesehen.add(s)
    const alt = regeln.find((g) => g.lieferantId === lieferantId && schluessel(g.steuerkategorie, g.steuersatz) === s)
    if (!alt) continue
    if (alt.anzahl <= 1) entfernen.push(alt)
    else aendern.push({ ...alt, anzahl: alt.anzahl - 1 })
  }
  return { aendern, entfernen }
}
