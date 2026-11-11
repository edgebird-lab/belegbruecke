import { describe, expect, it } from 'vitest'
import { belegAus, belegVonHand, leeresPruefergebnis } from '../testhilfen/belege.ts'
import { regel, TESTKONTEN, testEinstellungen } from '../testhilfen/kontenplan.ts'
import { befund } from './befunde.ts'
import { aktionErlaubt, begruendungNoetig, freigabeHindernisse, pruefeFreigabe, statusNachAufhebung, statusNachZuordnung, statusText, vorsteuerGefaehrdet } from './freigabe.ts'
import { pruefeHanderfassung } from './handerfassung.ts'
import {
  buchungstext,
  GRUND_NUR_BELEG,
  kontierungsquelle,
  kontierungUebernehmen,
  kontierungVollstaendig,
  kontierungVorschlagen,
  regelnNachFreigabe,
  regelnNachRuecknahme,
  sollHaben,
  steuerfall,
  type Kontierungsrahmen,
} from './kontierung.ts'
import { lieferantenschluessel } from './lieferant.ts'
import type { Beleg, Handerfassung, Kontierungsregel } from './typen.ts'

const L = 'AAAAAAAA-0000-4000-8000-000000000001'

function rahmen(regeln: Kontierungsregel[] = [], kleinunternehmer = false): Kontierungsrahmen {
  const e = testEinstellungen(kleinunternehmer)
  return { lieferantName: '[Seller name]', regeln, sachkonten: TESTKONTEN, kleinunternehmer: e.firma.kleinunternehmer, buSchluessel: e.datev.buSchluessel }
}

async function vorschlag(rel: string, r = rahmen()) {
  const b = await belegAus(rel)
  return kontierungVorschlagen(kontierungsquelle(b)!, r)
}

describe('Steuerfall und BU-Schlüssel (R13)', () => {
  it('ordnet Kategorie und Satz dem Steuerfall zu', () => {
    expect(steuerfall('S', '19', false)).toBe('vorsteuer-19')
    expect(steuerfall('s', '7', false)).toBe('vorsteuer-7')
    expect(steuerfall('S', '16', false)).toBe('sonderfall')
    expect(steuerfall('S', '', false)).toBe('sonderfall')
    for (const k of ['E', 'Z', 'O']) expect(steuerfall(k, '0', false)).toBe('ohne-vorsteuer')
    for (const k of ['AE', 'K', 'G', 'L', 'M']) expect(steuerfall(k, '0', false)).toBe('sonderfall')
  })

  it('Kleinunternehmer: S, Z, E und O ohne Vorsteuer, AE bis M bleiben Sonderfälle', () => {
    for (const k of ['S', 'Z', 'E', 'O']) expect(steuerfall(k, '19', true)).toBe('ohne-vorsteuer')
    for (const k of ['AE', 'K', 'G', 'L', 'M']) expect(steuerfall(k, '0', true)).toBe('sonderfall')
  })
})

