/**
 * GoBD-Protokoll mit SHA-256-Hashkette (R17). Jeder Eintrag entsteht in derselben Transaktion
 * wie die Änderung, die er beschreibt; Trigger verhindern UPDATE und DELETE (Schritt 2.1).
 */
import { createHash } from 'node:crypto'
import { neuerEintrag } from '../../fach/hashkette.ts'
import type { Akteur, Aktion, Protokolleintrag, Sha256Funktion, Uuid } from '../../fach/typen.ts'
import type { Datenbank } from './db.ts'

export const sha256: Sha256Funktion = (b) => createHash('sha256').update(b).digest('hex')

export interface Eintragsangaben {
  akteur: Akteur
  aktion: Aktion
  belegId: Uuid | null
  daten: Record<string, unknown>
}

interface Zeile {
  nr: number
  json: string
  vorgaenger_hash: string
  hash: string
}

function ausZeile(z: Zeile): Protokolleintrag {
  const e = JSON.parse(z.json) as Protokolleintrag
  // Nummer und Hashes aus den Spalten; der Rest aus dem JSON. Abweichungen fallen bei der Neuberechnung auf.
  return { nr: z.nr, zeitpunkt: e.zeitpunkt, akteur: e.akteur, aktion: e.aktion, belegId: e.belegId, daten: e.daten, vorgaengerHash: z.vorgaenger_hash, hash: z.hash }
}

export class Protokoll {
  private readonly db: Datenbank
  private readonly uhr: () => Date

  constructor(db: Datenbank, uhr: () => Date = () => new Date()) {
    this.db = db
    this.uhr = uhr
  }

  /** Hängt einen Eintrag an; läuft in der umgebenden Transaktion, sonst in einer eigenen. */
  anhaengen(angaben: Eintragsangaben): Protokolleintrag {
    return this.db.transaktion(() => {
      const letzter = this.db.eins<{ nr: number; hash: string }>('SELECT nr, hash FROM protokoll ORDER BY nr DESC LIMIT 1') ?? null
      const e = neuerEintrag(letzter, { ...angaben, zeitpunkt: this.uhr().toISOString() }, sha256)
      this.db.aendern('INSERT INTO protokoll (nr, zeitpunkt, json, vorgaenger_hash, hash) VALUES (?, ?, ?, ?, ?)', [e.nr, e.zeitpunkt, JSON.stringify(e), e.vorgaengerHash, e.hash])
      return e
    })
  }

  alle(): Protokolleintrag[] {
    return this.db.alle<Zeile>('SELECT nr, json, vorgaenger_hash, hash FROM protokoll ORDER BY nr').map(ausZeile)
  }

  fuerBeleg(belegId: Uuid): Protokolleintrag[] {
    return this.db.alle<Zeile>("SELECT nr, json, vorgaenger_hash, hash FROM protokoll WHERE json_extract(json, '$.belegId') = ? ORDER BY nr", [belegId]).map(ausZeile)
  }

  letzter(): { nr: number; hash: string } | null {
    return this.db.eins<{ nr: number; hash: string }>('SELECT nr, hash FROM protokoll ORDER BY nr DESC LIMIT 1') ?? null
  }

  anzahl(): number {
    return this.db.eins<{ n: number }>('SELECT count(*) AS n FROM protokoll')!.n
  }
}
