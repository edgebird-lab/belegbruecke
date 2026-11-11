import { describe, expect, it } from 'vitest'
import { sha256 } from '../testhilfen/krypto.ts'
import { kosit } from '../testhilfen/dateien.ts'
import { datenAus } from '../testhilfen/rechnungen.ts'
import { dubletteSperrt, findeDubletten, normNr, typgruppe, type Dublettenmerkmale } from './dubletten.ts'
import { lieferantenschluessel, lieferantVorschlagen, naechstesKreditorenkonto, pruefeKreditorenkonto, schluesselHand } from './lieferant.ts'
import type { Lieferant, Rechnungsdaten } from './typen.ts'

async function merkmale(id: string, laufnummer: number, rel: string, aendern?: (d: Rechnungsdaten) => void): Promise<Dublettenmerkmale> {
  const d = await datenAus(rel)
  aendern?.(d)
  const bytes = kosit(rel)
  return {
    id,
    laufnummer,
    originalSha256: sha256(bytes),
    xmlSha256: sha256(bytes),
    lieferantSchluessel: lieferantenschluessel(d),
    rechnungsnummer: d.rechnungsnummer,
    typcode: d.typcode,
    rechnungsdatum: d.rechnungsdatum,
    bruttoCent: d.summen.bruttoCent,
    zahlbetragCent: d.summen.zahlbetragCent,
    format: rel.endsWith('_ubl.xml') ? 'XRechnung 3.0, UBL' : 'XRechnung 3.0, CII',
  }
}

describe('Dubletten (R9)', () => {
  it('T-D1: dieselbe Datei zweimal ist eine identische Datei', async () => {
    const a = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const b = { ...a, id: 'B', laufnummer: 2 }
    expect(findeDubletten(b, [a])).toEqual([{ stufe: 'identische-datei', andererBelegId: 'A', grund: 'Dieselbe Datei liegt bereits als B-00001 im Archiv.' }])
  })

  it('T-D2: 01.01a als UBL, dann als CII ist die gleiche Rechnung und sperrt die Freigabe', async () => {
    const ubl = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const cii = await merkmale('B', 2, 'standard/01.01a-INVOICE_uncefact.xml')
    expect(ubl.lieferantSchluessel).toBe('ustid:DE123456789')
    expect(cii.lieferantSchluessel).toBe('ustid:DE123456789')
    const h = findeDubletten(cii, [ubl])
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ stufe: 'gleiche-rechnung', andererBelegId: 'A' })
    expect(h[0].grund).toContain('Rechnungsnummer 123456XX vom selben Lieferanten')
    expect(h[0].grund).toContain('Format XRechnung 3.0, UBL ↔ XRechnung 3.0, CII')
    expect(dubletteSperrt(h, false)).toBe(true)
    expect(dubletteSperrt(h, true)).toBe(false)
  })

  it('T-D3: 01.01a, dann 01.17a nennt die Abweichung im Zahlbetrag', async () => {
    const a = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const b = await merkmale('B', 2, 'standard/01.17a-INVOICE_ubl.xml')
    const h = findeDubletten(b, [a])
    expect(h.map((x) => x.stufe)).toEqual(['gleiche-rechnung'])
    expect(h[0].grund).toContain('Zahlbetrag 336,90 € ↔ 336,91 €')
  })

  it('T-D4: gleicher Lieferant, andere Nummer, gleiches Datum und Brutto ist ähnlich, aber nicht sperrend', async () => {
    const a = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const b = await merkmale('B', 2, 'standard/01.01a-INVOICE_ubl.xml', (d) => {
      d.rechnungsnummer = '123457XX'
      d.rechnungsdatum = '2016-04-07' // 3 Tage später
    })
    b.originalSha256 = 'f'.repeat(64)
    b.xmlSha256 = 'f'.repeat(64)
    const h = findeDubletten(b, [a])
    expect(h.map((x) => x.stufe)).toEqual(['aehnliche-rechnung'])
    expect(h[0].grund).toContain('336,90 €')
    expect(dubletteSperrt(h, false)).toBe(false)
    // 4 Tage Abstand ist nicht mehr ähnlich
    expect(findeDubletten({ ...b, rechnungsdatum: '2016-04-08' }, [a])).toEqual([])
  })

  it('erkennt gleichen XML-Inhalt (PDF und XML derselben Rechnung)', async () => {
    const a = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const b = { ...a, id: 'B', laufnummer: 2, originalSha256: 'e'.repeat(64), lieferantSchluessel: null, format: 'ZUGFeRD' }
    const h = findeDubletten(b, [a])
    expect(h[0].stufe).toBe('gleiche-rechnung')
    expect(h[0].grund).toContain('gleicher XML-Inhalt')
  })

  it('unterscheidet Rechnung und Gutschrift mit gleicher Nummer', async () => {
    const a = await merkmale('A', 1, 'standard/01.01a-INVOICE_ubl.xml')
    const b = { ...a, id: 'B', laufnummer: 2, originalSha256: 'd'.repeat(64), xmlSha256: 'd'.repeat(64), typcode: '381' }
    expect(findeDubletten(b, [a])).toEqual([])
  })

  it('normalisiert Nummern und Typgruppen', () => {
    expect(normNr('RE 2026-001/a.#7')).toBe('RE2026001A7')
    expect(normNr('re_2026.001')).toBe(normNr('RE-2026-001'))
    expect(typgruppe('380')).toBe('rechnung')
    expect(typgruppe('389')).toBe('rechnung')
    expect(typgruppe('381')).toBe('gutschrift')
    expect(typgruppe('751')).toBe('sonstige:751')
  })
})

