/**
 * Prüfszenarien (R6 Punkt 1): die 11 Szenarien aus scenarios.xml der KoSIT-Konfiguration in
 * Dateireihenfolge, danach zwei eigene für Factur-X BASIC und EXTENDED (CII).
 */
import { XMLParser } from 'fast-xml-parser'
import { liesKonfiguration } from './artefakte.ts'

export type Level = 'error' | 'warning' | 'information'

export interface Schematronressource {
  name: string
  /** Name der SEF-Datei ohne Endung, z. B. "EN16931-UBL-validation" */
  sef: string
  quelle: 'en16931' | 'xrechnung'
}

export interface Szenario {
  name: string
  /** XPath-Ausdruck aus scenarios.xml, unverändert */
  match: string
  namensraeume: Record<string, string>
  /** Pfad des Haupt-XSD relativ zur Konfiguration */
  xsd: string
  schematron: Schematronressource[]
  customLevel: Map<string, Level>
  eigen: boolean
  eingeschraenkt: boolean
}

/**
 * Regeln, die das CEN-Schematron bei gültigen EXTENDED-Rechnungen als Fehler meldet
 * (Mustang-Vergleich in Schritt 0.7, testdaten/referenz/mustang-2.26.0.json).
 */
export const EXTENDED_WARNUNGEN = [
  'BR-22',
  'BR-23',
  'BR-26',
  'BR-27',
  'BR-CO-04',
  'BR-CO-10',
  'BR-CO-12',
  'BR-S-08',
  'BR-S-10',
  'CII-DT-021',
  'CII-DT-027',
  'CII-SR-439',
] as const

const CII_NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
}
const CII_XSD = 'resources/cii/16b/xsd/CrossIndustryInvoice_100pD16B.xsd'
const CEN_CII: Schematronressource = { name: 'Schematron rules for EN16931 (CII)', sef: 'EN16931-CII-validation', quelle: 'en16931' }

function ciiMatch(kennung: string): string {
  return `exists(/rsm:CrossIndustryInvoice[rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID/text() = '${kennung}'])`
}

export const EIGENE_SZENARIEN: Szenario[] = [
  {
    name: 'Factur-X BASIC (CII)',
    match: ciiMatch('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic'),
    namensraeume: CII_NS,
    xsd: CII_XSD,
    schematron: [CEN_CII],
    customLevel: new Map(),
    eigen: true,
    eingeschraenkt: false,
  },
  {
    name: 'Factur-X EXTENDED (CII)',
    match: ciiMatch('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended'),
    namensraeume: CII_NS,
    xsd: CII_XSD,
    schematron: [CEN_CII],
    customLevel: new Map(EXTENDED_WARNUNGEN.map((id) => [id, 'warning'])),
    eigen: true,
    eingeschraenkt: true,
  },
]

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => ['scenario', 'namespace', 'validateWithSchematron', 'customLevel'].includes(name),
})

interface RohSzenario {
  name: string
  match: string
  namespace: { '@_prefix': string; '#text': string }[]
  validateWithXmlSchema: { resource: { location: string } }
  validateWithSchematron: { resource: { name: string; location: string } }[]
  createReport?: { customLevel?: { '@_level': string; '#text': string }[] }
}

let geladen: Szenario[] | null = null

/** Szenarien der KoSIT-Konfiguration in Dateireihenfolge, gefolgt von den eigenen. */
export function szenarien(): Szenario[] {
  if (geladen) return geladen
  const roh = parser.parse(liesKonfiguration('scenarios.xml')) as { scenarios: { scenario: RohSzenario[] } }
  const kosit = roh.scenarios.scenario.map((s): Szenario => {
    const customLevel = new Map<string, Level>()
    for (const c of s.createReport?.customLevel ?? []) {
      // Ein customLevel-Eintrag kann mehrere Codes durch Leerraum getrennt enthalten (tokenize in default-report.xsl)
      for (const code of c['#text'].trim().split(/\s+/)) customLevel.set(code, c['@_level'] as Level)
    }
    return {
      name: s.name.trim(),
      match: s.match.trim(),
      namensraeume: Object.fromEntries(s.namespace.map((n) => [n['@_prefix'], n['#text'].trim()])),
      xsd: s.validateWithXmlSchema.resource.location.trim(),
      schematron: s.validateWithSchematron.map((v) => {
        const datei = v.resource.location.trim().split('/').pop()!.replace(/\.xsl$/, '')
        return { name: v.resource.name.trim(), sef: datei, quelle: datei.startsWith('XRechnung') ? 'xrechnung' : 'en16931' }
      }),
      customLevel,
      eigen: false,
      eingeschraenkt: false,
    }
  })
  geladen = [...kosit, ...EIGENE_SZENARIEN]
  return geladen
}
