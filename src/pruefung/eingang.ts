/**
 * Verarbeitung einer angenommenen Datei (R1 bis R6): PDF → eingebettetes XML → Formaterkennung
 * → Prüfung → Datenextraktion. Die Teilschritte laufen über einen `Ausfuehrer`: im Server ist das
 * der Worker-Pool mit Zeit- und Speichergrenzen, in Tests derselbe Code direkt im Prozess.
 */
import { createHash } from 'node:crypto'
import type { Dateiart } from '../fach/annahme.ts'
import { befund } from '../fach/befunde.ts'
import { erkenneXml, type Rahmen } from '../fach/formaterkennung.ts'
import type { Befund, Formaterkennung, Rechnungsdaten } from '../fach/typen.ts'
import { extrahiere } from './extraktion.ts'
import { leseRechnungsXml, type PdfErgebnis } from './pdf.ts'
import { validiere } from './validierung.ts'

export interface Pruefteil {
  format: Formaterkennung
  befunde: Befund[]
  szenario: string | null
  wohlgeformt: boolean
  xsdGueltig: boolean | null
  angenommen: boolean
  eingeschraenktGeprueft: boolean
  /** "Regel-ID:Stufe vor customLevel" wie im KoSIT-Bericht */
  meldungen: string[]
  daten: Rechnungsdaten | null
  dauerMs: number
}

export interface Ausfuehrer {
  pdf(bytes: Uint8Array): Promise<PdfErgebnis>
  xml(bytes: Uint8Array, rahmen: Rahmen): Promise<Pruefteil>
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

/** Formaterkennung, Prüfung und Extraktion für XML-Bytes; läuft im Worker. */
export async function pruefeXmlTeil(bytes: Uint8Array, rahmen: Rahmen): Promise<Pruefteil> {
  const start = performance.now()
  const eingang = erkenneXml(bytes, rahmen)
  const ergebnis: Pruefteil = {
    format: eingang.format,
    befunde: [...eingang.befunde],
    szenario: null,
    wohlgeformt: eingang.wohlgeformt,
    xsdGueltig: null,
    angenommen: false,
    eingeschraenktGeprueft: false,
    meldungen: [],
    daten: null,
    dauerMs: 0,
  }
  if (eingang.text && eingang.format.belegart === 'e-rechnung') {
    const v = await validiere(eingang.text, eingang.format)
    Object.assign(ergebnis, {
      szenario: v.szenario,
      wohlgeformt: v.wohlgeformt,
      xsdGueltig: v.xsdGueltig,
      angenommen: v.angenommen,
      eingeschraenktGeprueft: v.eingeschraenktGeprueft,
      meldungen: v.meldungen,
    })
    ergebnis.befunde.push(...v.befunde)
  }
  // Daten auch bei Fehlern der Prüfung auslesen (R8 läuft trotzdem); bei MINIMUM als Vorschlag für die Erfassung
  if (eingang.text && eingang.format.syntax) {
    const x = await extrahiere(eingang.text, eingang.format.syntax)
    ergebnis.daten = x.daten
    ergebnis.befunde.push(...x.befunde)
  }
  ergebnis.dauerMs = Math.round(performance.now() - start)
  return ergebnis
}

/** Führt alles im aktuellen Prozess aus (Tests, Skripte). */
export const lokalerAusfuehrer: Ausfuehrer = {
  pdf: leseRechnungsXml,
  xml: pruefeXmlTeil,
}

function ohnePruefung(format: Formaterkennung, befunde: Befund[]): Pruefteil {
  return { format, befunde, szenario: null, wohlgeformt: false, xsdGueltig: null, angenommen: false, eingeschraenktGeprueft: false, meldungen: [], daten: null, dauerMs: 0 }
}

function sonstigeFormat(container: Formaterkennung['container'], grund: string): Formaterkennung {
  return { belegart: 'sonstige-rechnung', container, syntax: null, profil: null, spezifikationsKennung: null, eingebettetAls: null, xmlSha256: null, zeichensatz: null, grund }
}

/** Verarbeitet die Bytes einer angenommenen Datei (R1 ist bereits erfüllt). */
export async function verarbeiteDatei(bytes: Uint8Array, dateiart: Dateiart, ausfuehrer: Ausfuehrer): Promise<Pruefteil> {
  if (dateiart === 'jpeg' || dateiart === 'png') {
    return ohnePruefung(sonstigeFormat('bild', 'Bild (Scan) einer Rechnung; Erfassung von Hand'), [])
  }
  if (dateiart === 'xml') {
    return ausfuehrer.xml(bytes, { container: 'xml', eingebettetAls: null, xmlSha256: sha256(bytes) })
  }
  const pdf = await ausfuehrer.pdf(bytes)
  if (pdf.art === 'fehler') return ohnePruefung(sonstigeFormat('pdf-ohne-xml', 'PDF nicht lesbar oder eingebettetes XML nicht verwendbar'), pdf.befunde)
  if (pdf.art === 'ohne-xml') return ohnePruefung(sonstigeFormat('pdf-ohne-xml', 'PDF ohne eingebettete E-Rechnung; Erfassung von Hand'), pdf.befunde)
  const teil = await ausfuehrer.xml(pdf.xml, { container: 'pdf-mit-xml', eingebettetAls: pdf.name, xmlSha256: sha256(pdf.xml) })
  return { ...teil, befunde: [...pdf.befunde, ...teil.befunde] }
}

/** Befund, wenn ein Worker-Auftrag am Zeit- oder Speicherlimit scheitert (R6 Punkt 8). */
export function abbruchBefund(grund: 'zeitlimit' | 'speicher' | 'absturz'): Befund {
  if (grund === 'zeitlimit') return befund('PRUEFUNG-ZEITLIMIT')
  if (grund === 'speicher') return befund('PRUEFUNG-SPEICHER')
  return befund('PRUEFUNG-VERARBEITUNG', { zusatz: 'Der Prüfprozess ist abgestürzt und wurde neu gestartet.' })
}
