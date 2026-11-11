import { chmodSync, cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lokalerAusfuehrer } from '../pruefung/eingang.ts'
import { ansicht } from '../pruefung/extraktion.ts'
import { kosit, zugferd } from '../testhilfen/dateien.ts'
import { testserver } from '../testhilfen/server.ts'
import { pruefeArchiv } from './dienste/kette.ts'
import { erzeugeDienste } from './dienste/kontext.ts'
import { sichereTaeglich } from './start.ts'

const ordner: string[] = []
function freigeben(o: string) {
  for (const e of readdirSync(o, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
  rmSync(o, { recursive: true, force: true })
}
afterEach(() => {
  for (const o of ordner.splice(0)) freigeben(o)
})

describe('Sicherung und Wiederherstellung (6.2)', () => {
  it('stellt Datenbank und Dateien aus der Sicherung wieder her; die Kette bleibt intakt', { timeout: 120_000 }, async () => {
    const s = testserver()
    await s.einrichten()
    await s.hochladen([
      { name: 'a.xml', bytes: kosit('standard/01.01a-INVOICE_ubl.xml') },
      { name: 'b.pdf', bytes: zugferd('zf-en16931.pdf') },
    ])
    const sicherung = sichereTaeglich(s.d)
    expect(sicherung).toMatch(/sicherung[\\/]belegbruecke-2026-11-11\.sqlite$/)
    expect(sichereTaeglich(s.d)).toBeNull() // höchstens eine Sicherung je Tag

    // Wiederherstellung in einen neuen Ordner: Datenbank aus der Sicherung, Dateien aus der Ordnersicherung
    const ziel = mkdtempSync(join(tmpdir(), 'bb-wiederhergestellt-'))
    ordner.push(ziel)
    cpSync(sicherung!, join(ziel, 'belegbruecke.sqlite'))
    cpSync(join(s.ordner, 'originale'), join(ziel, 'originale'), { recursive: true })
    cpSync(join(s.ordner, 'berichte'), join(ziel, 'berichte'), { recursive: true })
    s.aufraeumen()

    const d = erzeugeDienste({ datenOrdner: ziel, port: 8784, version: '0.0.1', pruefer: { ...lokalerAusfuehrer, ansicht: async (t, x) => ansicht(t, x) } })
    try {
      const belege = d.belege.liste()
      expect(belege.map((b) => b.laufnummer)).toEqual([2, 1])
      expect(belege.every((b) => b.pruefung !== null)).toBe(true)
      const bericht = await pruefeArchiv(d.db, d.ablage, d.protokoll)
      expect(bericht).toMatchObject({ ok: true, dateien: 4, fehler: [] })
      expect(await d.ablage.lies(belege[1].original.speicherpfad)).toEqual(kosit('standard/01.01a-INVOICE_ubl.xml'))
    } finally {
      d.db.schliessen()
    }
  })

  it('ohne die Dateien meldet die Kettenprüfung fehlende Originale', async () => {
    const s = testserver()
    await s.einrichten()
    await s.hochladen([{ name: 'a.xml', bytes: kosit('standard/01.01a-INVOICE_ubl.xml') }])
    const sicherung = sichereTaeglich(s.d)!
    const ziel = mkdtempSync(join(tmpdir(), 'bb-nur-db-'))
    ordner.push(ziel)
    cpSync(sicherung, join(ziel, 'belegbruecke.sqlite'))
    s.aufraeumen()
    const d = erzeugeDienste({ datenOrdner: ziel, port: 8784, version: '0.0.1', pruefer: { ...lokalerAusfuehrer, ansicht: async (t, x) => ansicht(t, x) } })
    try {
      const bericht = await pruefeArchiv(d.db, d.ablage, d.protokoll)
      expect(bericht.ok).toBe(false)
      expect(bericht.fehler.join(' ')).toContain('Original von B-00001 fehlt')
      expect(existsSync(join(ziel, 'originale'))).toBe(false)
    } finally {
      d.db.schliessen()
    }
  })
})
