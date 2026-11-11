/**
 * Prüfpipeline für eine E-Rechnung (R6) mit dem Verhalten des KoSIT-Validators:
 * Szenario per XPath aus scenarios.xml, XSD, Schematron nur nach gültigem XSD (Referenzlauf),
 * Stufen wie default-report.xsl, customLevel, Annahme.
 */
import { befund } from '../fach/befunde.ts'
import type { Befund, Formaterkennung } from '../fach/typen.ts'
import { alsUtf8Deklaration } from '../fach/zeichensatz.ts'
import { fuehreSchematronAus, parse, xpathWahr } from './schematron.ts'
import { annahme, levelAusSvrl, nachCustomLevel, STUFE_AUS_LEVEL } from './stufen.ts'
import { szenarien, type Level, type Szenario } from './szenarien.ts'
import { pruefeXsd } from './xsd.ts'

export interface Validierung {
  szenario: string | null
  wohlgeformt: boolean
  xsdGueltig: boolean | null
  angenommen: boolean
  eingeschraenktGeprueft: boolean
  befunde: Befund[]
  /** "Regel-ID:Stufe vor customLevel" je Meldung, wie der KoSIT-Bericht; XSD-Meldungen als "XSD:error" */
  meldungen: string[]
  /** geparstes Dokument für Extraktion und Ansicht; null, wenn nicht wohlgeformt */
  dokument: unknown | null
}

export function findeSzenario(dokument: unknown): Szenario | null {
  return szenarien().find((s) => xpathWahr(s.match, dokument, s.namensraeume)) ?? null
}

/** Prüft dekodierten XML-Text einer E-Rechnung. Befunde der Formaterkennung kommen vom Aufrufer. */
export async function validiere(text: string, format: Pick<Formaterkennung, 'spezifikationsKennung'>): Promise<Validierung> {
  const utf8 = alsUtf8Deklaration(text)
  const befunde: Befund[] = []
  const meldungen: string[] = []
  let dokument: unknown
  try {
    dokument = await parse(utf8)
  } catch (e) {
    befunde.push(befund('XML-WOHLGEFORMT', { originaltext: String((e as Error).message ?? e).slice(0, 500) }))
    return { szenario: null, wohlgeformt: false, xsdGueltig: null, angenommen: false, eingeschraenktGeprueft: false, befunde, meldungen, dokument: null }
  }
  const szenario = findeSzenario(dokument)
  if (!szenario) {
    befunde.push(befund('SZENARIO-FEHLT', { zusatz: format.spezifikationsKennung ? `Gefundene Kennung: ${format.spezifikationsKennung}` : 'Die Rechnung enthält keine Spezifikationskennung.' }))
    return { szenario: null, wohlgeformt: true, xsdGueltig: null, angenommen: false, eingeschraenktGeprueft: false, befunde, meldungen, dokument }
  }

  const xsd = await pruefeXsd(utf8, szenario.xsd)
  for (const m of xsd.meldungen) {
    meldungen.push('XSD:error')
    befunde.push(befund('XSD', { ort: m.zeile === null ? null : `${m.zeile}:${m.spalte ?? ''}`.replace(/:$/, ''), originaltext: m.text }))
  }

  let verarbeitungsfehler = false
  const levelNachCustom: Level[] = xsd.gueltig ? [] : ['error']
  // Wie der KoSIT-Validator: nach einem XSD-Fehler keine Schematron-Prüfung (Referenzlauf, M6)
  if (xsd.gueltig) {
    for (const ressource of szenario.schematron) {
      try {
        for (const m of fuehreSchematronAus(dokument, ressource.sef)) {
          const level = levelAusSvrl(m.flag, m.role)
          const nachCustom = nachCustomLevel(m.id, level, szenario)
          meldungen.push(`${m.id}:${level}`)
          levelNachCustom.push(nachCustom)
          befunde.push(befund(m.id, { quelle: ressource.quelle, stufe: STUFE_AUS_LEVEL[nachCustom], ort: m.ort, originaltext: m.text }))
        }
      } catch (e) {
        verarbeitungsfehler = true
        befunde.push(befund('PRUEFUNG-VERARBEITUNG', { zusatz: `Regelwerk: ${ressource.name}.`, originaltext: String((e as Error).message ?? e).slice(0, 500) }))
      }
    }
  }
  if (szenario.eingeschraenkt) befunde.push(befund('PRUEFUNG-EINGESCHRAENKT'))
  return {
    szenario: szenario.name,
    wohlgeformt: true,
    xsdGueltig: xsd.gueltig,
    angenommen: xsd.gueltig && annahme({ verarbeitungsfehler, szenario, levelNachCustom }),
    eingeschraenktGeprueft: szenario.eingeschraenkt,
    befunde,
    meldungen,
    dokument,
  }
}
