/**
 * Prüfergebnis eines Belegs (Abschnitt 4, R6 Punkt 9) aus der technischen Prüfung (Worker) und
 * den Prüfungen, die die Einstellungen brauchen: Pflichtangaben (R8), Empfänger, Plausibilität
 * (R11). Dazu die Ampel für Schritt B2 (Abschnitt 5.3).
 */
import { PROFILNAME, SYNTAXNAME } from './formaterkennung.ts'
import { pruefePflichtangaben, pruefePflichtangabenHand } from './pflichtangaben.ts'
import { pruefePlausibilitaet } from './plausibilitaet.ts'
import type { Befund, Datum, Firma, Formaterkennung, Handerfassung, Pruefergebnis, Rechnungsdaten, Zeitpunkt } from './typen.ts'

/** Ergebnis der technischen Prüfung, wie es der Prüf-Worker liefert. */
export interface TechnischePruefung {
  format: Formaterkennung
  befunde: Befund[]
  szenario: string | null
  wohlgeformt: boolean
  xsdGueltig: boolean | null
  angenommen: boolean
  eingeschraenktGeprueft: boolean
  daten: Rechnungsdaten | null
  dauerMs: number
}

export interface Pruefkontext {
  firma: Firma | null
  /** Kalenderdatum nach Ortszeit für PLAUS-DATUM */
  heute: Datum
  zeitpunkt: Zeitpunkt
  pruefprogramm: string
  artefakte: Pruefergebnis['artefakte']
}

export function erstellePruefergebnis(t: TechnischePruefung, k: Pruefkontext): Pruefergebnis {
  // R8 und R11 nur für E-Rechnungen; sonstige Rechnungen prüft die Erfassung von Hand (R16)
  const r8 = t.daten && t.format.belegart === 'e-rechnung' ? pruefePflichtangaben(t.daten, k.firma) : null
  const r11 = t.daten && t.format.belegart === 'e-rechnung' ? pruefePlausibilitaet(t.daten, k.heute) : []
  return {
    formatVersion: 1,
    zeitpunkt: k.zeitpunkt,
    pruefprogramm: k.pruefprogramm,
    artefakte: k.artefakte,
    szenario: t.szenario,
    wohlgeformt: t.wohlgeformt,
    xsdGueltig: t.xsdGueltig,
    angenommen: t.angenommen,
    eingeschraenktGeprueft: t.eingeschraenktGeprueft,
    befunde: [...t.befunde, ...(r8?.befunde ?? []), ...r11],
    pflichtangaben: r8?.pruefung ?? null,
    dauerMs: t.dauerMs,
  }
}

/**
 * Prüfergebnis nach der Erfassung von Hand (R16): Pflichtangaben auf den erfassten Werten. Befunde
 * einer früheren Erfassung (Pflichtangaben, Plausibilität) werden ersetzt, nicht verdoppelt.
 */
export function ergaenzeHanderfassung(p: Pruefergebnis, h: Handerfassung, befunde: Befund[] = []): Pruefergebnis {
  const r8 = pruefePflichtangabenHand(h)
  return { ...p, befunde: [...p.befunde.filter((b) => b.quelle !== 'ustg' && b.quelle !== 'plausibilitaet'), ...r8.befunde, ...befunde], pflichtangaben: r8.pruefung }
}

export type Ampelfarbe = 'gruen' | 'gelb' | 'rot' | 'grau'

export interface Ampel {
  farbe: Ampelfarbe
  /** Symbol, damit der Status nie nur an der Farbe hängt */
  symbol: '✓' | '!' | '✕' | '○'
  text: string
}

/** Ampelregel für B2 (Abschnitt 5.3). */
export function ampel(format: Formaterkennung, p: Pruefergebnis | null): Ampel {
  if (format.belegart === 'sonstige-rechnung') return { farbe: 'grau', symbol: '○', text: 'Keine E-Rechnung (sonstige Rechnung)' }
  if (!p || !p.angenommen) return { farbe: 'rot', symbol: '✕', text: 'Nicht angenommen' }
  if (p.pflichtangaben?.ergebnisse.some((e) => e.status === 'fehlt')) return { farbe: 'rot', symbol: '✕', text: 'Pflichtangabe fehlt' }
  if (p.befunde.some((b) => b.stufe === 'fehler' || b.stufe === 'warnung')) return { farbe: 'gelb', symbol: '!', text: 'Gültig mit Hinweisen' }
  const profil = format.profil && format.profil !== 'unbekannt' ? PROFILNAME[format.profil] : 'E-Rechnung'
  const syntax = format.syntax ? SYNTAXNAME[format.syntax] : ''
  const text = format.profil?.startsWith('xrechnung') ? `Gültige ${profil} (${syntax})` : `Gültige E-Rechnung (${profil}, ${syntax})`
  return { farbe: 'gruen', symbol: '✓', text }
}

/** Zusatz an Befunden, die umsatzsteuerlich keine Rolle spielen (Abschnitt 5.3). */
export function zusatzUst(b: Befund): string | null {
  return b.ustRelevant === false && b.stufe !== 'hinweis' ? 'umsatzsteuerlich unbeachtlich' : null
}
