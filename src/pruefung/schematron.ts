/**
 * Schematron mit SaxonJS (R6 Punkt 3): vorkompiliertes SEF auf das geparste Dokument anwenden,
 * Ergebnis ist SVRL; ausgewertet werden svrl:failed-assert und svrl:successful-report.
 */
import SaxonJS, { type SaxonKnoten } from 'saxon-js'
import { sef } from './artefakte.ts'

const SVRL = { svrl: 'http://purl.oclc.org/dsdl/svrl' }

export interface SvrlMeldung {
  id: string
  flag: string | null
  role: string | null
  ort: string | null
  text: string
}

/** Wirft bei Verarbeitungsfehlern des Regelwerks (z. B. XPath-Laufzeitfehler); der Aufrufer meldet sie. */
export function fuehreSchematronAus(dokument: unknown, sefName: string): SvrlMeldung[] {
  const svrl = SaxonJS.transform({ stylesheetInternal: sef(sefName), sourceNode: dokument, destination: 'document' }, 'sync').principalResult
  const knoten = SaxonJS.XPath.evaluate('//(svrl:failed-assert|svrl:successful-report)', svrl, { namespaceContext: SVRL, resultForm: 'array' }) as SaxonKnoten[]
  return knoten.map((k) => ({
    id: k.getAttribute('id') || 'UNSPECIFIC',
    flag: k.getAttribute('flag'),
    role: k.getAttribute('role'),
    ort: k.getAttribute('location'),
    text: String(SaxonJS.XPath.evaluate('normalize-space(svrl:text)', k, { namespaceContext: SVRL })),
  }))
}

/** XML-Text strikt parsen (SaxonJS); wirft bei nicht wohlgeformtem XML. */
export async function parse(text: string): Promise<unknown> {
  return SaxonJS.getResource({ text, type: 'xml' })
}

export function xpathWahr(ausdruck: string, dokument: unknown, namensraeume: Record<string, string>): boolean {
  return SaxonJS.XPath.evaluate(ausdruck, dokument, { namespaceContext: namensraeume }) === true
}

export function saxonVersion(): string {
  return SaxonJS.getProcessorInfo().productVersion
}
