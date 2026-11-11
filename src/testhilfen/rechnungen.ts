/** Rechnungsdaten und Beispiel-Einstellungen für Tests der Fachlogik. */
import type { Firma, Rechnungsdaten } from '../fach/typen.ts'
import { extrahiere } from '../pruefung/extraktion.ts'
import { kositText, mutation } from './dateien.ts'

const cache = new Map<string, Rechnungsdaten>()

/** Rechnungsdaten einer KoSIT-Datei („standard/01.01a-INVOICE_ubl.xml“) oder Mutation („M8“). */
export async function datenAus(rel: string): Promise<Rechnungsdaten> {
  let d = cache.get(rel)
  if (!d) {
    const text = /^M\d$/.test(rel) ? new TextDecoder().decode(mutation(rel)) : kositText(rel)
    const x = await extrahiere(text, rel.endsWith('_uncefact.xml') ? 'cii' : 'ubl-invoice')
    if (!x.daten) throw new Error(`Keine Daten aus ${rel}`)
    d = x.daten
    cache.set(rel, d)
  }
  return structuredClone(d)
}

/** Beispiel-Firma aus der Spezifikation (U-2 bis U-4): Empfänger der KoSIT-Testdateien. */
export const BEISPIEL_FIRMA: Firma = {
  name: '[Buyer name]',
  namensVarianten: [],
  anschrift: { zeile1: '[Buyer address line 1]', plz: '12345', ort: '[Buyer city]', land: 'DE' },
  ustId: undefined,
  kleinunternehmer: false,
}

export const OLBRICHT: Firma = {
  name: 'olbricht-digital',
  namensVarianten: ['Olbricht Digital UG (haftungsbeschränkt)'],
  anschrift: { ort: 'Musterstadt', land: 'DE' },
  ustId: 'DE999999999',
  kleinunternehmer: false,
}
