/**
 * Klartext zu Regeln der Regelwerke EN 16931 (CEN) und XRechnung (KoSIT). Eigene Worte;
 * übernommen sind nur Regel-IDs, BT-Nummern und kurze Begriffe (Spezifikation 8, Rechtliches).
 * Wird in Schritt 1.6 auf mindestens 25 Regeln ausgebaut.
 */
import type { Katalogeintrag } from './katalog.ts'

export const REGELWERK: Record<string, Katalogeintrag> = {}
