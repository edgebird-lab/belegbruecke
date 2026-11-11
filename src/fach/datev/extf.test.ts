import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { belegAus, belegVonHand } from '../../testhilfen/belege.ts'
import { WURZEL } from '../../testhilfen/dateien.ts'
import { TESTKONTEN, testEinstellungen } from '../../testhilfen/kontenplan.ts'
import { kontierungsquelle, kontierungUebernehmen, kontierungVorschlagen } from '../kontierung.ts'
import type { Beleg, Lieferant } from '../typen.ts'
import { belegMonat, belegSperren, buchungenFuer, monatsvorschlag, naechsteNachtragNr, planeUebergabe, stammdatenSperren, steuersummeText, summenJeSteuersatz, type Uebergabekontext } from '../uebergabe.ts'
import { belegpaket, belegpaketName, indexCsv, paketname, type Paketbeleg } from './belegpaket.ts'
import { dekodiereWindows1252, kodiereWindows1252 } from './cp1252.ts'
import { belegfeld1, BUCHUNGSFELDER, buchungszeile, datevBetrag, erzeugtAmFeld, extfDatei, extfDateiname, kopfzeile, stapelBezeichnung, wjBeginn, type Buchung } from './extf.ts'

/** 11.11.2026 09:30:00.000 Ortszeit Berlin (MEZ, UTC+1) */
const ERZEUGT = new Date('2026-11-11T08:30:00.000Z')
const LIEFERANT_ID = 'AAAAAAAA-0000-4000-8000-000000000001'

function lieferant(kreditorKonto: number | null, name = '[Seller name]'): Lieferant {
  return { id: LIEFERANT_ID, schluessel: 'ustid:ATU123456789', name, ustId: 'ATU123456789', steuernummer: null, anschrift: {}, kreditorKonto, angelegtAm: '2026-11-11T09:00:00.000Z' }
}

function kontext(l: Lieferant[] = [lieferant(70001)], aenderung: Partial<Uebergabekontext['einstellungen']['datev']> = {}): Uebergabekontext {
  const e = testEinstellungen()
  return { einstellungen: { datev: { ...e.datev, ...aenderung } }, lieferanten: l, sachkonten: TESTKONTEN }
}

/** Freigegebener Beleg mit allen Zeilen auf `konto`. */
async function freigegeben(rel: string, konto: number | null = 4900, aenderung: Partial<Beleg> = {}, kleinunternehmer = false): Promise<Beleg> {
  const e = testEinstellungen(kleinunternehmer)
  const b = await belegAus(rel, { lieferantId: LIEFERANT_ID, ...aenderung })
  const v = kontierungVorschlagen(kontierungsquelle(b)!, { lieferantName: '[Seller name]', regeln: [], sachkonten: TESTKONTEN, kleinunternehmer, buSchluessel: e.datev.buSchluessel })
  const r = kontierungUebernehmen(v, v.zeilen.map(() => ({ sachkonto: konto })), TESTKONTEN, e.datev.buSchluessel)
  if (!r.ok) throw new Error(r.fehler)
  return { ...b, kontierung: r.kontierung, status: 'freigegeben', inhaltGeprueft: true, freigabe: { benutzerId: 'B', am: '2026-11-11T09:40:00.000Z', begruendung: null }, ...aenderung }
}

describe('Windows-1252 (R19)', () => {
  it('kodiert Umlaute, Euro und typografische Zeichen; ersetzt den Rest durch „_“', () => {
    const k = kodiereWindows1252('Müller & Söhne – 5 € „gut“ ✓ 😀')
    expect([...k.bytes.slice(0, 7)]).toEqual([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x20])
    expect(k.bytes).toContain(0x96) // –
    expect(k.bytes).toContain(0x80) // €
    expect(k.bytes).toContain(0x84) // „
    expect(k.bytes).toContain(0x93) // “
    expect(k.ersetzt).toEqual(['✓', '😀'])
    expect(dekodiereWindows1252(k.bytes)).toBe('Müller & Söhne – 5 € „gut“ _ _')
    // zerlegtes „ü“ (u + Trema) wird vorher zusammengesetzt
    expect([...kodiereWindows1252('ü').bytes]).toEqual([0xfc])
    expect(dekodiereWindows1252(Uint8Array.from([0x81]))).toBe('�')
  })
})

