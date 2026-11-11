import { describe, expect, it } from 'vitest'
import { belegAus, belegVonHand, leeresPruefergebnis } from '../testhilfen/belege.ts'
import { befund } from './befunde.ts'
import { befundgruppe, gruppiereBefunde, rueckfrageText } from './rueckfrage.ts'

describe('Befundgruppen und Rückfrage an den Lieferanten (B2)', () => {
  const befunde = [
    befund('XSD', { ort: '11:5', originaltext: "Element 'IssueDat': This element is not expected." }),
    befund('BR-CO-14', { quelle: 'en16931', stufe: 'fehler', ustRelevant: true, originaltext: 'Invoice total VAT amount …', btBezug: ['BT-110'] }),
    befund('USTG-14-4-6'),
    befund('BR-DE-TMP-32', { quelle: 'xrechnung', stufe: 'hinweis' }),
    befund('PLAUS-IBAN'),
  ]

  it('gruppiert nach Format, Geschäftsregel, Pflichtangabe und Hinweis', () => {
    expect(befunde.map(befundgruppe)).toEqual(['formatfehler', 'geschaeftsregelfehler', 'pflichtangaben', 'hinweise', 'hinweise'])
    expect(gruppiereBefunde(befunde).map((g) => [g.gruppe, g.befunde.length])).toEqual([
      ['formatfehler', 1],
      ['geschaeftsregelfehler', 1],
      ['pflichtangaben', 1],
      ['hinweise', 2],
    ])
    expect(gruppiereBefunde([])).toEqual([])
  })

  it('schreibt Fehler und Warnungen mit Regel, Angaben und Originalmeldung, ohne Hinweise', async () => {
    const b = await belegAus('standard/01.01a-INVOICE_ubl.xml', { pruefung: { ...leeresPruefergebnis(false), befunde } })
    const text = rueckfrageText(b, 'olbricht-digital')
    expect(text.split('\n')[0]).toBe('Betreff: Rückfrage zu Ihrer Rechnung 123456XX vom 04.04.2016')
    expect(text).toContain('bei der Prüfung Ihrer Rechnung 123456XX vom 04.04.2016 über 336,90 € sind uns folgende Punkte aufgefallen:')
    expect(text).toContain('1. XSD: ')
    expect(text).toContain('   Fundstelle: 11:5')
    expect(text).toContain('2. BR-CO-14: ')
    expect(text).toContain('   Betroffene Angaben: BT-110')
    expect(text).toContain('   Meldung des Regelwerks: Invoice total VAT amount …')
    expect(text).not.toContain('BR-DE-TMP-32')
    expect(text).toContain('4. PLAUS-IBAN')
    expect(text.endsWith('Mit freundlichen Grüßen\nolbricht-digital')).toBe(true)
  })

  it('nennt ohne Rechnungsnummer die Datei', () => {
    const b = belegVonHand({ lieferantName: 'x', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '', rechnungsdatum: '', leistungsdatum: null, steuern: [], bruttoCent: 0 }, { pruefung: null })
    b.handerfassung = null
    const text = rueckfrageText(b, 'Firma')
    expect(text.split('\n')[0]).toBe(`Betreff: Rückfrage zu der Datei „${b.original.dateiname}“`)
    expect(text).toContain('(keine Fehler oder Warnungen)')
  })
})
