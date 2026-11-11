import { describe, expect, it } from 'vitest'
import { BEISPIEL_FIRMA, datenAus, OLBRICHT } from '../testhilfen/rechnungen.ts'
import { eigeneFirmaPruefen, normName, pruefePflichtangaben, pruefePflichtangabenHand } from './pflichtangaben.ts'
import { ibanGueltig, pruefePlausibilitaet } from './plausibilitaet.ts'
import type { Pflichtangabe, Pflichtangabenpruefung } from './typen.ts'

function status(p: Pflichtangabenpruefung): Record<Pflichtangabe, string> {
  return Object.fromEntries(p.ergebnisse.map((e) => [e.angabe, e.status])) as Record<Pflichtangabe, string>
}

describe('Pflichtangaben (R8)', () => {
  it('T-P1: 01.01a erfüllt Nr. 1 bis 5, 7 und 8; Nr. 6 ist zu prüfen, Nr. 10 nicht anwendbar', async () => {
    const r = pruefePflichtangaben(await datenAus('standard/01.01a-INVOICE_ubl.xml'), BEISPIEL_FIRMA)
    expect(r.pruefung.regelwerk).toBe('§ 14 Abs. 4 UStG')
    expect(status(r.pruefung)).toEqual({
      'name-anschrift-leistender': 'erfuellt',
      'name-anschrift-empfaenger': 'erfuellt',
      'steuernummer-oder-ustid': 'erfuellt',
      ausstellungsdatum: 'erfuellt',
      rechnungsnummer: 'erfuellt',
      'menge-und-art': 'erfuellt',
      // Abweichung von T-P1 (docs/entscheidungen.md, T3): 01.01a hat BG-26 nur in einer von zwei Positionen
      leistungszeitpunkt: 'pruefen',
      'entgelt-nach-steuersaetzen': 'erfuellt',
      'steuersatz-und-betrag': 'erfuellt',
      'angabe-gutschrift': 'nicht-anwendbar',
    })
    expect(r.pruefung.eigeneFirmaAlsEmpfaenger).toBe('ja')
    expect(r.befunde.map((b) => [b.regelId, b.stufe])).toEqual([['USTG-14-4-6', 'warnung']])
  })

  it('erkennt den Leistungszeitpunkt über BG-14 (03.01a)', async () => {
    const r = pruefePflichtangaben(await datenAus('standard/03.01a-INVOICE_ubl.xml'), BEISPIEL_FIRMA)
    expect(status(r.pruefung).leistungszeitpunkt).toBe('erfuellt')
  })

  it('T-P2: ohne BT-72, BG-14 und BG-26 ist der Leistungszeitpunkt zu prüfen (Warnung)', async () => {
    const d = await datenAus('standard/03.01a-INVOICE_ubl.xml')
    d.abrechnungszeitraum = null
    d.lieferdatum = null
    for (const p of d.positionen) p.zeitraum = null
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(status(r.pruefung).leistungszeitpunkt).toBe('pruefen')
    const b = r.befunde.find((x) => x.regelId === 'USTG-14-4-6')!
    expect(b).toMatchObject({ stufe: 'warnung', quelle: 'ustg' })
    expect(b.klartext).toContain('evtl. nur im Bemerkungstext')
  })

  it('T-P3: Verkäufer ohne BT-31, BT-32 und BT-63 ist ein Inhaltsfehler', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.verkaeufer.ustId = null
    d.verkaeufer.steuernummer = null
    d.steuervertreterUstId = null
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(status(r.pruefung)['steuernummer-oder-ustid']).toBe('fehlt')
    const b = r.befunde.find((x) => x.regelId === 'USTG-14-4-2')!
    expect(b).toMatchObject({ stufe: 'fehler', fehlerklasse: 'inhaltsfehler', ustRelevant: true })
    expect(b.klartext).toContain('Vorsteuerabzug gefährdet')
    // Steuervertreter (BT-63) genügt
    d.steuervertreterUstId = 'DE111111111'
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['steuernummer-oder-ustid']).toBe('erfuellt')
  })

  it('T-P4: Brutto 250,00 € mit Kategorie S ist ein Kleinbetrag nach § 33 UStDV', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.summen.bruttoCent = 25000
    d.rechnungsnummer = ''
    d.kaeufer.anschrift = {}
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(r.pruefung.regelwerk).toBe('§ 33 UStDV')
    const s = status(r.pruefung)
    expect(s.rechnungsnummer).toBe('nicht-anwendbar')
    expect(s['name-anschrift-empfaenger']).toBe('nicht-anwendbar')
    expect(s['steuernummer-oder-ustid']).toBe('nicht-anwendbar')
    expect(s.leistungszeitpunkt).toBe('nicht-anwendbar')
    expect(s['name-anschrift-leistender']).toBe('erfuellt')
    expect(s['steuersatz-und-betrag']).toBe('erfuellt')
    expect(r.befunde.filter((b) => b.quelle === 'ustg' && b.stufe !== 'hinweis')).toEqual([])
  })

  it('T-P5: Brutto 250,01 € ist kein Kleinbetrag', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.summen.bruttoCent = 25001
    expect(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung.regelwerk).toBe('§ 14 Abs. 4 UStG')
  })

  it('T-P6: 01.21a mit Kategorie AE ist trotz 233,00 € kein Kleinbetrag', async () => {
    const d = await datenAus('standard/01.21a-INVOICE_ubl.xml')
    expect(d.summen.bruttoCent).toBe(23300)
    expect(d.steuern.map((s) => s.kategorie)).toEqual(['AE'])
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(r.pruefung.regelwerk).toBe('§ 14 Abs. 4 UStG')
    expect(status(r.pruefung)['steuersatz-und-betrag']).toBe('erfuellt') // Befreiungshinweis BT-120/121 vorhanden
  })

  it('T-P7: eigene Firma über Namensvarianten; fremder Empfänger ergibt eine Warnung', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.kaeufer.name = 'Olbricht Digital'
    expect(eigeneFirmaPruefen(d, { ...OLBRICHT, ustId: undefined })).toEqual({ ergebnis: 'ja', befunde: [] })
    const fremd = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    const r = eigeneFirmaPruefen(fremd, OLBRICHT)
    expect(r.ergebnis).toBe('nein')
    expect(r.befunde[0]).toMatchObject({ regelId: 'USTG-EMPFAENGER', stufe: 'warnung', ustRelevant: true })
    expect(r.befunde[0].klartext).toContain('[Buyer name]')
    // über die USt-IdNr. des Käufers
    fremd.kaeufer.ustId = 'DE999999999'
    expect(eigeneFirmaPruefen(fremd, OLBRICHT).ergebnis).toBe('ja')
    // ohne eingerichtete Firma
    expect(eigeneFirmaPruefen(fremd, null).ergebnis).toBe('unklar')
  })

  it('normalisiert Namen ohne Rechtsform, Akzente und Satzzeichen', () => {
    expect(normName('Olbricht Digital GmbH')).toBe('olbrichtdigital')
    expect(normName('olbricht-digital')).toBe('olbrichtdigital')
    expect(normName('Olbricht Digital UG (haftungsbeschränkt)')).toBe('olbrichtdigital')
    expect(normName('Müller & Söhne e.K.')).toBe('mullersohne')
    expect(normName('Café Crème KG')).toBe('cafecreme')
    expect(normName('[Buyer name]')).toBe('buyername')
  })

  it('T-P8: 01.20a (Typ 389) prüft „Gutschrift“ und vergleicht die Firma mit dem Verkäufer', async () => {
    const d = await datenAus('standard/01.20a-INVOICE_ubl.xml')
    expect(d.typcode).toBe('389')
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    const s = status(r.pruefung)['angabe-gutschrift']
    expect(['pruefen', 'erfuellt']).toContain(s)
    expect(s).toBe(d.bemerkungen.some((b) => /gutschrift/i.test(b)) ? 'erfuellt' : 'pruefen')
    // Verkäuferseite: die Beispiel-Firma ist der Käufer, also „nein“; als Verkäufer eingetragen „ja“
    expect(r.pruefung.eigeneFirmaAlsEmpfaenger).toBe('nein')
    const alsVerkaeufer = { ...BEISPIEL_FIRMA, name: d.verkaeufer.name }
    expect(pruefePflichtangaben(d, alsVerkaeufer).pruefung.eigeneFirmaAlsEmpfaenger).toBe('ja')
    d.bemerkungen = ['Gutschrift']
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['angabe-gutschrift']).toBe('erfuellt')
  })

  it('T-P11: Kleinunternehmer (§ 34a UStDV) bei Kategorie E mit Hinweis auf § 19 UStG', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.summen.bruttoCent = 30000
    d.steuern = [{ kategorie: 'E', satz: '0', bemessungCent: 30000, steuerCent: 0, befreiungsgrund: 'Kleinunternehmer gemäß § 19 UStG', befreiungsCode: null }]
    d.rechnungsnummer = ''
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(r.pruefung.regelwerk).toBe('§ 34a UStDV')
    const s = status(r.pruefung)
    expect(s.rechnungsnummer).toBe('nicht-anwendbar')
    expect(s.leistungszeitpunkt).toBe('nicht-anwendbar')
    expect(s['steuersatz-und-betrag']).toBe('nicht-anwendbar')
    expect(s['entgelt-nach-steuersaetzen']).toBe('nicht-anwendbar')
    expect(s['name-anschrift-empfaenger']).toBe('erfuellt')
    expect(r.befunde.map((b) => b.regelId)).toContain('USTDV-34A')
    expect(r.befunde.find((b) => b.regelId === 'USTDV-34A')!.klartext).toContain('Heuristik')
  })

  it('meldet fehlende Steuersätze und Befreiungsgründe nach Nr. 8', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.steuern[0].satz = ''
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['steuersatz-und-betrag']).toBe('fehlt')
    d.steuern = [{ kategorie: 'E', satz: '0', bemessungCent: 100, steuerCent: 0, befreiungsgrund: null, befreiungsCode: null }]
    d.summen.bruttoCent = 30000
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['steuersatz-und-betrag']).toBe('fehlt')
    d.steuern[0].befreiungsCode = 'VATEX-EU-132'
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['steuersatz-und-betrag']).toBe('erfuellt')
    d.steuern = [{ kategorie: 'Z', satz: '0', bemessungCent: 100, steuerCent: 0, befreiungsgrund: null, befreiungsCode: null }]
    expect(status(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung)['steuersatz-und-betrag']).toBe('pruefen')
    d.steuern = []
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(status(r.pruefung)['entgelt-nach-steuersaetzen']).toBe('fehlt')
  })

  it('prüft eine Erfassung von Hand mit dem, was erfasst ist', () => {
    const r = pruefePflichtangabenHand({
      lieferantName: 'Müller & Söhne',
      lieferantUstId: null,
      lieferantSteuernummer: '12/345/67890',
      rechnungsnummer: 'R-17',
      rechnungsdatum: '2026-10-05',
      leistungsdatum: null,
      steuern: [{ kategorie: 'S', satz: '19', bemessungCent: 100000, steuerCent: 19000 }],
      bruttoCent: 119000,
    })
    const s = status(r.pruefung)
    expect(r.pruefung.regelwerk).toBe('§ 14 Abs. 4 UStG')
    expect(s['steuernummer-oder-ustid']).toBe('erfuellt')
    expect(s['name-anschrift-leistender']).toBe('pruefen')
    expect(s.leistungszeitpunkt).toBe('pruefen')
    expect(r.befunde.filter((b) => b.stufe === 'fehler')).toEqual([])
  })
})

