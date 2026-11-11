import { describe, expect, it } from 'vitest'
import { centAlsDezimal, parseBetrag, steuerAusSatz } from './betrag.ts'

describe('parseBetrag (R24)', () => {
  it('liest Beträge aus den KoSIT-Testdateien', () => {
    expect(parseBetrag('336.9')).toEqual({ ok: true, cent: 33690 })
    expect(parseBetrag('22.04')).toEqual({ ok: true, cent: 2204 })
    expect(parseBetrag('314.86')).toEqual({ ok: true, cent: 31486 })
    expect(parseBetrag('1030.00')).toEqual({ ok: true, cent: 103000 })
    expect(parseBetrag('-225.14')).toEqual({ ok: true, cent: -22514 })
  })

  it('kennt alle Formen von xs:decimal', () => {
    expect(parseBetrag('0')).toEqual({ ok: true, cent: 0 })
    expect(parseBetrag('0.00')).toEqual({ ok: true, cent: 0 })
    expect(parseBetrag('.5')).toEqual({ ok: true, cent: 50 })
    expect(parseBetrag('5.')).toEqual({ ok: true, cent: 500 })
    expect(parseBetrag('+12.3')).toEqual({ ok: true, cent: 1230 })
    expect(parseBetrag('007.07')).toEqual({ ok: true, cent: 707 })
    expect(parseBetrag('  12.30\n')).toEqual({ ok: true, cent: 1230 })
  })

  it('macht aus -0 keine negative Null', () => {
    const r = parseBetrag('-0.00')
    expect(r).toEqual({ ok: true, cent: 0 })
    expect(Object.is(r.cent, -0)).toBe(false)
  })

  it('meldet mehr als 2 Nachkommastellen, mit Wert nur wenn exakt', () => {
    expect(parseBetrag('12.345')).toEqual({ ok: false, grund: 'nachkommastellen', cent: null })
    expect(parseBetrag('12.340')).toEqual({ ok: false, grund: 'nachkommastellen', cent: 1234 })
    expect(parseBetrag('-1.2300')).toEqual({ ok: false, grund: 'nachkommastellen', cent: -123 })
  })

  it('lehnt Leeres und Fremdformate ab', () => {
    expect(parseBetrag('')).toEqual({ ok: false, grund: 'leer', cent: null })
    expect(parseBetrag(null)).toEqual({ ok: false, grund: 'leer', cent: null })
    expect(parseBetrag('   ')).toEqual({ ok: false, grund: 'leer', cent: null })
    for (const t of ['abc', '12,30', '1e3', '.', '--1', '1.2.3', '1 000', '0x10']) {
      expect(parseBetrag(t)).toEqual({ ok: false, grund: 'format', cent: null })
    }
  })

  it('begrenzt auf sichere Ganzzahlen', () => {
    expect(parseBetrag('9999999999999.99')).toEqual({ ok: true, cent: 999999999999999 })
    expect(parseBetrag('99999999999999')).toEqual({ ok: false, grund: 'zu-gross', cent: null })
  })
})

describe('centAlsDezimal', () => {
  it('schreibt Cent als XML-Dezimaltext', () => {
    expect(centAlsDezimal(33690)).toBe('336.90')
    expect(centAlsDezimal(5)).toBe('0.05')
    expect(centAlsDezimal(-22514)).toBe('-225.14')
    expect(centAlsDezimal(0)).toBe('0.00')
  })
})

describe('steuerAusSatz', () => {
  it('rechnet Steuer aus Bemessung und Satz wie in den Testdateien', () => {
    // 314,86 € × 7 % = 22,0402 € → 22,04 € (01.01a)
    expect(steuerAusSatz(31486, '7')).toBe(2204)
    // 578,89 € × 19 % = 109,9891 € → 109,99 € (03.01a)
    expect(steuerAusSatz(57889, '19')).toBe(10999)
    // 108,39 € × 7 % = 7,5873 € → 7,59 € (03.01a)
    expect(steuerAusSatz(10839, '7')).toBe(759)
    // 10.781,25 € × 19 % = 2.048,4375 € → 2.048,44 € (02.01a)
    expect(steuerAusSatz(1078125, '19')).toBe(204844)
    // 314,86 € × 16 % = 50,3776 € → 50,38 € (M8)
    expect(steuerAusSatz(31486, '16')).toBe(5038)
  })

  it('rundet kaufmännisch, halbe Cent vom Nullpunkt weg', () => {
    expect(steuerAusSatz(50, '1')).toBe(1) // 0,5 Cent
    expect(steuerAusSatz(49, '1')).toBe(0) // 0,49 Cent
    expect(steuerAusSatz(-50, '1')).toBe(-1)
    expect(steuerAusSatz(1000, '5.5')).toBe(55)
    expect(steuerAusSatz(0, '19')).toBe(0)
  })

  it('lehnt unlesbare Sätze ab', () => {
    expect(steuerAusSatz(100, 'neunzehn')).toBeNull()
    expect(steuerAusSatz(100, '-7')).toBeNull()
  })
})

describe('Betrag aus einer Eingabe', () => {
  it('versteht deutsche und technische Schreibweisen', async () => {
    const { leseBetragEingabe } = await import('./betrag.ts')
    expect(leseBetragEingabe('336,90')).toBe(33690)
    expect(leseBetragEingabe('1.234,56 €')).toBe(123456)
    expect(leseBetragEingabe('336.90')).toBe(33690)
    expect(leseBetragEingabe('1.234')).toBe(123400)
    expect(leseBetragEingabe('1.234.567')).toBe(123456700)
    expect(leseBetragEingabe('-12,5')).toBe(-1250)
    expect(leseBetragEingabe('12')).toBe(1200)
    expect(leseBetragEingabe('')).toBeNull()
    expect(leseBetragEingabe('12,345')).toBeNull()
    expect(leseBetragEingabe('zwölf')).toBeNull()
  })
})