describe('Kontierungsvorschlag (R12)', () => {
  it('T-K1: 02.01a, Lieferant neu: eine Zeile 12.829,69 €, Sachkonto leer, E-Zeile entfällt', async () => {
    const k = await vorschlag('standard/02.01a-INVOICE_ubl.xml')
    // 10.781,25 € + 2.048,44 € = 12.829,69 €; die Zeile E 0 % mit 0,00 € entfällt
    expect(k.zeilen).toEqual([
      { bruttoCent: 1282969, steuerkategorie: 'S', steuersatz: '19', steuerfall: 'vorsteuer-19', sachkonto: null, buSchluessel: '9', buchungstext: '[Seller name] 1234567' },
    ])
    expect(k).toMatchObject({ nurBeleg: false, sollHaben: 'H', herkunft: 'manuell', historieAnzahl: 0, manuellPruefen: [] })
  })

  it('T-K2: 03.01a mit zwei Steuersätzen und Anzahlung', async () => {
    const k = await vorschlag('standard/03.01a-INVOICE_ubl.xml')
    // 578,89 + 109,99 = 688,88 €; 108,39 + 7,59 = 115,98 €; zusammen 804,86 € = BT-112
    expect(k.zeilen.map((z) => [z.bruttoCent, z.steuerfall, z.buSchluessel])).toEqual([
      [68888, 'vorsteuer-19', '9'],
      [11598, 'vorsteuer-7', '8'],
    ])
    expect(k.zeilen[0].bruttoCent + k.zeilen[1].bruttoCent).toBe(80486)
    expect(k.manuellPruefen).toHaveLength(1)
    expect(k.manuellPruefen[0]).toContain('Anzahlung 1.030,00 €')
  })

  it('T-K3: 01.21a (AE) ist ein Sonderfall ohne BU-Schlüssel', async () => {
    const k = await vorschlag('standard/01.21a-INVOICE_ubl.xml')
    expect(k.zeilen.map((z) => [z.bruttoCent, z.steuerfall, z.buSchluessel])).toEqual([[23300, 'sonderfall', null]])
    expect(k.manuellPruefen.some((g) => g.startsWith('Steuerfall von Hand klären'))).toBe(true)
  })

  it('T-K4: Lieferant mit 3 freigegebenen Belegen auf 4900 (S 19 %)', async () => {
    const k = await vorschlag('standard/02.01a-INVOICE_ubl.xml', rahmen([regel(L, 4900, 3)]))
    expect(k.zeilen[0]).toMatchObject({ sachkonto: 4900, buSchluessel: '9' })
    expect(k).toMatchObject({ herkunft: 'historie', historieAnzahl: 3, manuellPruefen: [] })
  })

  it('T-K5: wie T-K4 mit dem Automatikkonto 4901: BU-Schlüssel leer', async () => {
    const k = await vorschlag('standard/02.01a-INVOICE_ubl.xml', rahmen([regel(L, 4901, 3)]))
    expect(k.zeilen[0]).toMatchObject({ sachkonto: 4901, buSchluessel: null })
  })

  it('T-K6: 01.17a mit Rundungsbetrag', async () => {
    const k = await vorschlag('standard/01.17a-INVOICE_ubl.xml')
    expect(k.manuellPruefen.some((g) => g.includes('Rundungsbetrag 0,01 €'))).toBe(true)
  })

  it('T-K7: Firma Kleinunternehmer, 03.01a: beide Zeilen ohne Vorsteuer, BU leer', async () => {
    const k = await vorschlag('standard/03.01a-INVOICE_ubl.xml', rahmen([], true))
    expect(k.zeilen.map((z) => [z.steuerfall, z.buSchluessel])).toEqual([
      ['ohne-vorsteuer', null],
      ['ohne-vorsteuer', null],
    ])
  })

  it('T-K8: Firma Kleinunternehmer, 01.21a (AE): Sonderfall', async () => {
    const k = await vorschlag('standard/01.21a-INVOICE_ubl.xml', rahmen([], true))
    expect(k.zeilen.map((z) => [z.steuerfall, z.buSchluessel])).toEqual([['sonderfall', null]])
  })

  it('T-K9: 01.20a (Typ 389) geht nur als Beleg, Partnerschlüssel aus dem Käufer', async () => {
    const b = await belegAus('standard/01.20a-INVOICE_ubl.xml')
    const k = kontierungVorschlagen(kontierungsquelle(b)!, rahmen())
    expect(k).toEqual({ zeilen: [], nurBeleg: true, sollHaben: 'H', herkunft: 'manuell', historieAnzahl: 0, manuellPruefen: [GRUND_NUR_BELEG] })
    expect(lieferantenschluessel(b.daten!)).toBe('ustid:DE987654321')
    expect(kontierungVollstaendig(k)).toBe(true)
  })

  it('übernimmt bei neuem Steuersatz das Sachkonto der häufigsten Regel mit Hinweis', async () => {
    const regeln = [regel(L, 4900, 2, 'S', '7'), regel(L, 4901, 5, 'S', '7'), { ...regel(L, 4900, 9, 'S', '7'), steuersatz: '16', sachkonto: 9999 }]
    const k = await vorschlag('standard/02.01a-INVOICE_ubl.xml', rahmen(regeln))
    // 9999 steht nicht im Kontenplan und zählt nicht; von den übrigen hat 4901 die meisten Belege
    expect(k.zeilen[0].sachkonto).toBe(4901)
    expect(k.historieAnzahl).toBe(5)
    expect(k.manuellPruefen.some((g) => g.startsWith('Steuersatz neu'))).toBe(true)
  })

  it('nennt Fremdwährung, abweichende Summe und unbekannten Rechnungstyp', async () => {
    const b = await belegAus('standard/01.01a-INVOICE_ubl.xml')
    b.daten!.waehrung = 'USD'
    b.daten!.typcode = '751'
    b.daten!.summen.bruttoCent = 33000
    const k = kontierungVorschlagen(kontierungsquelle(b)!, rahmen())
    expect(k.manuellPruefen.map((g) => g.split(' ')[0] + ' ' + g.split(' ')[1])).toEqual(['Summe weicht', 'Fremdwährung USD:', 'Rechnungstyp prüfen:'])
    b.daten!.typcode = '389'
    expect(kontierungVorschlagen(kontierungsquelle(b)!, rahmen()).manuellPruefen).toHaveLength(2)
  })

  it('übernimmt einen Sonderfall-Schlüssel aus der Historie', async () => {
    const r = rahmen([{ ...regel(L, 4900, 1, 'AE', '0'), buSchluessel: '94' }])
    const k = await vorschlag('standard/01.21a-INVOICE_ubl.xml', r)
    expect(k.zeilen[0]).toMatchObject({ sachkonto: 4900, buSchluessel: '94' })
  })

  it('kontiert eine Erfassung von Hand', () => {
    const h: Handerfassung = { lieferantName: 'Bäckerei Korn', lieferantUstId: null, lieferantSteuernummer: '12/345/67890', rechnungsnummer: 'Q-77', rechnungsdatum: '2026-10-02', leistungsdatum: null, steuern: [{ kategorie: 'S', satz: '7', bemessungCent: 1000, steuerCent: 70 }], bruttoCent: 1070 }
    const q = kontierungsquelle(belegVonHand(h))!
    expect(q).toMatchObject({ typcode: '380', waehrung: 'EUR', bruttoCent: 1070 })
    const k = kontierungVorschlagen(q, { ...rahmen(), lieferantName: 'Bäckerei Korn' })
    expect(k.zeilen).toEqual([{ bruttoCent: 1070, steuerkategorie: 'S', steuersatz: '7', steuerfall: 'vorsteuer-7', sachkonto: null, buSchluessel: '8', buchungstext: 'Bäckerei Korn Q-77' }])
    expect(kontierungsquelle({ daten: null, handerfassung: null })).toBeNull()
  })
})

