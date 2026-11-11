/**
 * Stufen und Annahme wie default-report.xsl der KoSIT-Konfiguration (R6 Punkte 4 bis 6).
 */
import type { Stufe } from '../fach/typen.ts'
import type { Level, Szenario } from './szenarien.ts'

/**
 * Stufe einer SVRL-Meldung aus `flag` und `role`, in dieser Reihenfolge:
 * fatal/error → error, warning/warn → warning, information/info → information, sonst error.
 * (Die Zeile „nur @role = information → warning“ aus default-report.xsl greift nie, weil die
 * Zeile davor @role bereits einschließt; das Ergebnis ist dasselbe.)
 */
export function levelAusSvrl(flag: string | null, role: string | null): Level {
  const werte = [flag, role].filter((w): w is string => !!w)
  if (werte.some((w) => w === 'fatal' || w === 'error')) return 'error'
  if (werte.some((w) => w === 'warning' || w === 'warn')) return 'warning'
  if (werte.some((w) => w === 'information' || w === 'info')) return 'information'
  return 'error'
}

/** customLevel des Szenarios anwenden (rep:custom-level). */
export function nachCustomLevel(code: string, level: Level, szenario: Szenario | null): Level {
  return szenario?.customLevel.get(code) ?? level
}

export const STUFE_AUS_LEVEL: Record<Level, Stufe> = { error: 'fehler', warning: 'warnung', information: 'hinweis' }

/**
 * Annahme (R6 Punkt 5): abgelehnt bei Verarbeitungsfehler, ohne Szenario, bei einem Szenario mit
 * „fallback“ im Namen oder bei mindestens einer Meldung der Stufe error nach customLevel.
 */
export function annahme(a: { verarbeitungsfehler: boolean; szenario: Szenario | null; levelNachCustom: Level[] }): boolean {
  if (a.verarbeitungsfehler) return false
  if (!a.szenario) return false
  if (a.szenario.name.toLowerCase().includes('fallback')) return false
  return !a.levelNachCustom.includes('error')
}
