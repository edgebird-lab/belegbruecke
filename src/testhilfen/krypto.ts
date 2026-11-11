import { createHash } from 'node:crypto'
import type { Sha256Funktion } from '../fach/typen.ts'

/** SHA-256 mit node:crypto für Tests. */
export const sha256: Sha256Funktion = (daten) => createHash('sha256').update(daten).digest('hex')
