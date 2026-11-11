import { describe, expect, it } from 'vitest'
import { aufbewahrenBis, aufbewahrungText, STANDARD_AUFBEWAHRUNG } from './aufbewahrung.ts'
import { datumInBerlin, istGueltigesDatum, tageZwischen } from './datum.ts'

const ACHT = STANDARD_AUFBEWAHRUNG

describe('Aufbewahrungsfrist (R15)', () => {
  it('T-A1: Rechnung, Eingang und Freigabe im März 2026 → 31.12.2034', () => {
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: '2026-03-15', eingangAm: '2026-03-16T08:00:00.000Z', freigabeAm: '2026-03-20T08:00:00.000Z' })).toBe('2034-12-31')
  })

  it('T-A2: Rechnung 30.12.2025, Eingang 05.01.2026 → 31.12.2034 (spätestes Jahr zählt)', () => {
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: '2025-12-30', eingangAm: '2026-01-05T08:00:00.000Z' })).toBe('2034-12-31')
  })

  it('T-A3: 01.01a vom 04.04.2016, Eingang 11.11.2026 → 31.12.2034', () => {
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: '2016-04-04', eingangAm: '2026-11-11T09:30:00.000Z' })).toBe('2034-12-31')
  })

  it('T-A4: wie T-A1 mit 10 Jahren → 31.12.2036', () => {
    expect(aufbewahrenBis({ jahre: 10 }, { rechnungsdatum: '2026-03-15', eingangAm: '2026-03-16T08:00:00.000Z', freigabeAm: '2026-03-20T08:00:00.000Z' })).toBe('2036-12-31')
  })

  it('T-A5: Eingang in der Neujahrsnacht nach Ortszeit (01.01.2027, 00:30 Uhr) → 31.12.2035', () => {
    expect(datumInBerlin('2026-12-31T23:30:00.000Z')).toBe('2027-01-01')
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: '2026-12-30', eingangAm: '2026-12-31T23:30:00.000Z' })).toBe('2035-12-31')
  })

  it('rechnet die Sommerzeit richtig (UTC+2)', () => {
    expect(datumInBerlin('2026-06-30T22:30:00.000Z')).toBe('2026-07-01')
    expect(datumInBerlin('2026-06-30T21:59:59.000Z')).toBe('2026-06-30')
  })

  it('ignoriert ein ungültiges Rechnungsdatum', () => {
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: '20160404', eingangAm: '2026-11-11T09:30:00.000Z' })).toBe('2034-12-31')
    expect(aufbewahrenBis(ACHT, { rechnungsdatum: null, eingangAm: '2026-11-11T09:30:00.000Z' })).toBe('2034-12-31')
  })

  it('zeigt die Frist mit Zusatz', () => {
    expect(aufbewahrungText('2034-12-31')).toBe('aufzubewahren bis 31.12.2034 – frühestens; die Frist läuft nicht ab, solange die Festsetzungsfrist offen ist (§ 147 Abs. 3 AO)')
  })
})

describe('Datumshilfen', () => {
  it('prüft Kalenderdaten samt Schaltjahr', () => {
    expect(istGueltigesDatum('2024-02-29')).toBe(true)
    expect(istGueltigesDatum('2026-02-29')).toBe(false)
    expect(istGueltigesDatum('2026-13-01')).toBe(false)
    expect(istGueltigesDatum('2026-04-31')).toBe(false)
    expect(istGueltigesDatum('2026-4-1')).toBe(false)
    expect(istGueltigesDatum(null)).toBe(false)
  })

  it('zählt Tage über Monats- und Jahresgrenzen', () => {
    expect(tageZwischen('2026-12-30', '2027-01-02')).toBe(3)
    expect(tageZwischen('2026-03-01', '2026-02-28')).toBe(-1)
    expect(tageZwischen('2026-03-28', '2026-03-30')).toBe(2) // Zeitumstellung zählt nicht
  })
})