describe('EXTF-Buchungsstapel (R19)', () => {
  it('Kopfzeile wie das Beispiel der Spezifikation (02/2019)', () => {
    const e = testEinstellungen()
    expect(kopfzeile({ erzeugtAm: ERZEUGT, datev: e.datev, monat: '2019-02', nachtragNr: 0 })).toBe(
      '"EXTF";700;21;"Buchungsstapel";13;20261111093000000;;"RE";"Belegbrücke";"";1001;1;20190101;4;20190201;20190228;"Belegbrücke 02/2019";"";1;0;0;"EUR";;"";;;"03";;;"";""',
    )
    expect(kopfzeile({ erzeugtAm: ERZEUGT, datev: { ...e.datev, kontenrahmen: 'SKR04' }, monat: '2019-02', nachtragNr: 0 }).split(';')[26]).toBe('"04"')
  })

  it('Zeitstempel in Ortszeit Berlin, auch in der Sommerzeit', () => {
    expect(erzeugtAmFeld(new Date('2026-07-01T22:15:30.007Z'))).toBe('20260702001530007')
    expect(erzeugtAmFeld(new Date('2026-12-31T23:30:00.000Z'))).toBe('20270101003000000')
  })

  it('Wirtschaftsjahr, Bezeichnung und Dateiname', () => {
    expect(wjBeginn('2019-02', '01-01')).toBe('20190101')
    expect(wjBeginn('2019-02', '07-01')).toBe('20180701')
    expect(wjBeginn('2019-07', '07-01')).toBe('20190701')
    expect(wjBeginn('2019-07', '07-15')).toBe('20180715')
    expect(stapelBezeichnung('2026-10', 1)).toBe('Belegbrücke 10/2026 N1')
    expect(extfDateiname({ beraternummer: 1001, mandantennummer: 1 }, '2026-10', 0)).toBe('EXTF_Buchungsstapel_1001_1_2026-10.csv')
    expect(extfDateiname({ beraternummer: 1001, mandantennummer: 1 }, '2026-10', 2)).toBe('EXTF_Buchungsstapel_1001_1_2026-10_N2.csv')
    expect(BUCHUNGSFELDER).toHaveLength(125)
    expect(BUCHUNGSFELDER[113]).toBe('Festschreibung')
    expect(BUCHUNGSFELDER[114]).toBe('Leistungsdatum')
  })

  it('T-E1: 03.01a mit Kreditor 70001 ist bytegleich mit der Golden File', async () => {
    const b = await freigegeben('standard/03.01a-INVOICE_ubl.xml')
    const k = kontext()
    const buchungen = buchungenFuer(b, k)
    const datei = extfDatei({ erzeugtAm: ERZEUGT, datev: k.einstellungen.datev, monat: '2019-02', nachtragNr: 0 }, buchungen)
    expect(datei.name).toBe('EXTF_Buchungsstapel_1001_1_2019-02.csv')
    expect(datei.hinweise).toEqual([])
    const zeilen = datei.text.split('\r\n')
    expect(zeilen).toHaveLength(5) // Kopf, Überschriften, 2 Buchungen, leer nach dem letzten CR LF
    const z1 = zeilen[2].split(';')
    expect(z1).toHaveLength(125)
    expect([z1[0], z1[1], z1[2], z1[6], z1[7], z1[8], z1[9], z1[10], z1[13], z1[113], z1[114]]).toEqual(['688,88', '"H"', '"EUR"', '70001', '4900', '"9"', '2802', '"123456789"', '"[Seller name] 123456789"', '0', ''])
    const z2 = zeilen[3].split(';')
    expect([z2[0], z2[8]]).toEqual(['115,98', '"8"'])
    const golden = new Uint8Array(readFileSync(join(WURZEL, 'testdaten', 'datev', 'EXTF_03.01a.csv')))
    expect(datei.bytes).toEqual(golden)
  })

  it('T-E2: „Müller & Söhne“ als Windows-1252 mit CR LF und ohne BOM', async () => {
    const b = await freigegeben('standard/02.01a-INVOICE_ubl.xml')
    const k = kontext([lieferant(70000, 'Müller & Söhne')])
    const buchungen = buchungenFuer({ ...b, kontierung: { ...b.kontierung!, zeilen: b.kontierung!.zeilen.map((z) => ({ ...z, buchungstext: 'Müller & Söhne 1234567' })) } }, k)
    const datei = extfDatei({ erzeugtAm: ERZEUGT, datev: k.einstellungen.datev, monat: '2018-04', nachtragNr: 0 }, buchungen)
    expect(datei.bytes.slice(0, 3)).not.toEqual(Uint8Array.from([0xef, 0xbb, 0xbf]))
    expect(datei.bytes[0]).toBe(0x22)
    expect(datei.bytes).toContain(0xfc)
    expect(datei.bytes).toContain(0xf6)
    const text = dekodiereWindows1252(datei.bytes)
    expect(text).toContain('"Müller & Söhne 1234567"')
    expect(text.split('\r\n')).toHaveLength(4)
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
    // Leistungsdatum BT-72 13.04.2018 als TTMMJJJJ
    expect(text.split('\r\n')[2].split(';')[114]).toBe('13042018')
  })

  it('T-E3: Belegfeld 1 ersetzt unzulässige Zeichen, BT-1 steht vollständig im Buchungstext', () => {
    expect(belegfeld1('RE_2026.001')).toBe('RE-2026-001')
    expect(belegfeld1(' A$&%*+-/z ')).toBe('A$&%*+-/z')
    expect(belegfeld1('Ä'.repeat(40))).toBe('-'.repeat(36))
    const b: Buchung = { umsatzCent: 11900, sollHaben: 'H', konto: 70000, gegenkonto: 480, buSchluessel: null, belegdatum: '2026-10-05', rechnungsnummer: 'RE_2026.001', buchungstext: 'Bürobedarf Oktober', beleglink: null, leistungsdatum: null }
    const felder = buchungszeile(b, 4).split(';')
    expect(felder[10]).toBe('"RE-2026-001"')
    expect(felder[13]).toBe('"Bürobedarf Oktober RE_2026.001"')
    // Gegenkonto links mit Nullen auf die Sachkontenlänge, BU leer bei Automatikkonto
    expect(felder[7]).toBe('0480')
    expect(felder[8]).toBe('')
    expect(felder[9]).toBe('0510')
    // steht BT-1 schon im Text, bleibt er unverändert
    expect(buchungszeile({ ...b, buchungstext: 'Lieferant RE_2026.001' }, 4).split(';')[13]).toBe('"Lieferant RE_2026.001"')
    // Anführungszeichen werden verdoppelt, Zeilenumbrüche zu Leerzeichen
    expect(buchungszeile({ ...b, rechnungsnummer: 'A1', buchungstext: 'Er sagte "ja"\r\nok' }, 4).split(';')[13]).toBe('"Er sagte ""ja"" ok"')
    // Beleglink nur mit DUO-Paket
    expect(buchungszeile({ ...b, beleglink: '6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00' }, 4).split(';')[19]).toBe('"BEDI ""6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00"""')
  })

  it('T-E4: Soll/Haben aus Typ und Vorzeichen; Umsatz immer positiv', async () => {
    const gutschrift = await freigegeben('standard/02.01a-INVOICE_ubl.xml')
    gutschrift.daten!.typcode = '381'
    const e = testEinstellungen()
    const kt = kontierungVorschlagen(kontierungsquelle(gutschrift)!, { lieferantName: 'x', regeln: [], sachkonten: TESTKONTEN, kleinunternehmer: false, buSchluessel: e.datev.buSchluessel })
    expect(kt.sollHaben).toBe('S')
    expect(datevBetrag(123456)).toBe('1234,56')
    expect(datevBetrag(5)).toBe('0,05')
    expect(() => datevBetrag(-1)).toThrow(RangeError)
  })

  it('meldet nicht darstellbare Zeichen als Hinweis', () => {
    const e = testEinstellungen()
    const b: Buchung = { umsatzCent: 100, sollHaben: 'H', konto: 70000, gegenkonto: 4900, buSchluessel: '9', belegdatum: '2026-10-05', rechnungsnummer: '1', buchungstext: 'Ćevapčići 1', beleglink: null, leistungsdatum: null }
    const d = extfDatei({ erzeugtAm: ERZEUGT, datev: e.datev, monat: '2026-10', nachtragNr: 0 }, [b])
    expect(d.hinweise).toEqual(['Nicht in Windows-1252 darstellbare Zeichen wurden durch „_“ ersetzt: „Ć“ (U+0106), „č“ (U+010D), „ć“ (U+0107).'])
    expect(dekodiereWindows1252(d.bytes)).toContain('"_evap_i_i 1"')
  })
})

