/** Test-Kontenplan und Einstellungen aus Spezifikation 9.2 (T-K, T-E): 4900 ohne, 4901 mit Automatik. */
import { standardEinstellungen } from '../fach/einstellungen.ts'
import type { Einstellungen, Kontierungsregel, Sachkonto } from '../fach/typen.ts'
import { BEISPIEL_FIRMA } from './rechnungen.ts'

export const TESTKONTEN: Sachkonto[] = [
  { nummer: 4900, bezeichnung: 'Testaufwand', automatikkonto: false, aktiv: true },
  { nummer: 4901, bezeichnung: 'Testaufwand Automatik', automatikkonto: true, aktiv: true },
]

/** Berater 1001, Mandant 1, WJ ab 01-01, SKR03, Sachkontenlänge 4, Kreditoren 70000 bis 99999, BU 9 und 8. */
export function testEinstellungen(kleinunternehmer = false): Einstellungen {
  const e = standardEinstellungen()
  e.firma = { ...BEISPIEL_FIRMA, kleinunternehmer }
  return e
}

/** Regel eines Lieferanten mit `anzahl` freigegebenen Belegen. */
export function regel(lieferantId: string, sachkonto: number, anzahl: number, kategorie = 'S', satz = '19'): Kontierungsregel {
  return { lieferantId, steuerkategorie: kategorie, steuersatz: satz, sachkonto, buSchluessel: sachkonto === 4901 ? null : '9', anzahl, zuletzt: '2026-10-01T10:00:00.000Z' }
}