describe('Plausibilität (R11)', () => {
  it('T-P9: M8 mit 16 % ergibt PLAUS-STEUERSATZ', async () => {
    const b = pruefePlausibilitaet(await datenAus('M8'), '2026-11-11')
    expect(b.map((x) => [x.regelId, x.stufe])).toEqual([['PLAUS-STEUERSATZ', 'warnung']])
    expect(b[0].klartext).toContain('Rn. 35a')
  })

  it('T-P10: IBAN-Prüfziffer', () => {
    expect(ibanGueltig('DE89370400440532013000')).toBe(true)
    expect(ibanGueltig('DE89 3704 0044 0532 0130 00')).toBe(true)
    expect(ibanGueltig('DE89370400440532013001')).toBe(false)
    expect(ibanGueltig('DE79000000001234567890')).toBe(true) // aus den KoSIT-Testdateien
    expect(ibanGueltig('kein-iban')).toBe(false)
  })

  it('meldet PLAUS-IBAN, PLAUS-DATUM, PLAUS-FAELLIG, PLAUS-WAEHRUNG und PLAUS-ANHANG-EXTERN', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    expect(pruefePlausibilitaet(d, '2026-11-11')).toEqual([])
    d.zahlung.iban = 'DE89370400440532013001'
    d.rechnungsdatum = '2026-11-13'
    d.faelligAm = '2026-11-01'
    d.waehrung = 'USD'
    d.anhaenge = [{ kennung: 'A1', beschreibung: null, dateiname: null, mimeTyp: null, groesseBytes: null, externeAdresse: 'https://example.org/x' }]
    const b = pruefePlausibilitaet(d, '2026-11-11')
    expect(b.map((x) => [x.regelId, x.stufe])).toEqual([
      ['PLAUS-DATUM', 'warnung'],
      ['PLAUS-FAELLIG', 'hinweis'],
      ['PLAUS-WAEHRUNG', 'warnung'],
      ['PLAUS-IBAN', 'warnung'],
      ['PLAUS-ANHANG-EXTERN', 'hinweis'],
    ])
    // genau ein Tag in der Zukunft ist noch in Ordnung
    d.rechnungsdatum = '2026-11-12'
    expect(pruefePlausibilitaet(d, '2026-11-11').map((x) => x.regelId)).not.toContain('PLAUS-DATUM')
  })
})