describe('Monatsübergabe (R19 Sperren, R21)', () => {
  it('T-K3 und T-K8: Sonderfall ohne BU-Schlüssel sperrt den Export', async () => {
    const b = await freigegeben('standard/01.21a-INVOICE_ubl.xml')
    expect(belegSperren(b, kontext())).toEqual(['BU-Schlüssel fehlt für den Steuerfall „Sonderfall“; mit der Kanzlei abstimmen.'])
    const klein = await freigegeben('standard/01.21a-INVOICE_ubl.xml', 4900, {}, true)
    expect(belegSperren(klein, kontext())[0]).toContain('BU-Schlüssel fehlt')
    // mit Schlüssel von Hand ist der Beleg exportierbar; ohne Vorsteuer braucht keinen
    expect(belegSperren({ ...b, kontierung: { ...b.kontierung!, zeilen: [{ ...b.kontierung!.zeilen[0], buSchluessel: '94' }] } }, kontext())).toEqual([])
    const klein0301 = await freigegeben('standard/03.01a-INVOICE_ubl.xml', 4900, {}, true)
    expect(belegSperren(klein0301, kontext())).toEqual([])
  })

  it('T-E5: Oktober mit einem Beleg ohne Sachkonto ist gesperrt, die Meldung nennt den Beleg', async () => {
    const gut = await freigegeben('standard/02.01a-INVOICE_ubl.xml')
    const ohne = await freigegeben('standard/03.01a-INVOICE_ubl.xml', null)
    for (const b of [gut, ohne]) b.daten!.rechnungsdatum = '2026-10-15'
    const plan = planeUebergabe('2026-10', [gut, ohne], [], kontext())
    expect(plan.sperren.map((s) => s.grund)).toEqual([`B-${String(ohne.laufnummer).padStart(5, '0')}: Sachkonto fehlt (Zeile 1).`, `B-${String(ohne.laufnummer).padStart(5, '0')}: Sachkonto fehlt (Zeile 2).`])
    expect(plan.sperren[0]).toMatchObject({ belegId: ohne.id, laufnummer: ohne.laufnummer })
  })

  it('weitere Sperren: Kreditorenkonto, Kontenplan, Sachkontenlänge, Fremdwährung, Stammdaten', async () => {
    const b = await freigegeben('standard/02.01a-INVOICE_ubl.xml')
    expect(belegSperren(b, kontext([lieferant(null)]))).toEqual(['Kreditorenkonto fehlt.'])
    expect(belegSperren(b, kontext([lieferant(7000)]))[0]).toContain('passt nicht zur Sachkontenlänge')
    expect(belegSperren(b, { ...kontext(), sachkonten: [] })).toEqual(['Das Sachkonto 4900 steht nicht im Kontenplan.'])
    const lang = { ...b, kontierung: { ...b.kontierung!, zeilen: [{ ...b.kontierung!.zeilen[0], sachkonto: 49000 }] } }
    expect(belegSperren(lang, { ...kontext(), sachkonten: [...TESTKONTEN, { nummer: 49000, bezeichnung: 'lang', automatikkonto: false, aktiv: true }] })[0]).toContain('länger als die Sachkontenlänge')
    const ohneBu = { ...b, kontierung: { ...b.kontierung!, zeilen: [{ ...b.kontierung!.zeilen[0], buSchluessel: null }] } }
    expect(belegSperren(ohneBu, kontext())[0]).toContain('BU-Schlüssel fehlt für den Steuerfall „Vorsteuer 19 %“')
    const usd = { ...b, daten: { ...b.daten!, waehrung: 'USD' } }
    expect(belegSperren(usd, kontext())[0]).toBe('Fremdwährung USD: Die Übergabe ist nur in Euro möglich.')
    // „nur Belege“: keine Kontenprüfung, aber Fremdwährung sperrt weiter
    expect(belegSperren({ ...usd, kontierung: null }, kontext([lieferant(null)], { exportmodus: 'nur-belege' }))).toHaveLength(1)
    expect(belegSperren({ ...b, kontierung: null }, kontext())).toEqual(['Der Beleg ist nicht kontiert.'])
    expect(stammdatenSperren({ beraternummer: 1000, mandantennummer: 0, sachkontenlaenge: 9 }).map((s) => s.grund.split(' ')[1])).toEqual(['Beraternummer', 'Mandantennummer', 'Sachkontenlänge'])
    expect(stammdatenSperren({ beraternummer: 1001, mandantennummer: 1, sachkontenlaenge: 4 })).toEqual([])
  })

  it('T-E6: Nachtrag nur mit neuen Belegen und Nummer N1', async () => {
    const alt = await freigegeben('standard/02.01a-INVOICE_ubl.xml', 4900, { status: 'exportiert', exportlaufId: 'L0' })
    const neu = await freigegeben('standard/03.01a-INVOICE_ubl.xml')
    for (const b of [alt, neu]) b.daten!.rechnungsdatum = '2026-10-20'
    const plan = planeUebergabe('2026-10', [alt, neu], [{ monat: '2026-10', nachtragNr: 0 }, { monat: '2026-09', nachtragNr: 0 }], kontext())
    expect(plan.nachtragNr).toBe(1)
    expect(plan.belege.map((b) => b.id)).toEqual([neu.id])
    expect(plan.anzahlJeStatus).toMatchObject({ exportiert: 1, freigegeben: 1 })
    const datei = extfDatei({ erzeugtAm: ERZEUGT, datev: kontext().einstellungen.datev, monat: '2026-10', nachtragNr: plan.nachtragNr }, plan.buchungen)
    expect(datei.name).toBe('EXTF_Buchungsstapel_1001_1_2026-10_N1.csv')
    expect(datei.text).toContain('"Belegbrücke 10/2026 N1"')
    expect(datei.text.split('\r\n')).toHaveLength(5)
    expect(naechsteNachtragNr('2026-11', [])).toBe(0)
  })

  it('T-E8: 01/2021 nur mit 01.20a (Typ 389): keine Buchung, Beleg unter „Nur Beleg“', async () => {
    const b = await freigegeben('standard/01.20a-INVOICE_ubl.xml')
    const plan = planeUebergabe('2021-01', [b], [], kontext([lieferant(null)]))
    expect(plan.sperren).toEqual([])
    expect(plan.buchungen).toEqual([])
    expect(plan.nurBeleg.map((x) => x.id)).toEqual([b.id])
    expect(plan.summen).toEqual([])
  })

  it('Summen je Steuersatz, Monatsvorschlag und offene Belege', async () => {
    const a = await freigegeben('standard/03.01a-INVOICE_ubl.xml')
    const gutschrift = await freigegeben('standard/02.01a-INVOICE_ubl.xml')
    gutschrift.kontierung!.sollHaben = 'S'
    const offen = await belegAus('standard/01.01a-INVOICE_ubl.xml', { status: 'geprueft' })
    for (const b of [a, gutschrift, offen]) b.daten!.rechnungsdatum = '2026-10-01'
    // 688,88 € − 12.829,69 € = −12.140,81 € zu 19 %; 115,98 € zu 7 %
    expect(summenJeSteuersatz([a, gutschrift]).map(steuersummeText)).toEqual(['S 19 %: −12.140,81 €', 'S 7 %: 115,98 €'])
    const plan = planeUebergabe('2026-10', [a, gutschrift, offen], [], kontext())
    expect(plan.summeBruttoCent).toBe(68888 - 1282969 + 11598)
    expect(plan.offen.map((b) => b.id)).toEqual([offen.id])
    const spaeter = await freigegeben('standard/01.01a-INVOICE_ubl.xml')
    expect(monatsvorschlag([spaeter, a, offen])).toBe('2016-04')
    expect(monatsvorschlag([offen])).toBeNull()
    expect(belegMonat(belegVonHand({ lieferantName: 'x', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '1', rechnungsdatum: '2026-09-30', leistungsdatum: null, steuern: [], bruttoCent: 0 }))).toBe('2026-09')
    expect(belegMonat({ daten: null, handerfassung: null })).toBeNull()
    expect(buchungenFuer({ ...a, kontierung: null }, kontext())).toEqual([])
    expect(buchungenFuer(a, kontext([lieferant(null)]))).toEqual([])
  })
})