describe('Soll/Haben und Buchungstext (R12 Punkte 5 und 6)', () => {
  it('T-E4: Gutschrift 381 und negative Beträge', () => {
    expect(sollHaben('380', 100)).toBe('H')
    expect(sollHaben('381', 100)).toBe('S')
    expect(sollHaben('380', -100)).toBe('S')
    expect(sollHaben('381', -100)).toBe('H')
  })

  it('kürzt zuerst den Namen auf insgesamt 60 Zeichen', () => {
    expect(buchungstext('Müller & Söhne', 'RE_2026.001')).toBe('Müller & Söhne RE_2026.001')
    const lang = buchungstext('A'.repeat(70), 'RE-2026-000123')
    expect(lang).toHaveLength(60)
    expect(lang.endsWith(' RE-2026-000123')).toBe(true)
    expect(buchungstext('Name', 'N'.repeat(70))).toBe('N'.repeat(60))
    expect(buchungstext('', '42')).toBe('42')
    expect(buchungstext('  Viel   Raum ', ' 7 ')).toBe('Viel Raum 7')
  })
})

describe('Wahl des Benutzers in Schritt B5', () => {
  it('setzt Sachkonten, berechnet den BU-Schlüssel neu und prüft die Eingaben', async () => {
    const e = testEinstellungen()
    const v = await vorschlag('standard/03.01a-INVOICE_ubl.xml')
    const r = kontierungUebernehmen(v, [{ sachkonto: 4900 }, { sachkonto: 4901, buchungstext: 'Bücher' }], TESTKONTEN, e.datev.buSchluessel)
    expect(r.ok && r.kontierung.zeilen.map((z) => [z.sachkonto, z.buSchluessel, z.buchungstext])).toEqual([
      [4900, '9', '[Seller name] 123456789'],
      [4901, null, 'Bücher'],
    ])
    expect(r.ok && r.kontierung.herkunft).toBe('manuell')
    expect(kontierungUebernehmen(v, [{ sachkonto: 4900 }], TESTKONTEN, e.datev.buSchluessel)).toEqual({ ok: false, fehler: 'Erwartet werden 2 Buchungszeilen, übermittelt wurden 1.' })
    expect(kontierungUebernehmen(v, [{ sachkonto: 1234 }, { sachkonto: null }], TESTKONTEN, e.datev.buSchluessel)).toMatchObject({ ok: false, fehler: 'Zeile 1: Das Sachkonto 1234 steht nicht im Kontenplan.' })
    const inaktiv = TESTKONTEN.map((k) => ({ ...k, aktiv: k.nummer !== 4900 }))
    expect(kontierungUebernehmen(v, [{ sachkonto: 4900 }, { sachkonto: null }], inaktiv, e.datev.buSchluessel)).toMatchObject({ ok: false, fehler: 'Zeile 1: Das Sachkonto 4900 ist inaktiv.' })
    expect(kontierungUebernehmen(v, [{ sachkonto: 4900, buchungstext: 'x'.repeat(61) }, { sachkonto: null }], TESTKONTEN, e.datev.buSchluessel)).toMatchObject({ ok: false })
    const teil = kontierungUebernehmen(v, [{ sachkonto: 4900 }, { sachkonto: null }], TESTKONTEN, e.datev.buSchluessel)
    expect(teil.ok && kontierungVollstaendig(teil.kontierung)).toBe(false)
  })

  it('erlaubt den BU-Schlüssel von Hand nur im Sonderfall', async () => {
    const e = testEinstellungen()
    const v = await vorschlag('standard/01.21a-INVOICE_ubl.xml')
    const r = kontierungUebernehmen(v, [{ sachkonto: 4900, buSchluessel: '94' }], TESTKONTEN, e.datev.buSchluessel)
    expect(r.ok && r.kontierung.zeilen[0].buSchluessel).toBe('94')
    const normal = await vorschlag('standard/02.01a-INVOICE_ubl.xml')
    const n = kontierungUebernehmen(normal, [{ sachkonto: 4900, buSchluessel: '94' }], TESTKONTEN, e.datev.buSchluessel)
    expect(n.ok && n.kontierung.zeilen[0].buSchluessel).toBe('9')
    const nur = await vorschlag('standard/01.20a-INVOICE_ubl.xml')
    expect(kontierungUebernehmen(nur, [], TESTKONTEN, e.datev.buSchluessel)).toMatchObject({ ok: true, kontierung: { nurBeleg: true, zeilen: [] } })
    expect(kontierungVollstaendig(null)).toBe(false)
  })
})

