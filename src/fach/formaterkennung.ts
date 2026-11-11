/**
 * Formaterkennung (R4): Wurzelelement und Namensraum bestimmen die Syntax, BT-24 das Profil.
 * BT-24 wird exakt verglichen, ohne Trimmen, wie die `match`-Ausdrücke in `scenarios.xml`;
 * sonst zeigte die App „XRechnung erkannt“, während die Prüfung kein Szenario findet.
 * Zusammen mit R3 (Zeichensatz) und R2 (keine DTD) ergibt das die Annahme einer XML-Datei.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { befund } from './befunde.ts'
import type { Befund, Belegart, Formaterkennung, Profil, Sha256, Syntax } from './typen.ts'
import { dekodiereXml, enthaeltDtd } from './zeichensatz.ts'

export const NAMENSRAUM = {
  ublInvoice: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  ublCreditNote: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
  cii: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
} as const

/** BT-24 → Profil (R4); Werte aus scenarios.xml bzw. an Mustang 2.26.0 bestätigt (Schritt 0.7). */
export const PROFILE: Record<string, Profil> = {
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0': 'xrechnung-3.0',
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0': 'xrechnung-3.0-extension',
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9': 'xrechnung-3.0-cvd',
  'urn:cen.eu:en16931:2017': 'en16931',
  'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic': 'zugferd-basic',
  'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended': 'zugferd-extended',
  'urn:factur-x.eu:1p0:minimum': 'zugferd-minimum',
  'urn:factur-x.eu:1p0:basicwl': 'zugferd-basic-wl',
}

export const PROFILNAME: Record<Profil, string> = {
  'xrechnung-3.0': 'XRechnung 3.0',
  'xrechnung-3.0-extension': 'XRechnung 3.0 Extension',
  'xrechnung-3.0-cvd': 'XRechnung 3.0 CVD',
  en16931: 'EN 16931',
  'zugferd-basic': 'ZUGFeRD BASIC',
  'zugferd-extended': 'ZUGFeRD EXTENDED',
  'zugferd-minimum': 'ZUGFeRD MINIMUM',
  'zugferd-basic-wl': 'ZUGFeRD BASIC WL',
  unbekannt: 'unbekanntes Profil',
}

export const SYNTAXNAME: Record<Syntax, string> = {
  'ubl-invoice': 'UBL',
  'ubl-creditnote': 'UBL Gutschrift',
  cii: 'CII',
}

type Knoten = Record<string, unknown>
type Bereich = Map<string, string>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
})

/** Namensraum-Deklarationen eines Elements in den Bereich übernehmen. */
function erweitere(bereich: Bereich, knoten: unknown): Bereich {
  if (!knoten || typeof knoten !== 'object') return bereich
  let neu: Bereich | null = null
  for (const [schluessel, wert] of Object.entries(knoten as Knoten)) {
    if (schluessel === '@_xmlns' || schluessel.startsWith('@_xmlns:')) {
      neu ??= new Map(bereich)
      neu.set(schluessel === '@_xmlns' ? '' : schluessel.slice(8), String(wert))
    }
  }
  return neu ?? bereich
}

function zerlege(name: string): [string, string] {
  const i = name.indexOf(':')
  return i < 0 ? ['', name] : [name.slice(0, i), name.slice(i + 1)]
}

/** Kindelemente mit Namensraum und lokalem Namen, jeweils mit ihrem Namensraum-Bereich. */
function kinder(knoten: unknown, bereich: Bereich, ns: string, lokal: string): { knoten: unknown; bereich: Bereich }[] {
  if (!knoten || typeof knoten !== 'object') return []
  const treffer: { knoten: unknown; bereich: Bereich }[] = []
  for (const [schluessel, wert] of Object.entries(knoten as Knoten)) {
    if (schluessel.startsWith('@_') || schluessel === '#text') continue
    const [praefix, name] = zerlege(schluessel)
    if (name !== lokal) continue
    for (const k of Array.isArray(wert) ? wert : [wert]) {
      const b = erweitere(bereich, k)
      if (b.get(praefix) === ns) treffer.push({ knoten: k, bereich: b })
    }
  }
  return treffer
}

function textInhalt(knoten: unknown): string {
  if (typeof knoten === 'string') return knoten
  if (knoten && typeof knoten === 'object') {
    const t = (knoten as Knoten)['#text']
    return typeof t === 'string' ? t : ''
  }
  return ''
}

export interface Wurzelinfo {
  lokal: string
  namensraum: string | null
  syntax: Syntax | null
  spezifikationsKennung: string | null
}