describe('Belegpaket (R20)', () => {
  const beispiel = (aenderung: Partial<Paketbeleg> = {}): Paketbeleg => ({
    laufnummer: 1,
    belegId: '6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00',
    lieferant: '[Seller name]',
    rechnungsnummer: '123456XX',
    rechnungsdatum: '2016-04-04',
    bruttoCent: 33690,
    konto: 70000,
    gegenkonten: [4900],
    sha256: '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb',
    dateiname: '01.01a-INVOICE_ubl.xml',
    endung: 'xml',
    original: new TextEncoder().encode('<Invoice/>'),
    ansicht: '<html>123456XX</html>',
    pruefbericht: '{"angenommen":true}',
    ...aenderung,
  })

  it('T-E7 (Teil Fachlogik): Original, Ansicht, Prüfbericht und index.csv je Beleg', () => {
    const pdf = beispiel({ laufnummer: 2, belegId: 'B2', rechnungsnummer: 'RE_2026.001', lieferant: 'Müller; "Söhne"', endung: 'pdf', original: Uint8Array.from([0x25, 0x50, 0x44, 0x46]), ansicht: null, konto: null, gegenkonten: [] })
    const zip = unzipSync(belegpaket([beispiel(), pdf], ERZEUGT))
    expect(Object.keys(zip).sort()).toEqual(['ansicht/B-00001_123456XX.html', 'index.csv', 'originale/B-00001_123456XX.xml', 'originale/B-00002_RE-2026-001.pdf', 'pruefberichte/B-00001.json', 'pruefberichte/B-00002.json'])
    expect(strFromU8(zip['originale/B-00001_123456XX.xml'])).toBe('<Invoice/>')
    expect([...zip['originale/B-00002_RE-2026-001.pdf']]).toEqual([0x25, 0x50, 0x44, 0x46])
    expect([...zip['index.csv'].slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const index = strFromU8(zip['index.csv'])
    expect(index.startsWith('Laufnummer;Beleg-ID;Lieferant;Rechnungsnummer;Rechnungsdatum;Brutto;Konto;Gegenkonto;SHA-256;Dateiname\r\n')).toBe(true)
    expect(index.split('\r\n')[1]).toBe('"B-00001";"6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00";"[Seller name]";"123456XX";"04.04.2016";336,90;70000;"4900";"0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb";"01.01a-INVOICE_ubl.xml"')
    expect(index.split('\r\n')[2]).toContain('"Müller; ""Söhne""";"RE_2026.001"')
    expect(index.split('\r\n')[2]).toContain(';;""')
    expect(indexCsv([beispiel({ bruttoCent: -500 })])).toContain(';-5,00;')
    expect(belegpaketName('2026-10', 0)).toBe('Belege_2026-10.zip')
    expect(belegpaketName('2026-10', 1)).toBe('Belege_2026-10_N1.zip')
    expect(paketname({ laufnummer: 3, rechnungsnummer: '' })).toBe('B-00003')
  })
})
