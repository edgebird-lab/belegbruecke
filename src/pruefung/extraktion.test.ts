import { describe, expect, it } from 'vitest'
import { normalisiereSatz } from '../fach/zwischenmodell.ts'
import { alleKosit, kositText } from '../testhilfen/dateien.ts'
import { ansicht, extrahiere } from './extraktion.ts'

async function daten(rel: string) {
  const r = await extrahiere(kositText(rel), rel.endsWith('_ubl.xml') ? 'ubl-invoice' : 'cii')
  expect(r.befunde).toEqual([])
  return r.daten!
}

describe('Datenextraktion über das Zwischenmodell (1.5)', () => {
  it('T-X1: 01.01a UBL', async () => {
    const d = await daten('standard/01.01a-INVOICE_ubl.xml')
    expect(d).toMatchObject({ rechnungsnummer: '123456XX', rechnungsdatum: '2016-04-04', typcode: '380', waehrung: 'EUR' })
    expect(d.summen.bruttoCent).toBe(33690)
    expect(d.steuern).toEqual([{ kategorie: 'S', satz: '7', bemessungCent: 31486, steuerCent: 2204, befreiungsgrund: null, befreiungsCode: null }])
    expect(d.verkaeufer.ustId).toBe('DE123456789')
    expect(d.verkaeufer).toMatchObject({ name: '[Seller name]', handelsname: '[Seller trading name]', anschrift: { zeile1: '[Seller address line 1]', plz: '12345', ort: '[Seller city]', land: 'DE' } })
    expect(d.kaeufer).toMatchObject({ name: '[Buyer name]', anschrift: { plz: '12345', land: 'DE' } })
    expect(d.positionen.map((p) => [p.nr, p.nettoCent, p.steuerkategorie, p.steuersatz])).toEqual([
      ['Zeitschrift [...]', 28879, 'S', '7'],
      ['Porto + Versandkosten', 2607, 'S', '7'],
    ])
    expect(d.positionen[0].zeitraum).toEqual({ von: '2016-01-01', bis: '2016-12-31' })
    expect(d.positionen[1].zeitraum).toBeNull()
    expect(d.lieferdatum).toBeNull()
    expect(d.abrechnungszeitraum).toBeNull()
    expect(d.zahlung).toEqual({ artCode: '58', iban: 'DE79000000001234567890' })
    expect(d.kaeuferreferenz).toBe('04011000-12345-03')
    expect(d.summen).toEqual({
      positionenNettoCent: 31486,
      abschlaegeCent: 0,
      zuschlaegeCent: 0,
      nettoCent: 31486,
      steuerCent: 2204,
      bruttoCent: 33690,
      vorausbezahltCent: 0,
      rundungCent: 0,
      zahlbetragCent: 33690,
    })
  })

  it('T-X2: 01.01a CII ergibt dieselben Eckdaten', async () => {
    const d = await daten('standard/01.01a-INVOICE_uncefact.xml')
    expect(d.rechnungsnummer).toBe('123456XX')
    expect(d.rechnungsdatum).toBe('2016-04-04')
    expect(d.summen.bruttoCent).toBe(33690)
    expect(d.steuern.map((s) => [s.kategorie, s.satz, s.bemessungCent, s.steuerCent])).toEqual([['S', '7', 31486, 2204]])
    expect(d.verkaeufer.ustId).toBe('DE123456789')
  })

  it('T-X3: 03.01a mit zwei Steuersätzen und Vorauszahlung', async () => {
    const d = await daten('standard/03.01a-INVOICE_ubl.xml')
    expect(d.steuern.map((s) => [s.kategorie, s.satz, s.bemessungCent, s.steuerCent])).toEqual([
      ['S', '19', 57889, 10999],
      ['S', '7', 10839, 759],
    ])
    expect(d.summen.bruttoCent).toBe(80486)
    expect(d.summen.vorausbezahltCent).toBe(103000)
    expect(d.summen.zahlbetragCent).toBe(-22514)
    // Zahlbetrag = Brutto − vorausbezahlt + Rundung (BT-115 = BT-112 − BT-113 + BT-114)
    expect(d.summen.bruttoCent - d.summen.vorausbezahltCent + d.summen.rundungCent).toBe(d.summen.zahlbetragCent)
    expect(d.abrechnungszeitraum).toEqual({ von: '2018-05-01', bis: '2019-01-31' })
  })

  it('T-X4: 02.01a mit steuerfreier Zeile, USt-IdNr. und Steuernummer', async () => {
    const d = await daten('standard/02.01a-INVOICE_ubl.xml')
    expect(d.steuern.map((s) => [s.kategorie, s.satz, s.bemessungCent, s.steuerCent])).toEqual([
      ['S', '19', 1078125, 204844],
      ['E', '0', 0, 0],
    ])
    expect(d.summen.bruttoCent).toBe(1282969)
    expect(d.verkaeufer.ustId).toBe('ATU123456789')
    expect(d.verkaeufer.steuernummer).toBe('123/456/789')
  })

  it('liest alle 86 Testdateien ohne Befund, mit Summen nach BR-CO-15', async () => {
    for (const rel of alleKosit()) {
      const r = await extrahiere(kositText(rel), rel.endsWith('_ubl.xml') ? 'ubl-invoice' : 'cii')
      expect({ rel, befunde: r.befunde }).toEqual({ rel, befunde: [] })
      const s = r.daten!.summen
      expect({ rel, brutto: s.nettoCent + s.steuerCent }).toEqual({ rel, brutto: s.bruttoCent })
    }
  }, 120_000)

  it('erzeugt die HTML-Ansicht mit CSS, Skript und deutschen Beschriftungen', () => {
    const html = ansicht(kositText('standard/01.01a-INVOICE_ubl.xml'), 'ubl-invoice')
    expect(html).toContain('123456XX')
    expect(html).toContain('336,90')
    expect(html).toContain('Rechnungsnummer')
    expect(html).toMatch(/<style>[\s\S]*menue/)
    expect(html).toContain('saveAs')
  })

  it('normalisiert Steuersätze', () => {
    expect(normalisiereSatz('19.00')).toBe('19')
    expect(normalisiereSatz('5.50')).toBe('5.5')
    expect(normalisiereSatz('0.00')).toBe('0')
    expect(normalisiereSatz('007')).toBe('7')
    expect(normalisiereSatz(null)).toBe('')
    expect(normalisiereSatz('  ')).toBe('')
    expect(normalisiereSatz('abc')).toBe('abc')
  })
})
