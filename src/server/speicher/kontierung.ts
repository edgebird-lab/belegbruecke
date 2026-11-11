/** Lieferanten, Sachkonten, Kontierungsregeln und Exportläufe in der Datenbank (Spezifikation 7.5). */
import type { Exportlauf, Kontierungsregel, Lieferant, Sachkonto, Uuid } from '../../fach/typen.ts'
import type { Datenbank } from './db.ts'

export class Lieferantenspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  alle(): Lieferant[] {
    return this.db.alle<{ json: string }>('SELECT json FROM lieferanten ORDER BY name COLLATE NOCASE, id').map((z) => JSON.parse(z.json) as Lieferant)
  }

  hole(id: Uuid): Lieferant | null {
    const z = this.db.eins<{ json: string }>('SELECT json FROM lieferanten WHERE id = ?', [id])
    return z ? (JSON.parse(z.json) as Lieferant) : null
  }

  nachSchluessel(schluessel: string): Lieferant | null {
    const z = this.db.eins<{ json: string }>('SELECT json FROM lieferanten WHERE schluessel = ?', [schluessel])
    return z ? (JSON.parse(z.json) as Lieferant) : null
  }

  anlegen(l: Lieferant): void {
    this.db.aendern('INSERT INTO lieferanten (id, schluessel, name, kreditor_konto, json) VALUES (?, ?, ?, ?, ?)', [l.id, l.schluessel, l.name, l.kreditorKonto, JSON.stringify(l)])
  }

  aktualisieren(l: Lieferant): void {
    const r = this.db.aendern('UPDATE lieferanten SET schluessel = ?, name = ?, kreditor_konto = ?, json = ? WHERE id = ?', [l.schluessel, l.name, l.kreditorKonto, JSON.stringify(l), l.id])
    if (r.changes !== 1) throw new Error(`Lieferant ${l.id} nicht gefunden`)
  }

  /** Vergebene Kreditorenkonten, optional ohne einen Lieferanten. */
  vergebeneKreditoren(ausser: Uuid | null = null): number[] {
    return this.db
      .alle<{ k: number }>('SELECT kreditor_konto AS k FROM lieferanten WHERE kreditor_konto IS NOT NULL AND id IS NOT ?', [ausser])
      .map((z) => z.k)
  }
}

interface Kontozeile {
  nummer: number
  bezeichnung: string
  automatikkonto: number
  aktiv: number
}

const kontoAus = (z: Kontozeile): Sachkonto => ({ nummer: z.nummer, bezeichnung: z.bezeichnung, automatikkonto: z.automatikkonto === 1, aktiv: z.aktiv === 1 })

export class Sachkontenspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  alle(): Sachkonto[] {
    return this.db.alle<Kontozeile>('SELECT * FROM sachkonten ORDER BY nummer').map(kontoAus)
  }

  hole(nummer: number): Sachkonto | null {
    const z = this.db.eins<Kontozeile>('SELECT * FROM sachkonten WHERE nummer = ?', [nummer])
    return z ? kontoAus(z) : null
  }

  /** Legt an oder ändert; liefert den alten Stand (null = neu). */
  speichern(k: Sachkonto): Sachkonto | null {
    const alt = this.hole(k.nummer)
    this.db.aendern(
      'INSERT INTO sachkonten (nummer, bezeichnung, automatikkonto, aktiv) VALUES (?, ?, ?, ?) ON CONFLICT (nummer) DO UPDATE SET bezeichnung = excluded.bezeichnung, automatikkonto = excluded.automatikkonto, aktiv = excluded.aktiv',
      [k.nummer, k.bezeichnung, k.automatikkonto ? 1 : 0, k.aktiv ? 1 : 0],
    )
    return alt
  }
}

interface Regelzeile {
  lieferant_id: string
  steuerkategorie: string
  steuersatz: string
  sachkonto: number
  bu_schluessel: string | null
  anzahl: number
  zuletzt: string
}

const regelAus = (z: Regelzeile): Kontierungsregel => ({
  lieferantId: z.lieferant_id,
  steuerkategorie: z.steuerkategorie,
  steuersatz: z.steuersatz,
  sachkonto: z.sachkonto,
  buSchluessel: z.bu_schluessel,
  anzahl: z.anzahl,
  zuletzt: z.zuletzt,
})

export class Regelspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  fuerLieferant(lieferantId: Uuid): Kontierungsregel[] {
    return this.db.alle<Regelzeile>('SELECT * FROM kontierungsregeln WHERE lieferant_id = ? ORDER BY steuerkategorie, steuersatz', [lieferantId]).map(regelAus)
  }

  speichern(r: Kontierungsregel): void {
    this.db.aendern(
      `INSERT INTO kontierungsregeln (lieferant_id, steuerkategorie, steuersatz, sachkonto, bu_schluessel, anzahl, zuletzt) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (lieferant_id, steuerkategorie, steuersatz) DO UPDATE SET sachkonto = excluded.sachkonto, bu_schluessel = excluded.bu_schluessel, anzahl = excluded.anzahl, zuletzt = excluded.zuletzt`,
      [r.lieferantId, r.steuerkategorie, r.steuersatz, r.sachkonto, r.buSchluessel, r.anzahl, r.zuletzt],
    )
  }

  entfernen(r: Pick<Kontierungsregel, 'lieferantId' | 'steuerkategorie' | 'steuersatz'>): void {
    this.db.aendern('DELETE FROM kontierungsregeln WHERE lieferant_id = ? AND steuerkategorie = ? AND steuersatz = ?', [r.lieferantId, r.steuerkategorie, r.steuersatz])
  }

  /** Zuletzt genutzte Sachkonten (für die Suche in B5), neueste zuerst. */
  zuletztGenutzt(grenze = 10): number[] {
    return this.db.alle<{ sachkonto: number }>('SELECT sachkonto FROM kontierungsregeln GROUP BY sachkonto ORDER BY max(zuletzt) DESC LIMIT ?', [grenze]).map((z) => z.sachkonto)
  }
}

export class Exportspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  alle(): Exportlauf[] {
    return this.db.alle<{ json: string }>('SELECT json FROM exportlaeufe ORDER BY monat DESC, nachtrag_nr DESC').map((z) => JSON.parse(z.json) as Exportlauf)
  }

  hole(id: Uuid): Exportlauf | null {
    const z = this.db.eins<{ json: string }>('SELECT json FROM exportlaeufe WHERE id = ?', [id])
    return z ? (JSON.parse(z.json) as Exportlauf) : null
  }

  anlegen(l: Exportlauf): void {
    this.db.aendern('INSERT INTO exportlaeufe (id, monat, nachtrag_nr, json) VALUES (?, ?, ?, ?)', [l.id, l.monat, l.nachtragNr, JSON.stringify(l)])
  }
}
