/**
 * Befunde mit Klartext aus dem Katalog (R7). Eigene Regeln bringen Quelle, Stufe und
 * Fehlerklasse mit; bei Schematron-Regeln kommen Quelle und Stufe aus dem Regelwerk, die
 * Fehlerklasse folgt R7: Meldungen der Stufe fehler sind Geschäftsregelfehler (Rn. 6b).
 */
import { EIGENE_REGELN, type Katalogeintrag } from './klartext/katalog.ts'
import { REGELWERK } from './klartext/regelwerk.ts'
import type { Befund, Befundquelle, Fehlerklasse, Stufe } from './typen.ts'

export function katalogeintrag(regelId: string): Katalogeintrag | undefined {
  return EIGENE_REGELN[regelId] ?? REGELWERK[regelId]
}

export interface Befundangaben {
  quelle?: Befundquelle
  stufe?: Stufe
  fehlerklasse?: Fehlerklasse
  ustRelevant?: boolean | 'unklar'
  ort?: string | null
  btBezug?: string[]
  originaltext?: string | null
  /** ersetzt den Klartext des Katalogs */
  klartext?: string
  /** wird an den Klartext angehängt, z. B. konkrete Werte */
  zusatz?: string
  handlung?: string
}

const SCHEMATRON: Befundquelle[] = ['en16931', 'xrechnung']

export function befund(regelId: string, angaben: Befundangaben = {}): Befund {
  const e = katalogeintrag(regelId)
  const quelle = angaben.quelle ?? e?.quelle ?? 'plausibilitaet'
  const stufe = angaben.stufe ?? e?.stufe ?? 'fehler'
  const fehlerklasse =
    angaben.fehlerklasse ?? (SCHEMATRON.includes(quelle) ? (stufe === 'fehler' ? 'geschaeftsregelfehler' : 'keine') : (e?.fehlerklasse ?? 'keine'))
  const klartext =
    angaben.klartext ??
    e?.klartext ??
    `Die Regel ${regelId} des Regelwerks ${quelle === 'xrechnung' ? 'XRechnung' : quelle === 'en16931' ? 'EN 16931' : quelle} ist verletzt. Eine eigene Erklärung fehlt noch; maßgeblich ist der Originaltext des Regelwerks.`
  return {
    quelle,
    regelId,
    stufe,
    fehlerklasse,
    ustRelevant: angaben.ustRelevant ?? e?.ustRelevant ?? 'unklar',
    ort: angaben.ort ?? null,
    btBezug: angaben.btBezug ?? e?.btBezug ?? [],
    originaltext: angaben.originaltext ?? null,
    klartext: angaben.zusatz ? `${klartext} ${angaben.zusatz}` : klartext,
    handlung: angaben.handlung ?? e?.handlung ?? (stufe === 'fehler' ? 'Lieferanten den Befund schicken und eine korrigierte Rechnung anfordern.' : 'Hinweis prüfen; meist ist nichts zu tun.'),
  }
}
