/**
 * Randfälle der Fachlogik, damit die Zweigabdeckung von src/fach das Ziel aus Spezifikation 9.3
 * (mindestens 90 %) erreicht: Maximal-Rechnungen der KoSIT-Visualisierung, Zwischenmodell von
 * Hand, Dubletten-Abweichungen, Befund-Vorgaben, Einstellungsänderungen.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extrahiere } from '../pruefung/extraktion.ts'
import { WURZEL } from '../testhilfen/dateien.ts'
import { BEISPIEL_FIRMA, datenAus } from '../testhilfen/rechnungen.ts'
import { befund } from './befunde.ts'
import { findeDubletten, typgruppe, type Dublettenmerkmale } from './dubletten.ts'
import { einstellungsAenderungen, standardEinstellungen } from './einstellungen.ts'
import { lieferantenschluessel } from './lieferant.ts'
import { eigeneFirmaPruefen, pruefePflichtangaben, pruefePflichtangabenHand } from './pflichtangaben.ts'
import { ampel, ergaenzeHanderfassung, zusatzUst } from './pruefbericht.ts'
import type { Handerfassung, Pruefergebnis } from './typen.ts'
import { leseZwischenmodell, normalisiereSatz, ohneLeerraum } from './zwischenmodell.ts'

const vis = (name: string) => readFileSync(join(WURZEL, 'vendor', 'visualisierung', 'test', 'instances', name), 'utf8')

describe('Zwischenmodell: Maximal-Rechnungen der KoSIT', () => {
  it('liest alle Felder aus maxRechnung (UBL)', async () => {
    const { daten, befunde } = await extrahiere(vis('maxRechnung_ubl.xml'), 'ubl-invoice')
    expect(befunde).toEqual([])
    const d = daten!
    expect(d).toMatchObject({ rechnungsnummer: '1234567890', typcode: '380', bestellreferenz: '2345678901', vorherigeRechnung: 'PRG1502168', lieferdatum: '2018-10-22' })
    expect(d.verkaeufer.steuernummer).toBe('456')
    expect(d.verkaeufer.anschrift.zeile2).toContain('Erweiterte Anschrift')
    expect(d.verkaeufer.email).toBe('kontakt@Rechnungssteller.de')
    expect(d.kaeufer).toMatchObject({ ustId: 'ATU13585627', email: 'tina@tester.de' })
    expect(d.zahlung).toEqual({ artCode: '30', iban: 'DE84600400710561515801' })
    expect(d.summen).toMatchObject({ abschlaegeCent: 250000, zuschlaegeCent: 60000, nettoCent: 810000, bruttoCent: 861000, vorausbezahltCent: 50000, rundungCent: 21000, zahlbetragCent: 832000 })
    // BT-115 = BT-112 − BT-113 + BT-114: 8.610,00 − 500,00 + 210,00 = 8.320,00
    expect(d.summen.bruttoCent - d.summen.vorausbezahltCent + d.summen.rundungCent).toBe(d.summen.zahlbetragCent)
    expect(d.steuern.map((s) => s.kategorie)).toEqual(['Z', 'S', 'S', 'E'])
    expect(d.steuern[3].befreiungsgrund).toBe('Grund für die Befreiung')
    expect(d.anhaenge.length).toBeGreaterThan(0)
    expect(d.bemerkungen.length).toBeGreaterThan(0)
  })

  it('liest die UBL-Gutschrift (maxRechnung_creditnote) über die eigene Stufe', async () => {
    const { daten, befunde } = await extrahiere(vis('maxRechnung_creditnote.xml'), 'ubl-creditnote')
    expect(befunde).toEqual([])
    expect(daten!.typcode).toBe('381')
    expect(daten!.positionen.length).toBeGreaterThan(0)
  })

  it('zählt Unterpositionen und liest eingebettete Anhänge', async () => {
    const sub = await extrahiere(vis('sub-invoice-lines_ubl.xml'), 'ubl-invoice')
    expect(sub.daten).not.toBeNull()
    const x = await extrahiere(vis('embedded-documents-bt-125_ubl.xml'), 'ubl-invoice')
    const mitDatei = x.daten!.anhaenge.filter((a) => a.dateiname)
    expect(mitDatei.length).toBeGreaterThan(0)
    expect(mitDatei[0].mimeTyp).toBeTruthy()
    expect(mitDatei[0].groesseBytes).toBeGreaterThan(0)
  })

  it('meldet Beträge mit mehr als 2 Stellen und fehlerhafte Werte', () => {
    const xr = (betrag: string) =>
      `<xr:invoice xmlns:xr="urn:ce.eu:en16931:2017:xoev-de:kosit:standard:xrechnung-1"><xr:Invoice_number>A</xr:Invoice_number>` +
      `<xr:DOCUMENT_TOTALS><xr:Invoice_total_amount_with_VAT>${betrag}</xr:Invoice_total_amount_with_VAT></xr:DOCUMENT_TOTALS>` +
      `<xr:ADDITIONAL_SUPPORTING_DOCUMENTS><xr:Supporting_document_reference>X</xr:Supporting_document_reference><xr:Attached_document mime_code="application/pdf" filename="a.pdf">QUJD</xr:Attached_document></xr:ADDITIONAL_SUPPORTING_DOCUMENTS>` +
      `<xr:ADDITIONAL_SUPPORTING_DOCUMENTS><xr:Supporting_document_reference>Y</xr:Supporting_document_reference><xr:Attached_document>QQ==</xr:Attached_document></xr:ADDITIONAL_SUPPORTING_DOCUMENTS></xr:invoice>`
    const exakt = leseZwischenmodell(xr('12.340'))
    expect(exakt.daten.summen.bruttoCent).toBe(1234)
    expect(exakt.befunde.map((b) => [b.regelId, b.btBezug])).toEqual([['BETRAG-FORMAT', ['BT-112']]])
    expect(exakt.daten.anhaenge).toEqual([
      { kennung: 'X', beschreibung: null, dateiname: 'a.pdf', mimeTyp: 'application/pdf', groesseBytes: 3, externeAdresse: null },
      { kennung: 'Y', beschreibung: null, dateiname: null, mimeTyp: null, groesseBytes: 1, externeAdresse: null },
    ])
    expect(leseZwischenmodell(xr('12.345')).daten.summen.bruttoCent).toBe(0)
    expect(leseZwischenmodell(xr('zwölf')).befunde[0].klartext).toContain('BT-112: „zwölf“')
    // fehlende Pflichtteile ergeben leere Werte, keinen Absturz
    const leer = leseZwischenmodell(xr('1')).daten
    expect(leer).toMatchObject({ rechnungsdatum: '', typcode: '', waehrung: '', verkaeufer: { name: '', anschrift: {} }, positionen: [], steuern: [], abrechnungszeitraum: null })
    expect(() => leseZwischenmodell('<andere/>')).toThrow('ohne xr:invoice')
  })

  it('normalisiert Sätze und Kennungen', () => {
    expect(normalisiereSatz('-7.50')).toBe('-7.5')
    expect(normalisiereSatz('+19')).toBe('19')
    expect(ohneLeerraum('   ')).toBeNull()
    expect(ohneLeerraum(null)).toBeNull()
    expect(ohneLeerraum('DE 12 34')).toBe('DE1234')
  })
})

describe('Dubletten: Abweichungen und Grenzfälle', () => {
  const basis: Dublettenmerkmale = {
    id: 'A',
    laufnummer: 7,
    originalSha256: 'a'.repeat(64),
    xmlSha256: 'b'.repeat(64),
    lieferantSchluessel: 'ustid:DE1',
    rechnungsnummer: 'R-1',
    typcode: '380',
    rechnungsdatum: '2026-10-01',
    bruttoCent: 10000,
    zahlbetragCent: 10000,
    format: 'XRechnung 3.0, UBL',
  }

  it('nennt alle Abweichungen und „Keine Abweichungen“ bei gleichem Inhalt', () => {
    const anders = { ...basis, id: 'B', laufnummer: 8, originalSha256: 'c'.repeat(64), xmlSha256: 'c'.repeat(64), rechnungsnummer: 'R 1', rechnungsdatum: '2026-10-02', bruttoCent: 10001, zahlbetragCent: null }
    const h = findeDubletten(anders, [basis])
    expect(h[0].stufe).toBe('gleiche-rechnung')
    expect(h[0].grund).toBe(
      'Gleiche Rechnung wie B-00007: Rechnungsnummer R 1 vom selben Lieferanten. Abweichungen: Rechnungsnummer R-1 ↔ R 1; Rechnungsdatum 01.10.2026 ↔ 02.10.2026; Brutto 100,00 € ↔ 100,01 €; Zahlbetrag 100,00 € ↔ –.',
    )
    const gleich = findeDubletten({ ...basis, id: 'C', originalSha256: 'd'.repeat(64), lieferantSchluessel: null }, [basis])
    expect(gleich[0].grund).toBe('Gleiche Rechnung wie B-00007: gleicher XML-Inhalt. Keine Abweichungen.')
  })

  it('übergeht sich selbst und unlesbare Daten', () => {
    expect(findeDubletten(basis, [basis])).toEqual([])
    const ohneDatum = { ...basis, id: 'D', originalSha256: 'e'.repeat(64), xmlSha256: null, rechnungsnummer: 'R-2', rechnungsdatum: null }
    expect(findeDubletten(ohneDatum, [basis])).toEqual([])
    const ohneNummer = { ...basis, id: 'E', originalSha256: 'f'.repeat(64), xmlSha256: null, rechnungsnummer: null }
    expect(findeDubletten(ohneNummer, [basis]).map((x) => x.stufe)).toEqual(['aehnliche-rechnung'])
    expect(typgruppe(null)).toBe('sonstige:')
  })
})

describe('Befunde, Einstellungen, Prüfbericht: Vorgaben', () => {
  it('ergänzt Vorgaben für Regeln ohne Katalogeintrag', () => {
    const b = befund('XY-1')
    expect(b).toMatchObject({ quelle: 'plausibilitaet', stufe: 'fehler', fehlerklasse: 'keine', ustRelevant: 'unklar', btBezug: [], ort: null, originaltext: null })
    expect(befund('XY-2', { quelle: 'xsd', stufe: 'hinweis' }).handlung).toBe('Hinweis prüfen; meist ist nichts zu tun.')
    expect(befund('XSD', { zusatz: 'Zeile 3.' }).klartext).toMatch(/Zeile 3\.$/)
    expect(befund('BR-99', { quelle: 'xrechnung' }).klartext).toContain('XRechnung')
  })

  it('protokolliert Einstellungsänderungen ohne Passwort, mit Listen', () => {
    const alt = standardEinstellungen()
    expect(einstellungsAenderungen(alt, standardEinstellungen())).toEqual([])
    const neu = standardEinstellungen()
    neu.postfach.passwortVerschluesselt = 'geheim'
    neu.firma.namensVarianten = ['Olbricht Digital']
    neu.firma.ustId = 'DE123456789'
    expect(einstellungsAenderungen(alt, neu)).toEqual([
      { pfad: 'firma.namensVarianten', alt: [], neu: ['Olbricht Digital'] },
      { pfad: 'firma.ustId', alt: null, neu: 'DE123456789' },
      { pfad: 'postfach.passwortVerschluesselt', alt: '(geändert)', neu: '(geändert)' },
    ])
  })

  it('ersetzt Pflichtangaben nach der Erfassung von Hand und zeigt Ampeln ohne Prüfung', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    const r8 = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    const p: Pruefergebnis = {
      formatVersion: 1,
      zeitpunkt: 'z',
      pruefprogramm: 'p',
      artefakte: { konfiguration: 'k', enSchematron: 'e', xrSchematron: 'x' },
      szenario: null,
      wohlgeformt: false,
      xsdGueltig: null,
      angenommen: false,
      eingeschraenktGeprueft: false,
      befunde: [...r8.befunde, befund('PDF-OHNE-XML')],
      pflichtangaben: r8.pruefung,
      dauerMs: 0,
    }
    const hand: Handerfassung = { lieferantName: 'Bäckerei', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '7', rechnungsdatum: '2026-10-01', leistungsdatum: '2026-10-01', steuern: [{ kategorie: 'S', satz: '7', bemessungCent: 1000, steuerCent: 70 }], bruttoCent: 1070 }
    const neu = ergaenzeHanderfassung(p, hand)
    expect(neu.pflichtangaben?.regelwerk).toBe('§ 33 UStDV')
    // Befunde der E-Rechnung zu Pflichtangaben entfallen; nicht erfasste Angaben sind Hinweise
    expect(neu.befunde.map((b) => [b.regelId, b.stufe])).toEqual([
      ['PDF-OHNE-XML', 'warnung'],
      ['USTG-14-4-1-LEISTENDER', 'hinweis'],
      ['USTG-14-4-5', 'hinweis'],
    ])
    const format = { belegart: 'e-rechnung' as const, container: 'xml' as const, syntax: null, profil: null, spezifikationsKennung: null, eingebettetAls: null, xmlSha256: null, zeichensatz: null, grund: null }
    expect(ampel(format, null).farbe).toBe('rot')
    expect(zusatzUst(befund('BR-DE-TMP-32', { quelle: 'xrechnung', stufe: 'hinweis' }))).toBeNull()
  })
})

describe('Pflichtangaben und Schlüssel: Grenzfälle', () => {
  it('verlangt außerhalb Deutschlands keine Straße und PLZ', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.verkaeufer.anschrift = { ort: 'Wien', land: 'AT' }
    const r = pruefePflichtangaben(d, BEISPIEL_FIRMA)
    expect(r.pruefung.ergebnisse.find((e) => e.angabe === 'name-anschrift-leistender')!.status).toBe('erfuellt')
    d.verkaeufer.anschrift = { ort: 'Berlin', land: 'DE' }
    expect(pruefePflichtangaben(d, BEISPIEL_FIRMA).pruefung.ergebnisse.find((e) => e.angabe === 'name-anschrift-leistender')!.status).toBe('fehlt')
  })

  it('erkennt die eigene Firma über den Handelsnamen und bei Typ 389 über die USt-IdNr. des Käufers', async () => {
    const d = await datenAus('standard/01.01a-INVOICE_ubl.xml')
    d.kaeufer.name = 'Irgendwer'
    d.kaeufer.handelsname = '[Buyer name]'
    expect(eigeneFirmaPruefen(d, BEISPIEL_FIRMA).ergebnis).toBe('ja')
    const g = await datenAus('standard/01.20a-INVOICE_ubl.xml')
    g.kaeufer.ustId = null
    expect(lieferantenschluessel(g)).toMatch(/^name:.*\|/)
    expect(eigeneFirmaPruefen(g, { ...BEISPIEL_FIRMA, name: '' }).ergebnis).toBe('unklar')
  })

  it('bewertet die Erfassung von Hand mit Befreiung und ohne Lieferant', () => {
    const r = pruefePflichtangabenHand({ lieferantName: '', lieferantUstId: 'DE1', lieferantSteuernummer: null, rechnungsnummer: '', rechnungsdatum: 'kaputt', leistungsdatum: null, steuern: [{ kategorie: 'E', satz: '0', bemessungCent: 50000, steuerCent: 0 }], bruttoCent: 50000 })
    const s = Object.fromEntries(r.pruefung.ergebnisse.map((e) => [e.angabe, e.status]))
    expect(s).toMatchObject({ 'name-anschrift-leistender': 'fehlt', rechnungsnummer: 'fehlt', ausstellungsdatum: 'fehlt', 'steuersatz-und-betrag': 'pruefen' })
    expect(r.befunde.filter((b) => b.stufe === 'fehler').map((b) => b.regelId)).toEqual(['USTG-14-4-1-LEISTENDER', 'USTG-14-4-3', 'USTG-14-4-4'])
    const ohneSteuer = pruefePflichtangabenHand({ lieferantName: 'X', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '1', rechnungsdatum: '2026-01-01', leistungsdatum: null, steuern: [], bruttoCent: 50000 })
    expect(ohneSteuer.pruefung.ergebnisse.find((e) => e.angabe === 'steuersatz-und-betrag')!.status).toBe('fehlt')
  })
})
