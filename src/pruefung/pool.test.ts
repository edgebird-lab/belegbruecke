import { afterAll, describe, expect, it } from 'vitest'
import { kosit, text, zugferd } from '../testhilfen/dateien.ts'
import { erzeugePdf } from '../testhilfen/pdf.ts'
import { verarbeiteDatei } from './eingang.ts'
import { AuftragAbgebrochen, Prueferpool } from './pool.ts'

describe('Prüferpool mit echten Workern', () => {
  const pool = new Prueferpool({ anzahl: 2 })
  afterAll(() => pool.beenden())

  it('prüft XML und PDF im Worker', { timeout: 120_000 }, async () => {
    const [xml, pdf] = await Promise.all([
      verarbeiteDatei(kosit('standard/01.01a-INVOICE_ubl.xml'), 'xml', pool),
      verarbeiteDatei(zugferd('zf-en16931.pdf'), 'pdf', pool),
    ])
    expect(xml).toMatchObject({ angenommen: true, szenario: 'EN16931 XRechnung (UBL Invoice)' })
    expect(xml.daten?.rechnungsnummer).toBe('123456XX')
    expect(pdf.format).toMatchObject({ container: 'pdf-mit-xml', eingebettetAls: 'factur-x.xml' })
    expect(pdf.angenommen).toBe(true)
  })

  it('erzeugt die Ansicht im Worker', { timeout: 60_000 }, async () => {
    const html = await pool.ansicht(new TextDecoder().decode(kosit('standard/01.01a-INVOICE_uncefact.xml')), 'cii')
    expect(html).toContain('123456XX')
  })

  it('T-Z5: eingebettetes XML über 20 MB wird abgelehnt, der Worker bleibt unter der Speichergrenze', { timeout: 120_000 }, async () => {
    const gross = new Uint8Array(21 * 1024 * 1024).fill(0x20)
    gross.set(text('<a>'), 0)
    const r = await pool.pdf(erzeugePdf({ anhaenge: [{ name: 'factur-x.xml', bytes: gross }] }))
    expect(r.art).toBe('fehler')
    expect(r.befunde.map((b) => b.regelId)).toEqual(['PDF-XML-ZU-GROSS'])
    // Der Worker lebt weiter und prüft die nächste Datei
    const danach = await verarbeiteDatei(kosit('standard/01.02a-INVOICE_ubl.xml'), 'xml', pool)
    expect(danach.angenommen).toBe(true)
  })
})

describe('Prüferpool: Grenzen', () => {
  const testarbeiter = new URL('../testhilfen/testarbeiter.ts', import.meta.url)

  it('bricht nach dem Zeitlimit ab und ersetzt den Worker', { timeout: 30_000 }, async () => {
    const pool = new Prueferpool({ anzahl: 1, zeitlimitPdfMs: 300, workerDatei: testarbeiter })
    try {
      const start = performance.now()
      const r = await pool.pdf(new Uint8Array([1]))
      expect(performance.now() - start).toBeLessThan(5_000)
      expect(r).toEqual({ art: 'fehler', befunde: [expect.objectContaining({ regelId: 'PRUEFUNG-ZEITLIMIT', stufe: 'fehler' })] })
      // der Ersatz-Worker arbeitet
      expect(await pool.ansicht('hallo', 'cii')).toBe('echo:hallo')
    } finally {
      await pool.beenden()
    }
  })

  it('meldet einen Speicherüberlauf als PRUEFUNG-SPEICHER', { timeout: 60_000 }, async () => {
    const pool = new Prueferpool({ anzahl: 1, speicherMb: 32, workerDatei: testarbeiter })
    try {
      const r = await pool.xml(new Uint8Array([1]), { container: 'xml', eingebettetAls: null, xmlSha256: 'a'.repeat(64) })
      expect(r.angenommen).toBe(false)
      expect(r.befunde.map((b) => b.regelId)).toEqual(['PRUEFUNG-SPEICHER'])
      expect(r.format.xmlSha256).toBe('a'.repeat(64))
      expect(await pool.ansicht('weiter', 'cii')).toBe('echo:weiter')
    } finally {
      await pool.beenden()
    }
  })

  it('reicht Abbrüche bei direkter Ausführung als AuftragAbgebrochen weiter', { timeout: 30_000 }, async () => {
    const pool = new Prueferpool({ anzahl: 1, workerDatei: testarbeiter })
    try {
      await expect(pool.ausfuehren({ art: 'pdf', bytes: new Uint8Array() }, 200)).rejects.toBeInstanceOf(AuftragAbgebrochen)
    } finally {
      await pool.beenden()
    }
    await expect(pool.ansicht('x', 'cii')).rejects.toThrow('beendet')
  })
})
