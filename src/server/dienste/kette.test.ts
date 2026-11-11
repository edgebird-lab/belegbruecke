import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { kosit } from '../../testhilfen/dateien.ts'
import { Ablage } from '../speicher/ablage.ts'
import { Datenbank } from '../speicher/db.ts'
import { Protokoll } from '../speicher/protokoll.ts'
import { kettenberichtText, pruefeArchiv } from './kette.ts'

const BELEG = '6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00'
const ordner: string[] = []

function umgebung(zeiten: string[] = []) {
  const o = mkdtempSync(join(tmpdir(), 'bb-kette-'))
  ordner.push(o)
  const db = new Datenbank(join(o, 'test.sqlite'))
  const ablage = new Ablage(o)
  let i = 0
  const protokoll = new Protokoll(db, () => new Date(zeiten[i++] ?? '2026-11-11T10:00:00.000Z'))
  return { o, db, ablage, protokoll }
}

afterEach(() => {
  for (const o of ordner.splice(0)) {
    for (const e of readdirSync(o, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
    rmSync(o, { recursive: true, force: true })
  }
})

/** Ohne Trigger ändern, wie es ein Angreifer mit Dateizugriff könnte (nur Testdatenbank). */
function ohneTrigger(db: Datenbank, sql: string, p?: unknown[]) {
  db.ausfuehren('DROP TRIGGER protokoll_kein_update; DROP TRIGGER protokoll_kein_delete;')
  db.aendern(sql, p as never)
  db.ausfuehren(`CREATE TRIGGER protokoll_kein_update BEFORE UPDATE ON protokoll BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;
CREATE TRIGGER protokoll_kein_delete BEFORE DELETE ON protokoll BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;`)
}

function testvektorEintraege(protokoll: Protokoll) {
  const e1 = protokoll.anhaengen({
    akteur: { art: 'benutzer', id: '00000000-0000-4000-8000-000000000001' },
    aktion: 'eingang',
    belegId: BELEG,
    daten: { dateiname: '01.01a-INVOICE_ubl.xml', groesseBytes: 6887, quelle: 'upload', sha256: '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb' },
  })
  const e2 = protokoll.anhaengen({
    akteur: { art: 'system', dienst: 'pruefung' },
    aktion: 'pruefung',
    belegId: BELEG,
    daten: { angenommen: true, szenario: 'EN16931 XRechnung (UBL Invoice)' },
  })
  return [e1, e2]
}

describe('Protokoll und Kettenprüfung (R17, R18)', () => {
  it('T-H1: die Datenbank erzeugt die Hashes der Testvektoren', () => {
    const { db, protokoll } = umgebung(['2026-11-11T09:30:00.000Z', '2026-11-11T09:30:02.000Z'])
    const [e1, e2] = testvektorEintraege(protokoll)
    expect(e1.hash).toBe('677ce65d9a17299937acfd7d584dd1cb0bc8c45b3d0f9784f12cd48edf32b16a')
    expect(e2.hash).toBe('a94b3fe344515aaf7678b69bfda2832508a7640e5b6dba5827ca8b729bd62230')
    expect(protokoll.alle()).toEqual([e1, e2])
    expect(protokoll.fuerBeleg(BELEG)).toHaveLength(2)
    db.schliessen()
  })

  it('meldet eine intakte Kette und protokolliert die Prüfung', async () => {
    const { db, ablage, protokoll } = umgebung(['2026-11-11T09:30:00.000Z', '2026-11-11T09:30:02.000Z'])
    testvektorEintraege(protokoll)
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b).toMatchObject({ ok: true, eintraege: 2, dateien: 0, fehler: [] })
    expect(b.letzterEintrag?.hash).toBe('a94b3fe344515aaf7678b69bfda2832508a7640e5b6dba5827ca8b729bd62230')
    const letzter = protokoll.alle().at(-1)!
    expect(letzter).toMatchObject({ nr: 3, aktion: 'kette-geprueft', daten: { ok: true } })
    // die Prüfung selbst hält die Kette intakt
    expect((await pruefeArchiv(db, ablage, protokoll)).ok).toBe(true)
    expect(kettenberichtText(b)).toContain('in Ordnung')
    db.schliessen()
  })

  it('T-H2: Eintrag 1 nachträglich auf 6888 Byte geändert', async () => {
    const { db, ablage, protokoll } = umgebung(['2026-11-11T09:30:00.000Z', '2026-11-11T09:30:02.000Z'])
    const [e1] = testvektorEintraege(protokoll)
    const geaendert = { ...e1, daten: { ...e1.daten, groesseBytes: 6888 } }
    ohneTrigger(db, 'UPDATE protokoll SET json = ? WHERE nr = 1', [JSON.stringify(geaendert)])
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b.ok).toBe(false)
    expect(b.fehler).toEqual(['Eintrag 1 verändert'])
    expect(kettenberichtText(b)).toContain('- Eintrag 1 verändert')
    db.schliessen()
  })

  it('T-H3: Eintrag 2 von 3 gelöscht', async () => {
    const { db, ablage, protokoll } = umgebung()
    for (let i = 0; i < 3; i++) protokoll.anhaengen({ akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'pruefung', belegId: null, daten: { i } })
    ohneTrigger(db, 'DELETE FROM protokoll WHERE nr = 2')
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b.fehler[0]).toBe('Lücke nach Nr. 1')
    expect(b.fehler).toContain('Eintrag 3 verweist nicht auf den Hash seines Vorgängers')
    db.schliessen()
  })

  it('T-H4: ein Byte im Original geändert', async () => {
    const { db, ablage, protokoll } = umgebung()
    const bytes = kosit('standard/01.01a-INVOICE_ubl.xml')
    const datei = await ablage.speichereInhalt(bytes, 'xml')
    db.aendern(
      "INSERT INTO belege (id, laufnummer, status, eingang_am, original_sha256, json, geaendert_am) VALUES (?, 1, 'eingegangen', '2026-11-11T09:30:00.000Z', ?, '{}', '2026-11-11T09:30:00.000Z')",
      [BELEG, datei.sha256],
    )
    protokoll.anhaengen({ akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'eingang', belegId: BELEG, daten: { dateiname: 'a.xml', groesseBytes: bytes.length, quelle: 'upload', sha256: datei.sha256, pfad: datei.pfad } })
    expect((await pruefeArchiv(db, ablage, protokoll)).ok).toBe(true)
    const abs = ablage.absolut(datei.pfad)
    chmodSync(abs, 0o666)
    const kaputt = new Uint8Array(bytes)
    kaputt[100] ^= 0x01
    writeFileSync(abs, kaputt)
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b.fehler).toEqual(['Original von B-00001 verändert'])
    db.schliessen()
  })

  it('meldet fehlende Dateien und Dateien ohne Protokolleintrag', async () => {
    const { db, ablage, protokoll } = umgebung()
    await ablage.speichereInhalt(new Uint8Array([1, 2, 3]), 'pdf')
    protokoll.anhaengen({ akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'pruefung', belegId: BELEG, daten: { angenommen: false, bericht: `berichte/${BELEG}/1.json`, berichtSha256: 'a'.repeat(64) } })
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b.fehler).toHaveLength(2)
    expect(b.fehler[0]).toMatch(/^Prüfbericht von .* fehlt/)
    expect(b.fehler[1]).toMatch(/^Datei ohne Protokolleintrag: originale\//)
    db.schliessen()
  })

  it('gleicht Kettenanker aus Übergabeprotokollen ab', async () => {
    const { db, ablage, protokoll } = umgebung()
    const e = protokoll.anhaengen({ akteur: { art: 'system', dienst: 'export' }, aktion: 'exportiert', belegId: null, daten: {} })
    expect((await pruefeArchiv(db, ablage, protokoll, { anker: [{ nr: e.nr, hash: e.hash }] })).ok).toBe(true)
    expect((await pruefeArchiv(db, ablage, protokoll, { anker: [{ nr: e.nr, hash: 'f'.repeat(64) }] })).fehler).toEqual(['Kettenanker Nr. 1 passt nicht zum Protokoll'])
    db.schliessen()
  })

  it('prüft 10.000 Einträge und 300 Dateien weit unter 30 s', { timeout: 120_000 }, async () => {
    const { db, ablage, protokoll } = umgebung()
    db.transaktion(() => {
      for (let i = 0; i < 10_000; i++) protokoll.anhaengen({ akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'pruefung', belegId: null, daten: { i, text: 'x'.repeat(200) } })
    })
    for (let i = 0; i < 300; i++) {
      const d = await ablage.speichereInhalt(new TextEncoder().encode(`<datei nr="${i}">${'y'.repeat(5000)}</datei>`), 'xml')
      protokoll.anhaengen({ akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'eingang', belegId: null, daten: { sha256: d.sha256, pfad: d.pfad } })
    }
    const b = await pruefeArchiv(db, ablage, protokoll)
    expect(b.ok).toBe(true)
    expect(b.eintraege).toBe(10_300)
    expect(b.dauerMs).toBeLessThan(30_000)
    db.schliessen()
  })
})
