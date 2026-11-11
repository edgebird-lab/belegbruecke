import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Datenbank } from './db.ts'
import { MIGRATIONEN, migriere } from './migrationen.ts'

const ordner: string[] = []
function neueDb(): { db: Datenbank; pfad: string } {
  const o = mkdtempSync(join(tmpdir(), 'bb-db-'))
  ordner.push(o)
  const pfad = join(o, 'test.sqlite')
  return { db: new Datenbank(pfad), pfad }
}
afterEach(() => {
  for (const o of ordner.splice(0)) rmSync(o, { recursive: true, force: true })
})

describe('Datenbank und Migrationen (2.1)', () => {
  it('legt alle Tabellen der Spezifikation STRICT an', () => {
    const { db } = neueDb()
    const tabellen = db.alle<{ name: string; strict: number }>("SELECT name, strict FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    expect(tabellen.map((t) => t.name)).toEqual([
      'belege',
      'benutzer',
      'dateien',
      'einstellungen',
      'exportlaeufe',
      'kontierungsregeln',
      'lieferanten',
      'postfach_gesehen',
      'protokoll',
      'sachkonten',
      'sicherheitslog',
    ])
    expect(tabellen.every((t) => t.strict === 1)).toBe(true)
    expect(db.eins<{ user_version: number }>('PRAGMA user_version')!.user_version).toBe(MIGRATIONEN.at(-1)!.version)
    expect(db.eins<{ journal_mode: string }>('PRAGMA journal_mode')!.journal_mode).toBe('wal')
    db.schliessen()
  })

  it('wendet Migrationen nur einmal an', () => {
    const { db, pfad } = neueDb()
    db.schliessen()
    const wieder = new Datenbank(pfad)
    expect(migriere(wieder)).toBe(MIGRATIONEN.at(-1)!.version)
    wieder.schliessen()
  })

  it('T-H5: UPDATE und DELETE auf protokoll brechen ab', () => {
    const { db } = neueDb()
    db.aendern("INSERT INTO protokoll (nr, zeitpunkt, json, vorgaenger_hash, hash) VALUES (1, 'z', '{}', 'v', 'h')")
    expect(() => db.aendern("UPDATE protokoll SET json = '{\"x\":1}' WHERE nr = 1")).toThrow('Protokoll ist unveränderbar')
    expect(() => db.aendern('DELETE FROM protokoll WHERE nr = 1')).toThrow('Protokoll ist unveränderbar')
    expect(db.eins<{ json: string }>('SELECT json FROM protokoll WHERE nr = 1')!.json).toBe('{}')
    db.schliessen()
  })

  it('STRICT lehnt falsche Typen ab', () => {
    const { db } = neueDb()
    expect(() => db.aendern("INSERT INTO sachkonten (nummer, bezeichnung) VALUES ('viertausend', 'x')")).toThrow()
    db.schliessen()
  })

  it('rollt Transaktionen bei Fehlern zurück, auch verschachtelt', () => {
    const { db } = neueDb()
    expect(() =>
      db.transaktion(() => {
        db.aendern("INSERT INTO sachkonten (nummer, bezeichnung) VALUES (4900, 'Testaufwand')")
        db.transaktion(() => db.aendern("INSERT INTO sachkonten (nummer, bezeichnung) VALUES (4901, 'Testaufwand Automatik')"))
        throw new Error('Abbruch')
      }),
    ).toThrow('Abbruch')
    expect(db.alle('SELECT * FROM sachkonten')).toEqual([])
    db.transaktion(() => db.aendern("INSERT INTO sachkonten (nummer, bezeichnung) VALUES (4900, 'Testaufwand')"))
    expect(db.alle<{ nummer: number }>('SELECT nummer FROM sachkonten')).toEqual([{ nummer: 4900 }])
    db.schliessen()
  })

  it('sichert die Datenbank mit VACUUM INTO und stellt sie wieder her', () => {
    const { db, pfad } = neueDb()
    db.aendern("INSERT INTO sachkonten (nummer, bezeichnung) VALUES (4900, 'Testaufwand')")
    const ziel = `${pfad}.sicherung`
    db.sichern(ziel)
    db.schliessen()
    const kopie = new Datenbank(ziel)
    expect(kopie.alle<{ nummer: number }>('SELECT nummer FROM sachkonten')).toEqual([{ nummer: 4900 }])
    kopie.schliessen()
  })
})
