/** Einstellungen und Benutzer in der Datenbank. */
import { standardEinstellungen } from '../../fach/einstellungen.ts'
import type { Benutzer, Einstellungen, Uuid } from '../../fach/typen.ts'
import type { Datenbank } from './db.ts'

export class Einstellungsspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  lies(): Einstellungen {
    const z = this.db.eins<{ json: string }>('SELECT json FROM einstellungen WHERE id = 1')
    return z ? (JSON.parse(z.json) as Einstellungen) : standardEinstellungen()
  }

  schreibe(e: Einstellungen, jetzt: string): void {
    this.db.aendern(
      'INSERT INTO einstellungen (id, json, geaendert_am) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, geaendert_am = excluded.geaendert_am',
      [JSON.stringify(e), jetzt],
    )
  }
}

interface Benutzerzeile {
  id: string
  anmeldename: string
  name: string
  passwort_hash: string
  aktiv: number
  angelegt_am: string
}

const ausZeile = (z: Benutzerzeile): Benutzer => ({ id: z.id, anmeldename: z.anmeldename, name: z.name, passwortHash: z.passwort_hash, aktiv: z.aktiv === 1, angelegtAm: z.angelegt_am })

export class Benutzerspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  anzahl(): number {
    return this.db.eins<{ n: number }>('SELECT count(*) AS n FROM benutzer')!.n
  }

  nachName(anmeldename: string): Benutzer | null {
    const z = this.db.eins<Benutzerzeile>('SELECT * FROM benutzer WHERE anmeldename = ?', [anmeldename])
    return z ? ausZeile(z) : null
  }

  nachId(id: Uuid): Benutzer | null {
    const z = this.db.eins<Benutzerzeile>('SELECT * FROM benutzer WHERE id = ?', [id])
    return z ? ausZeile(z) : null
  }

  anlegen(b: Benutzer): void {
    this.db.aendern('INSERT INTO benutzer (id, anmeldename, name, passwort_hash, aktiv, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [
      b.id,
      b.anmeldename,
      b.name,
      b.passwortHash,
      b.aktiv ? 1 : 0,
      b.angelegtAm,
    ])
  }
}
