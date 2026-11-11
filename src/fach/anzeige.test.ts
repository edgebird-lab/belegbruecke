import { describe, expect, it } from 'vitest'
import { formatBetrag, formatDatum } from './anzeige.ts'

describe('formatBetrag', () => {
  it('setzt Tausenderpunkt und Dezimalkomma', () => {
    expect(formatBetrag(123456)).toBe('1.234,56 €')
    expect(formatBetrag(33690)).toBe('336,90 €')
    expect(formatBetrag(1282969)).toBe('12.829,69 €')
    expect(formatBetrag(100000000)).toBe('1.000.000,00 €')
  })

  it('zeigt kleine Beträge mit führender Null', () => {
    expect(formatBetrag(0)).toBe('0,00 €')
    expect(formatBetrag(1)).toBe('0,01 €')
    expect(formatBetrag(99)).toBe('0,99 €')
    expect(formatBetrag(100)).toBe('1,00 €')
  })

  it('setzt bei negativen Beträgen ein Minuszeichen', () => {
    expect(formatBetrag(-22514)).toBe('−225,14 €')
    expect(formatBetrag(-1)).toBe('−0,01 €')
  })

  it('lehnt Nicht-Ganzzahlen ab', () => {
    expect(() => formatBetrag(1.5)).toThrow(RangeError)
    expect(() => formatBetrag(Number.NaN)).toThrow(RangeError)
  })
})

describe('formatDatum', () => {
  it('wandelt ISO in TT.MM.JJJJ', () => {
    expect(formatDatum('2026-11-11')).toBe('11.11.2026')
    expect(formatDatum('2016-04-04')).toBe('04.04.2016')
  })

  it('lässt Leeres und Ungültiges stehen', () => {
    expect(formatDatum(null)).toBe('')
    expect(formatDatum('')).toBe('')
    expect(formatDatum('11.11.2026')).toBe('11.11.2026')
  })
})
