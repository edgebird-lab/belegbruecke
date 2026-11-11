/** Belege für Tests der Fachlogik, ohne Server: aus KoSIT-Dateien oder einer Erfassung von Hand. */
import type { Beleg, Formaterkennung, Handerfassung, Pruefergebnis } from '../fach/typen.ts'
import { datenAus } from './rechnungen.ts'

let zaehler = 0

const E_RECHNUNG: Formaterkennung = {
  belegart: 'e-rechnung',
  container: 'xml',
  syntax: 'ubl-invoice',
  profil: 'xrechnung-3.0',
  spezifikationsKennung: 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0',
  eingebettetAls: null,
  xmlSha256: null,
  zeichensatz: 'UTF-8',
  grund: null,
}

export function leeresPruefergebnis(angenommen = true): Pruefergebnis {
  return {
    formatVersion: 1,
    zeitpunkt: '2026-11-11T09:30:02.000Z',
    pruefprogramm: 'belegbruecke 0.1.0',
    artefakte: { konfiguration: 'test', enSchematron: 'test', xrSchematron: 'test' },
    szenario: 'EN16931 XRechnung (UBL Invoice)',
    wohlgeformt: true,
    xsdGueltig: true,
    angenommen,
    eingeschraenktGeprueft: false,
    befunde: [],
    pflichtangaben: null,
    dauerMs: 1,
  }
}

function grundbeleg(): Beleg {
  zaehler++
  const id = `00000000-0000-4000-8000-${String(zaehler).padStart(12, '0')}`
  const sha = zaehler.toString(16).padStart(64, '0')
  return {
    formatVersion: 1,
    id,
    laufnummer: zaehler,
    status: 'geprueft',
    quelle: { art: 'upload', benutzerId: '00000000-0000-4000-8000-000000000001' },
    eingangAm: '2026-11-11T09:30:00.000Z',
    original: { sha256: sha, dateiname: `beleg-${zaehler}.xml`, mimeTyp: 'application/xml', groesseBytes: 100, speicherpfad: `originale/${sha.slice(0, 2)}/${sha}.xml` },
    format: { ...E_RECHNUNG, xmlSha256: sha },
    daten: null,
    handerfassung: null,
    pruefung: leeresPruefergebnis(),
    pruefberichtSha256: null,
    dubletten: [],
    dublettenEntscheidung: null,
    lieferantId: null,
    kontierung: null,
    inhaltGeprueft: false,
    freigabe: null,
    ablehnung: null,
    exportlaufId: null,
    aufbewahrenBis: '2034-12-31',
  }
}

/** Beleg aus einer KoSIT-Datei, z. B. "standard/03.01a-INVOICE_ubl.xml"; Laufnummern zählen hoch. */
export async function belegAus(rel: string, aenderungen: Partial<Beleg> = {}): Promise<Beleg> {
  return { ...grundbeleg(), daten: await datenAus(rel), ...aenderungen }
}

/** Sonstige Rechnung (PDF ohne XML) mit Erfassung von Hand. */
export function belegVonHand(h: Handerfassung, aenderungen: Partial<Beleg> = {}): Beleg {
  const b = grundbeleg()
  return {
    ...b,
    original: { ...b.original, dateiname: `beleg-${b.laufnummer}.pdf`, mimeTyp: 'application/pdf', speicherpfad: b.original.speicherpfad.replace(/\.xml$/, '.pdf') },
    format: { ...E_RECHNUNG, belegart: 'sonstige-rechnung', container: 'pdf-ohne-xml', syntax: null, profil: null, spezifikationsKennung: null, xmlSha256: null, zeichensatz: null, grund: 'PDF ohne XML' },
    handerfassung: h,
    ...aenderungen,
  }
}
