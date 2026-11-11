import { describe, expect, it } from 'vitest'
import { kosit, text, zugferd } from '../testhilfen/dateien.ts'
import { bereinigeDateiname, erkenneDateiart, GRENZEN, pruefeAnnahme } from './annahme.ts'

describe('Dateiart nach Inhalt (R1 Punkt 1)', () => {
  it('erkennt XML, PDF, JPEG und PNG', () => {
    expect(erkenneDateiart(kosit('standard/01.01a-INVOICE_ubl.xml'))).toBe('xml')
    expect(erkenneDateiart(zugferd('zf-en16931.pdf'))).toBe('pdf')
    expect(erkenneDateiart(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpeg')
    expect(erkenneDateiart(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png')
  })

  it('T-F6: eine PDF mit Endung .xml bleibt eine PDF', () => {
    // Der Dateiname spielt keine Rolle; nur die Bytes zählen
    const r = pruefeAnnahme(zugferd('zf-en16931.pdf'))
    expect(r).toMatchObject({ ok: true, art: 'pdf', mimeTyp: 'application/pdf' })
  })

  it('erkennt XML nach BOM und Leerraum, auch in UTF-16', () => {
    expect(erkenneDateiart(new Uint8Array([0xef, 0xbb, 0xbf, 0x20, 0x0a, 0x3c, 0x61]))).toBe('xml')
    expect(erkenneDateiart(text('\r\n\t <rechnung/>'))).toBe('xml')
    // UTF-16 LE mit BOM: FF FE, dann Leerzeichen und "<"
    expect(erkenneDateiart(new Uint8Array([0xff, 0xfe, 0x20, 0x00, 0x3c, 0x00]))).toBe('xml')
    // UTF-16 BE mit BOM
    expect(erkenneDateiart(new Uint8Array([0xfe, 0xff, 0x00, 0x3c, 0x00, 0x61]))).toBe('xml')
    // UTF-16 LE ohne BOM
    expect(erkenneDateiart(new Uint8Array([0x3c, 0x00, 0x3f, 0x00]))).toBe('xml')
  })

  it('lehnt anderes ab', () => {
    expect(erkenneDateiart(text('Hallo <rechnung/>'))).toBeNull()
    expect(erkenneDateiart(text('PK\u0003\u0004'))).toBeNull()
    expect(erkenneDateiart(text('   '))).toBeNull()
    expect(erkenneDateiart(text('%PDX-1.7'))).toBeNull()
    expect(pruefeAnnahme(text('GIF89a'))).toMatchObject({ ok: false, code: 'DATEI-TYP' })
    expect(pruefeAnnahme(new Uint8Array())).toMatchObject({ ok: false, code: 'DATEI-LEER' })
  })
})

describe('Größengrenzen (R1 Punkt 2)', () => {
  it('T-F7: 25 MB XML wird abgelehnt', () => {
    const gross = new Uint8Array(25 * 1024 * 1024).fill(0x20)
    gross[0] = 0x3c
    const r = pruefeAnnahme(gross)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('DATEI-GROESSE')
      expect(r.text).toContain('zu groß')
      expect(r.text).toContain('25 MB')
      expect(r.text).toContain('20 MB')
    }
  })

  it('nimmt Dateien genau an der Grenze an', () => {
    const xml = new Uint8Array(GRENZEN.xml).fill(0x20)
    xml[0] = 0x3c
    expect(pruefeAnnahme(xml).ok).toBe(true)
    const zuViel = new Uint8Array(GRENZEN.xml + 1).fill(0x20)
    zuViel[0] = 0x3c
    expect(pruefeAnnahme(zuViel).ok).toBe(false)
  })

  it('hat eigene Grenzen für PDF und Bilder', () => {
    const pdf = new Uint8Array(GRENZEN.xml + 10)
    pdf.set(text('%PDF-1.7'))
    expect(pruefeAnnahme(pdf).ok).toBe(true) // 20 MB + 10 Byte sind für PDF erlaubt
    const bild = new Uint8Array(GRENZEN.bild + 1)
    bild.set([0x89, 0x50, 0x4e, 0x47])
    expect(pruefeAnnahme(bild)).toMatchObject({ ok: false, code: 'DATEI-GROESSE' })
  })
})

describe('bereinigeDateiname', () => {
  it('entfernt Pfade und Steuerzeichen (T-S4 Vorstufe)', () => {
    expect(bereinigeDateiname('../../x.xml')).toBe('x.xml')
    expect(bereinigeDateiname('C:\\Windows\\win.ini')).toBe('win.ini')
    expect(bereinigeDateiname('a\u0000b<c>.xml')).toBe('a_b_c_.xml')
    expect(bereinigeDateiname('')).toBe('unbenannt')
    expect(bereinigeDateiname('x'.repeat(300))).toHaveLength(200)
  })
})