describe('Kontierungsregeln bei Freigabe und Rücknahme (R12 Punkt 8)', () => {
  it('legt Regeln an, zählt hoch und wieder herunter', async () => {
    const e = testEinstellungen()
    const v = await vorschlag('standard/03.01a-INVOICE_ubl.xml')
    const r = kontierungUebernehmen(v, [{ sachkonto: 4900 }, { sachkonto: 4900 }], TESTKONTEN, e.datev.buSchluessel)
    if (!r.ok) throw new Error(r.fehler)
    const erste = regelnNachFreigabe([], L, r.kontierung, '2026-11-11T10:00:00.000Z')
    expect(erste.map((g) => [g.steuerkategorie, g.steuersatz, g.sachkonto, g.buSchluessel, g.anzahl])).toEqual([
      ['S', '19', 4900, '9', 1],
      ['S', '7', 4900, '8', 1],
    ])
    const zweite = regelnNachFreigabe(erste, L, r.kontierung, '2026-11-12T10:00:00.000Z')
    expect(zweite.map((g) => g.anzahl)).toEqual([2, 2])
    expect(zweite[0].zuletzt).toBe('2026-11-12T10:00:00.000Z')
    expect(regelnNachRuecknahme(zweite, L, r.kontierung)).toEqual({ aendern: zweite.map((g) => ({ ...g, anzahl: 1 })), entfernen: [] })
    expect(regelnNachRuecknahme(erste, L, r.kontierung)).toEqual({ aendern: [], entfernen: erste })
    expect(regelnNachRuecknahme([], L, r.kontierung)).toEqual({ aendern: [], entfernen: [] })
    // gleiche Kategorie und gleicher Satz in zwei Zeilen zählen einmal
    const doppelt = { ...r.kontierung, zeilen: [r.kontierung.zeilen[0], r.kontierung.zeilen[0]] }
    expect(regelnNachFreigabe([], L, doppelt, 'z').map((g) => g.anzahl)).toEqual([1])
    expect(regelnNachRuecknahme(erste, L, doppelt).entfernen).toHaveLength(1)
    expect(regelnNachFreigabe([], L, { ...r.kontierung, nurBeleg: true }, 'z')).toEqual([])
    expect(regelnNachRuecknahme(erste, L, { ...r.kontierung, nurBeleg: true })).toEqual({ aendern: [], entfernen: [] })
    expect(regelnNachFreigabe([], L, { ...r.kontierung, zeilen: [{ ...r.kontierung.zeilen[0], sachkonto: null }] }, 'z')).toEqual([])
  })
})

