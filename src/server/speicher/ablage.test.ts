import { accessSync, constants, mkdtempSync, readdirSync, rmSync, statSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { kosit } from '../../testhilfen/dateien.ts'
import { Ablage, AblageFehler, endungFuer } from './ablage.ts'

const ordner: string[] = []
function neueAblage(): Ablage {
  const o = mkdtempSync(join(tmpdir(), 'bb-ablage-'))
  ordner.push(o)
  return new Ablage(o)
}
afterEach(() => {
  for (const o of ordner.splice(0)) {
    // schreibgeschützte Dateien vor dem Aufräumen wieder beschreibbar machen
    for (const e of readdirSync(o, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
    rmSync(o, { recursive: true, force: true })
  }
})

describe('Dateiablage nach SHA-256 (2.2)', () => {
  it('legt Originale inhaltsadressiert und schreibgeschützt ab', async () => {
    const ablage = neueAblage()
    const bytes = kosit('standard/01.01a-INVOICE_ubl.xml')
    const r = await ablage.speichereInhalt(bytes, 'xml')
    expect(r).toEqual({
      sha256: '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb',
      pfad: 'originale/0e/0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb.xml',
      neu: true,
    })
    const abs = ablage.absolut(r.pfad)
    expect(() => accessSync(abs, constants.W_OK)).toThrow()
    expect(statSync(abs).size).toBe(6887)
    expect(await ablage.lies(r.pfad)).toEqual(bytes)
  })

  it('legt eine gleiche Datei kein zweites Mal ab', async () => {
    const ablage = neueAblage()
    const bytes = kosit('standard/01.01a-INVOICE_ubl.xml')
    await ablage.speichereInhalt(bytes, 'xml')
    const zweites = await ablage.speichereInhalt(bytes, 'xml')
    expect(zweites.neu).toBe(false)
    expect(await ablage.alleDateien('originale')).toHaveLength(1)
    // gleichzeitig dieselbe Datei: eine Datei, kein Fehler
    const andere = kosit('standard/01.02a-INVOICE_ubl.xml')
    const parallel = await Promise.all([ablage.speichereInhalt(andere, 'xml'), ablage.speichereInhalt(andere, 'xml')])
    expect(parallel.filter((p) => p.neu)).toHaveLength(1)
    expect(await ablage.alleDateien('originale')).toHaveLength(2)
  })

  it('bemerkt eine veränderte Datei beim erneuten Ablegen', async () => {
    const ablage = neueAblage()
    const r = await ablage.speichereInhalt(new Uint8Array([1, 2, 3]), 'pdf')
    const abs = ablage.absolut(r.pfad)
    chmodSync(abs, 0o666)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(abs, new Uint8Array([9]))
    await expect(ablage.speichereInhalt(new Uint8Array([1, 2, 3]), 'pdf')).rejects.toThrow('Ablage beschädigt')
    expect(await ablage.hash(r.pfad)).not.toBe(r.sha256)
  })

  it('legt Prüfberichte je Beleg ab und überschreibt sie nie', async () => {
    const ablage = neueAblage()
    const id = '6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00'
    const r = await ablage.speichereBericht(id, 1, '{"angenommen":true}')
    expect(r.pfad).toBe(`berichte/${id}/1.json`)
    expect(r.bytes).toBe(19)
    await expect(ablage.speichereBericht(id, 1, '{}')).rejects.toBeInstanceOf(AblageFehler)
    await expect(ablage.speichereBericht('../x', 1, '{}')).rejects.toThrow('Unzulässige')
    expect(await ablage.alleDateien('berichte')).toEqual([`berichte/${id}/1.json`])
  })

  it('T-S4 (Ablage): keine Pfade außerhalb der Ablage', () => {
    const ablage = neueAblage()
    for (const p of ['../../x.xml', 'originale/../../x', '/etc/passwd', 'C:\\Windows\\win.ini', '', 'belegbruecke.sqlite']) {
      expect(() => ablage.absolut(p)).toThrow(AblageFehler)
    }
    expect(ablage.absolut('originale/0e/abc.xml')).toContain('originale')
  })

  it('kennt nur feste Endungen', async () => {
    const ablage = neueAblage()
    // @ts-expect-error absichtlich unzulässig
    await expect(ablage.speichereInhalt(new Uint8Array([1]), 'exe')).rejects.toThrow('Endung')
    expect(endungFuer('application/pdf')).toBe('pdf')
    expect(() => endungFuer('text/html')).toThrow()
  })
})
