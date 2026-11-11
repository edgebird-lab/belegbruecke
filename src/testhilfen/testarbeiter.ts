/**
 * Test-Worker für den Prüferpool: „pdf“ rechnet endlos (Zeitlimit), „xml“ belegt Speicher bis
 * zum Überlauf (Speichergrenze), „ansicht“ antwortet sofort.
 */
import { parentPort } from 'node:worker_threads'
import type { Nachricht } from '../pruefung/worker.ts'

parentPort?.on('message', (n: Nachricht) => {
  const a = n.auftrag
  if (a.art === 'pdf') {
    let i = 0
    for (;;) i = (i + 1) % 1_000_000
  }
  if (a.art === 'xml') {
    const halde: number[][] = []
    for (;;) halde.push(Array.from({ length: 100_000 }, (_, i) => i * Math.random()))
  }
  parentPort!.postMessage({ id: n.id, ok: true, ergebnis: `echo:${a.text}` })
})