describe('Status und Freigabe (Abschnitt 4, R14)', () => {
  async function kontierterBeleg(): Promise<Beleg> {
    const b = await belegAus('standard/02.01a-INVOICE_ubl.xml', { lieferantId: L })
    const v = kontierungVorschlagen(kontierungsquelle(b)!, rahmen([regel(L, 4900, 1)]))
    return { ...b, kontierung: v, status: statusNachZuordnung({ lieferantId: L, kontierung: v }) }
  }

  it('wird kontiert, sobald Lieferant und Sachkonten feststehen', async () => {
    const b = await kontierterBeleg()
    expect(b.status).toBe('kontiert')
    expect(statusNachZuordnung({ lieferantId: null, kontierung: b.kontierung })).toBe('geprueft')
    expect(freigabeHindernisse(b)).toEqual([])
    expect(pruefeFreigabe(b, { inhaltGeprueft: true, begruendung: null })).toBeNull()
    expect(pruefeFreigabe(b, { inhaltGeprueft: false, begruendung: null })).toContain('Rn. 35a')
  })

  it('nennt alle Hindernisse in Klartext', async () => {
    const b = await belegAus('standard/01.01a-INVOICE_ubl.xml', {
      dubletten: [{ stufe: 'gleiche-rechnung', andererBelegId: 'X', grund: 'g' }],
    })
    expect(freigabeHindernisse(b)).toEqual([
      'Der Lieferant ist noch nicht zugeordnet.',
      'Möglicherweise dieselbe Rechnung wie ein anderer Beleg: Entscheiden Sie im Schritt „Zuordnen“, ob es eine Dublette ist.',
      'Der Beleg ist noch nicht kontiert.',
    ])
    const teil = { ...b, lieferantId: L, dublettenEntscheidung: { ergebnis: 'keine-dublette' as const, benutzerId: 'B', am: 'z' }, kontierung: { ...kontierungVorschlagen(kontierungsquelle(b)!, rahmen()) } }
    expect(freigabeHindernisse(teil)).toEqual(['Nicht jede Buchungszeile hat ein Sachkonto.'])
    const nurBeleg = { ...(await belegAus('standard/01.20a-INVOICE_ubl.xml')), kontierung: kontierungVorschlagen(kontierungsquelle(await belegAus('standard/01.20a-INVOICE_ubl.xml'))!, rahmen()) }
    expect(freigabeHindernisse(nurBeleg)).toEqual(['Der Geschäftspartner ist noch nicht zugeordnet.'])
    expect(freigabeHindernisse({ ...nurBeleg, lieferantId: L })).toEqual(['Bestätigen Sie die Kontierung im Schritt „Kontieren“.'])
    expect(freigabeHindernisse({ ...nurBeleg, lieferantId: L, status: 'eingegangen' })[0]).toBe('Die Rechnungsdaten sind noch nicht von Hand erfasst.')
    expect(freigabeHindernisse({ ...nurBeleg, lieferantId: L, status: 'exportiert' })[0]).toContain('übergeben')
  })

  it('verlangt bei Fehlern eine Begründung und warnt bei Umsatzsteuer-Relevanz (U-3)', async () => {
    const b = await kontierterBeleg()
    const pruefung = { ...leeresPruefergebnis(false), befunde: [befund('BR-CO-14', { quelle: 'en16931', stufe: 'fehler', ustRelevant: true })] }
    const mitFehler = { ...b, pruefung }
    expect(begruendungNoetig(mitFehler)).toBe(true)
    expect(vorsteuerGefaehrdet(mitFehler)).toBe(true)
    expect(pruefeFreigabe(mitFehler, { inhaltGeprueft: true, begruendung: 'zu kurz' })).toContain('mindestens 10 Zeichen')
    expect(pruefeFreigabe(mitFehler, { inhaltGeprueft: true, begruendung: 'Mit Lieferant telefonisch geklärt' })).toBeNull()
    const nurDe15 = { ...b, pruefung: { ...pruefung, befunde: [befund('BR-DE-15', { quelle: 'xrechnung', stufe: 'fehler', ustRelevant: false })] } }
    expect(vorsteuerGefaehrdet(nurDe15)).toBe(false)
    expect(begruendungNoetig({ pruefung: null })).toBe(false)
    expect(vorsteuerGefaehrdet({ pruefung: null })).toBe(false)
    expect(pruefeFreigabe({ ...b, lieferantId: null }, { inhaltGeprueft: true, begruendung: null })).toBe('Der Lieferant ist noch nicht zugeordnet.')
  })

  it('erlaubt Aktionen nur im passenden Status', () => {
    expect(aktionErlaubt('kontiert', 'freigeben')).toBeNull()
    expect(aktionErlaubt('eingegangen', 'ablehnen')).toBeNull()
    expect(aktionErlaubt('exportiert', 'ablehnen')).toContain('übergeben')
    expect(aktionErlaubt('freigegeben', 'kontieren')).toContain('Freigabe zurück')
    expect(aktionErlaubt('abgelehnt', 'freigeben')).toContain('Ablehnung auf')
    expect(aktionErlaubt('eingegangen', 'kontieren')).toContain('von Hand')
    expect(aktionErlaubt('geprueft', 'freigeben')).toBe('Im Status „geprüft“ ist das nicht möglich.')
    expect(aktionErlaubt('geprueft', 'ablehnung-aufheben')).toContain('geprüft')
    expect(statusText('exportiert')).toBe('exportiert')
  })

  it('hebt eine Ablehnung zu geprüft auf, sonstige Rechnungen ohne Erfassung zu eingegangen', async () => {
    const b = await belegAus('standard/01.01a-INVOICE_ubl.xml')
    expect(statusNachAufhebung(b)).toBe('geprueft')
    const h = belegVonHand({ lieferantName: 'x', lieferantUstId: null, lieferantSteuernummer: null, rechnungsnummer: '1', rechnungsdatum: '2026-01-01', leistungsdatum: null, steuern: [], bruttoCent: 0 })
    expect(statusNachAufhebung(h)).toBe('geprueft')
    expect(statusNachAufhebung({ ...h, handerfassung: null })).toBe('eingegangen')
  })
})

