/**
 * Erste Stufe der KoSIT-Visualisierung (UBL/CII → Zwischenmodell xr:invoice) und die
 * HTML-Ansicht (Zwischenmodell → HTML mit eingebettetem JavaScript), beide mit SaxonJS.
 */
import SaxonJS from 'saxon-js'
import { befund } from '../fach/befunde.ts'
import type { Befund, Rechnungsdaten, Syntax } from '../fach/typen.ts'
import { alsUtf8Deklaration } from '../fach/zeichensatz.ts'
import { leseZwischenmodell } from '../fach/zwischenmodell.ts'
import { sef, visualisierungsBasis } from './artefakte.ts'

const STUFE_1: Record<Syntax, string> = {
  'ubl-invoice': 'ubl-invoice-xr',
  'ubl-creditnote': 'ubl-creditnote-xr',
  cii: 'cii-xr',
}

/** UBL bzw. CII ins Zwischenmodell; wirft, wenn das Regelwerk die Datei nicht verarbeiten kann. */
export function zwischenmodell(text: string, syntax: Syntax): string {
  const name = STUFE_1[syntax]
  return SaxonJS.transform(
    { stylesheetInternal: sef(name), stylesheetBaseURI: visualisierungsBasis(`${name}.xsl`), sourceText: alsUtf8Deklaration(text), destination: 'serialized' },
    'sync',
  ).principalResult as string
}

/** Zwischenmodell als HTML-Ansicht der KoSIT (deutsch); CSS, JavaScript und Übersetzungen eingebettet. */
export function ansichtAusZwischenmodell(xr: string): string {
  return SaxonJS.transform(
    { stylesheetInternal: sef('xrechnung-html'), stylesheetBaseURI: visualisierungsBasis('xrechnung-html.xsl'), sourceText: xr, destination: 'serialized' },
    'sync',
  ).principalResult as string
}

export function ansicht(text: string, syntax: Syntax): string {
  return ansichtAusZwischenmodell(zwischenmodell(text, syntax))
}

export async function extrahiere(text: string, syntax: Syntax): Promise<{ daten: Rechnungsdaten | null; befunde: Befund[] }> {
  try {
    const { daten, befunde } = leseZwischenmodell(zwischenmodell(text, syntax))
    return { daten, befunde }
  } catch (e) {
    return {
      daten: null,
      befunde: [
        befund('PRUEFUNG-VERARBEITUNG', {
          stufe: 'warnung',
          klartext: 'Die Rechnungsdaten ließen sich nicht auslesen; die Ansicht und die Prüfung der Pflichtangaben fehlen deshalb.',
          handlung: 'Rechnungsdaten von Hand erfassen.',
          originaltext: String((e as Error).message ?? e).slice(0, 300),
        }),
      ],
    }
  }
}