describe('Lieferantenschlüssel und Kreditorenkonto (R10)', () => {
  it('bildet den Schlüssel aus USt-IdNr., Steuernummer oder Name und PLZ', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    expect(lieferantenschluessel(d)).toBe('ustid:DE123456789')
    d.verkaeufer.ustId = null
    d.verkaeufer.steuernummer = '123/456/7890'
    expect(lieferantenschluessel(d)).toBe('stnr:1234567890')
    d.verkaeufer.steuernummer = null
    expect(lieferantenschluessel(d)).toBe('name:sellername|12345')
  })

  it('nimmt bei Typ 389 den Käufer als Geschäftspartner (T-K9)', async () => {
    const d = await datenAus('standard/01.20a-INVOICE_ubl.xml')
    expect(d.typcode).toBe('389')
    expect(lieferantenschluessel(d)).toBe('ustid:DE987654321')
    const v = lieferantVorschlagen(d, [])
    expect(v.neu.name).toBe(d.kaeufer.name)
  })

  it('schlägt einen vorhandenen Lieferanten mit gleichem Schlüssel vor', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    const vorhanden: Lieferant = {
      id: 'L1',
      schluessel: 'ustid:DE123456789',
      name: '[Seller name]',
      ustId: 'DE123456789',
      steuernummer: null,
      anschrift: {},
      kreditorKonto: 70000,
      angelegtAm: '2026-11-11T00:00:00.000Z',
    }
    expect(lieferantVorschlagen(d, [vorhanden]).vorhanden?.id).toBe('L1')
    expect(lieferantVorschlagen(d, []).vorhanden).toBeNull()
    expect(lieferantVorschlagen(d, []).neu).toMatchObject({ schluessel: 'ustid:DE123456789', name: '[Seller name]', ustId: 'DE123456789' })
  })

  it('bildet Schlüssel auch für die Erfassung von Hand', () => {
    const basis = { lieferantName: 'Müller & Söhne GmbH', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '1', rechnungsdatum: '2026-01-01', leistungsdatum: null, steuern: [], bruttoCent: 0 }
    expect(schluesselHand(basis)).toBe('name:mullersohne|')
    expect(schluesselHand({ ...basis, lieferantUstId: 'de 999' })).toBe('ustid:DE999')
    expect(schluesselHand({ ...basis, lieferantSteuernummer: '12/345' })).toBe('stnr:12345')
  })

  it('vergibt Kreditorenkonten fortlaufend im Kreis', () => {
    const kreis = { sachkontenlaenge: 4, kreditorenVon: 70000, kreditorenBis: 99999 }
    expect(naechstesKreditorenkonto([], kreis)).toBe(70000)
    expect(naechstesKreditorenkonto([70000, 70001], kreis)).toBe(70002)
    expect(naechstesKreditorenkonto([70000, 70005, 12345], kreis)).toBe(70006)
    expect(naechstesKreditorenkonto([99999], kreis)).toBeNull()
  })

  it('prüft von Hand gewählte Kreditorenkonten', () => {
    const kreis = { sachkontenlaenge: 4, kreditorenVon: 70000, kreditorenBis: 99999 }
    expect(pruefeKreditorenkonto(70010, [70000], kreis)).toBeNull()
    expect(pruefeKreditorenkonto(7001, [], kreis)).toContain('5 Stellen')
    expect(pruefeKreditorenkonto(69999, [], kreis)).toContain('zwischen 70000 und 99999')
    expect(pruefeKreditorenkonto(70000, [70000], kreis)).toContain('schon einem anderen')
    expect(pruefeKreditorenkonto(1.5, [], kreis)).toContain('ganze Zahl')
    expect(pruefeKreditorenkonto(700000, [], { sachkontenlaenge: 5, kreditorenVon: 700000, kreditorenBis: 999999 })).toBeNull()
  })
})