describe('Erfassung von Hand (R16)', () => {
  const gut: Handerfassung = {
    lieferantName: 'Bäckerei Korn',
    lieferantUstId: null,
    lieferantSteuernummer: '12/345/67890',
    rechnungsnummer: 'Q-77',
    rechnungsdatum: '2026-10-02',
    leistungsdatum: '2026-10-02',
    // 100,00 € zu 19 % = 19,00 €; 50,00 € zu 7 % = 3,50 €; 10,00 € steuerfrei; zusammen 182,50 €
    steuern: [
      { kategorie: 'S', satz: '19', bemessungCent: 10000, steuerCent: 1900 },
      { kategorie: 'S', satz: '7', bemessungCent: 5000, steuerCent: 350 },
      { kategorie: 'E', satz: '0', bemessungCent: 1000, steuerCent: 0 },
    ],
    bruttoCent: 18250,
  }

  it('nimmt stimmige Werte ohne Befund an', () => {
    expect(pruefeHanderfassung(gut, '2026-11-11')).toEqual({ fehler: [], befunde: [] })
  })

  it('verlangt die Pflichtfelder und eine Summe auf den Cent', () => {
    const r = pruefeHanderfassung({ ...gut, lieferantName: ' ', rechnungsnummer: '', rechnungsdatum: '2026-02-30', leistungsdatum: '2026-13-01', bruttoCent: 18251 }, '2026-11-11')
    expect(r.fehler).toEqual([
      'Lieferant fehlt.',
      'Rechnungsnummer fehlt.',
      'Rechnungsdatum fehlt oder ist kein gültiges Datum.',
      'Das Leistungsdatum ist kein gültiges Datum.',
      'Die Steuerzeilen ergeben 182,50 €, der Bruttobetrag ist 182,51 €. Beide müssen auf den Cent übereinstimmen.',
    ])
    expect(pruefeHanderfassung({ ...gut, steuern: [], bruttoCent: 0 }, '2026-11-11').fehler).toEqual(['Mindestens eine Steuerzeile ist nötig.'])
    expect(pruefeHanderfassung({ ...gut, bruttoCent: Number.NaN }, '2026-11-11').fehler).toEqual(['Der Bruttobetrag fehlt.'])
  })

  it('prüft jede Steuerzeile', () => {
    const r = pruefeHanderfassung(
      {
        ...gut,
        steuern: [
          { kategorie: 'S', satz: '19', bemessungCent: 1.5, steuerCent: 0 },
          { kategorie: 'AE', satz: '0', bemessungCent: 1000, steuerCent: 190 },
          { kategorie: 'S', satz: 'neunzehn', bemessungCent: 1000, steuerCent: 190 },
          { kategorie: 'S', satz: '0', bemessungCent: 1000, steuerCent: 0 },
        ],
      },
      '2026-11-11',
    )
    expect(r.fehler.slice(0, 4)).toEqual([
      'Steuerzeile 1: Beträge müssen ganze Cent sein.',
      'Steuerzeile 2: Bei Steuerschuldnerschaft des Empfängers (AE) weist die Rechnung keine Steuer aus.',
      'Steuerzeile 3: Der Steuersatz „neunzehn“ ist keine Zahl größer 0.',
      'Steuerzeile 4: Der Steuersatz „0“ ist keine Zahl größer 0.',
    ])
  })

  it('warnt bei falsch gerundeter Steuer, unüblichem Satz und Datum in der Zukunft', () => {
    // 33,33 € zu 19 % = 6,3327 € → 6,33 €; erfasst 6,34 €
    const r = pruefeHanderfassung({ ...gut, rechnungsdatum: '2026-11-13', steuern: [{ kategorie: 'S', satz: '19', bemessungCent: 3333, steuerCent: 634 }, { kategorie: 'S', satz: '16', bemessungCent: 1000, steuerCent: 160 }], bruttoCent: 3967 + 1160 }, '2026-11-11')
    expect(r.fehler).toEqual([])
    expect(r.befunde.map((b) => [b.regelId, b.stufe])).toEqual([
      ['HAND-STEUER', 'warnung'],
      ['PLAUS-STEUERSATZ', 'warnung'],
      ['PLAUS-DATUM', 'warnung'],
    ])
    expect(r.befunde[0].klartext).toContain('19 % von 33,33 € ergeben 6,33 €, erfasst sind 6,34 €.')
    // ein Tag in der Zukunft ist noch erlaubt
    expect(pruefeHanderfassung({ ...gut, rechnungsdatum: '2026-11-12' }, '2026-11-11').befunde).toEqual([])
  })
})
