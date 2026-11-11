/**
 * Einziger Zugang zur Datenbank (Spezifikation 7.5): node:sqlite, WAL-Modus, Fremdschlüssel an.
 * Alles andere nutzt nur diese Schnittstelle, damit better-sqlite3 als Rückfall ohne weitere
 * Änderungen passt.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { migriere } from './migrationen.ts'

export type Parameter = Record<string, SQLInputValue> | SQLInputValue[]

export class Datenbank {
  private readonly db: DatabaseSync
  private tiefe = 0

  constructor(pfad: string) {
    this.db = new DatabaseSync(pfad)
    this.db.exec('PRAGMA foreign_keys = ON')
    if (pfad !== ':memory:') this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    migriere(this)
  }

  ausfuehren(sql: string): void {
    this.db.exec(sql)
  }

  private binde(sql: string, p?: Parameter) {
    const s = this.db.prepare(sql)
    return { s, args: p === undefined ? [] : Array.isArray(p) ? p : [p] }
  }

  alle<T>(sql: string, p?: Parameter): T[] {
    const { s, args } = this.binde(sql, p)
    return s.all(...(args as SQLInputValue[])) as T[]
  }

  eins<T>(sql: string, p?: Parameter): T | undefined {
    const { s, args } = this.binde(sql, p)
    return s.get(...(args as SQLInputValue[])) as T | undefined
  }

  aendern(sql: string, p?: Parameter): { changes: number } {
    const { s, args } = this.binde(sql, p)
    const r = s.run(...(args as SQLInputValue[]))
    return { changes: Number(r.changes) }
  }

  /** Synchrone Transaktion; verschachtelte Aufrufe laufen in der äußeren mit. */
  transaktion<T>(fn: () => T): T {
    if (this.tiefe > 0) {
      this.tiefe++
      try {
        return fn()
      } finally {
        this.tiefe--
      }
    }
    this.db.exec('BEGIN IMMEDIATE')
    this.tiefe = 1
    try {
      const ergebnis = fn()
      this.db.exec('COMMIT')
      return ergebnis
    } catch (e) {
      this.db.exec('ROLLBACK')
      throw e
    } finally {
      this.tiefe = 0
    }
  }

  /** Konsistente Kopie der Datenbank (VACUUM INTO), z. B. für die tägliche Sicherung. */
  sichern(ziel: string): void {
    this.db.prepare('VACUUM INTO ?').run(ziel)
  }

  schliessen(): void {
    this.db.close()
  }
}