/** Wurzel, Namensraum und BT-24 aus wohlgeformtem XML lesen. */
export function leseWurzel(text: string): Wurzelinfo {
  const dokument = parser.parse(text) as Knoten
  const wurzelName = Object.keys(dokument).find((k) => !k.startsWith('?') && k !== '#text' && !k.startsWith('#'))
  if (!wurzelName) return { lokal: '', namensraum: null, syntax: null, spezifikationsKennung: null }
  const wurzel = dokument[wurzelName]
  const bereich = erweitere(new Map(), wurzel)
  const [praefix, lokal] = zerlege(wurzelName)
  const namensraum = bereich.get(praefix) ?? null
  let syntax: Syntax | null = null
  if (lokal === 'Invoice' && namensraum === NAMENSRAUM.ublInvoice) syntax = 'ubl-invoice'
  else if (lokal === 'CreditNote' && namensraum === NAMENSRAUM.ublCreditNote) syntax = 'ubl-creditnote'
  else if (lokal === 'CrossIndustryInvoice' && namensraum === NAMENSRAUM.cii) syntax = 'cii'
  let kennung: string | null = null
  if (syntax === 'ubl-invoice' || syntax === 'ubl-creditnote') {
    const id = kinder(wurzel, bereich, NAMENSRAUM.cbc, 'CustomizationID')[0]
    kennung = id ? textInhalt(id.knoten) : null
  } else if (syntax === 'cii') {
    const kontext = kinder(wurzel, bereich, NAMENSRAUM.cii, 'ExchangedDocumentContext')[0]
    const leitlinie = kontext && kinder(kontext.knoten, kontext.bereich, NAMENSRAUM.ram, 'GuidelineSpecifiedDocumentContextParameter')[0]
    const id = leitlinie && kinder(leitlinie.knoten, leitlinie.bereich, NAMENSRAUM.ram, 'ID')[0]
    kennung = id ? textInhalt(id.knoten) : null
  }
  return { lokal, namensraum, syntax, spezifikationsKennung: kennung }
}

export function profilAusKennung(kennung: string | null): Profil {
  return (kennung !== null && Object.hasOwn(PROFILE, kennung) ? PROFILE[kennung] : 'unbekannt') as Profil
}

export interface Rahmen {
  container: 'xml' | 'pdf-mit-xml'
  eingebettetAls: string | null
  xmlSha256: Sha256
}

export interface XmlEingang {
  format: Formaterkennung
  befunde: Befund[]
  /** dekodierter Text für die weitere Prüfung; null, wenn die Datei nicht weiter verarbeitet wird */
  text: string | null
  wohlgeformt: boolean
}

function sonstige(rahmen: Rahmen, zeichensatz: string | null, grund: string, teil: Partial<Formaterkennung> = {}): Formaterkennung {
  return {
    belegart: 'sonstige-rechnung',
    container: rahmen.container,
    syntax: null,
    profil: null,
    spezifikationsKennung: null,
    eingebettetAls: rahmen.eingebettetAls,
    xmlSha256: rahmen.xmlSha256,
    zeichensatz,
    grund,
    ...teil,
  }
}

/** R3, R2 und R4 für die Bytes einer XML-Datei (direkt hochgeladen oder aus einer PDF). */
export function erkenneXml(bytes: Uint8Array, rahmen: Rahmen): XmlEingang {
  const dekodiert = dekodiereXml(bytes)
  if (!dekodiert.ok) {
    return {
      format: sonstige(rahmen, dekodiert.zeichensatz, 'Zeichensatz nicht lesbar'),
      befunde: [befund('XML-ZEICHENSATZ', { zusatz: dekodiert.grund })],
      text: null,
      wohlgeformt: false,
    }
  }
  const { text, zeichensatz } = dekodiert
  if (enthaeltDtd(text)) {
    return {
      format: sonstige(rahmen, zeichensatz, 'Datei enthält eine DTD und wurde nicht gelesen'),
      befunde: [befund('SICHERHEIT-DTD')],
      text: null,
      wohlgeformt: false,
    }
  }
  const pruefung = XMLValidator.validate(text)
  if (pruefung !== true) {
    const { line, col, msg } = pruefung.err
    return {
      format: sonstige(rahmen, zeichensatz, 'Datei ist kein wohlgeformtes XML'),
      befunde: [befund('XML-WOHLGEFORMT', { ort: `${line}:${col}`, originaltext: msg })],
      text: null,
      wohlgeformt: false,
    }
  }
  const wurzel = leseWurzel(text)
  const befunde: Befund[] = []
  if (!wurzel.syntax) {
    befunde.push(befund('FORMAT-UNBEKANNT', { zusatz: `Wurzelelement: ${wurzel.lokal}${wurzel.namensraum ? ` (${wurzel.namensraum})` : ''}.` }))
    return { format: sonstige(rahmen, zeichensatz, 'Format wird nicht als E-Rechnung anerkannt'), befunde, text, wohlgeformt: true }
  }
  const profil = profilAusKennung(wurzel.spezifikationsKennung)
  let belegart: Belegart = 'e-rechnung'
  let grund: string | null = null
  if (profil === 'zugferd-minimum' || profil === 'zugferd-basic-wl') {
    belegart = 'sonstige-rechnung'
    grund = `Profil ${PROFILNAME[profil]} ist keine E-Rechnung (UStAE 14.1 Abs. 14)`
    befunde.push(befund('PROFIL-KEINE-ERECHNUNG'))
  }
  return {
    format: {
      belegart,
      container: rahmen.container,
      syntax: wurzel.syntax,
      profil,
      spezifikationsKennung: wurzel.spezifikationsKennung,
      eingebettetAls: rahmen.eingebettetAls,
      xmlSha256: rahmen.xmlSha256,
      zeichensatz,
      grund,
    },
    befunde,
    text,
    wohlgeformt: true,
  }
}

/** Anzeige wie „XRechnung 3.0, UBL“ für Schritt B1. */
export function formatBezeichnung(f: Formaterkennung): string {
  if (f.belegart === 'e-rechnung' && f.profil && f.syntax) return `${PROFILNAME[f.profil]}, ${SYNTAXNAME[f.syntax]}`
  if (f.container === 'pdf-ohne-xml') return 'PDF ohne E-Rechnung'
  if (f.container === 'bild') return 'Bild (Scan)'
  if (f.profil && f.profil !== 'unbekannt') return `${PROFILNAME[f.profil]} (keine E-Rechnung)`
  return 'sonstige Rechnung'
}
