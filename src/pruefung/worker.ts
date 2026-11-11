/**
 * Prüf-Worker: führt PDF-Auslesen, Prüfung und Ansicht in einem eigenen Thread aus, damit
 * Zeit- und Speichergrenzen greifen und ein Absturz den Server nicht trifft (R5, R6 Punkt 8).
 */
import { parentPort } from 'node:worker_threads'
import type { Rahmen } from '../fach/formaterkennung.ts'
import type { Syntax } from '../fach/typen.ts'
import { pruefeXmlTeil } from './eingang.ts'
import { ansicht } from './extraktion.ts'
import { leseRechnungsXml } from './pdf.ts'

export type Auftrag =
  | { art: 'pdf'; bytes: Uint8Array }
  | { art: 'xml'; bytes: Uint8Array; rahmen: Rahmen }
  | { art: 'ansicht'; text: string; syntax: Syntax }

export type Nachricht = { id: number; auftrag: Auftrag }
export type Antwort = { id: number; ok: true; ergebnis: unknown } | { id: number; ok: false; fehler: string }

async function bearbeite(a: Auftrag): Promise<unknown> {
  switch (a.art) {
    case 'pdf':
      return leseRechnungsXml(a.bytes)
    case 'xml':
      return pruefeXmlTeil(a.bytes, a.rahmen)
    case 'ansicht':
      return ansicht(a.text, a.syntax)
  }
}

parentPort?.on('message', (n: Nachricht) => {
  bearbeite(n.auftrag).then(
    (ergebnis) => parentPort!.postMessage({ id: n.id, ok: true, ergebnis } satisfies Antwort),
    (e: unknown) => parentPort!.postMessage({ id: n.id, ok: false, fehler: String((e as Error)?.message ?? e) } satisfies Antwort),
  )
})
