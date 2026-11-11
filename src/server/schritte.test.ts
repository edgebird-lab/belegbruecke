/**
 * API-Tests der Assistentenschritte (B3 bis B6), der Stammdaten, der Übergabe (U1 bis U4) und des
 * Prüferexports gegen den Server mit Prüfung im Prozess.
 */
import { createHash } from 'node:crypto'
import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it } from 'vitest'
import { dekodiereWindows1252 } from '../fach/datev/cp1252.ts'
import type { Beleg, Einstellungen, Exportlauf, Kontierung, Kontierungsregel, Lieferant, Protokolleintrag } from '../fach/typen.ts'
import { kosit, zugferd } from '../testhilfen/dateien.ts'
import { BEISPIEL_FIRMA } from '../testhilfen/rechnungen.ts'
import { testserver } from '../testhilfen/server.ts'

type Server = ReturnType<typeof testserver>
const server: Server[] = []
afterEach(() => {
  for (const s of server.splice(0)) s.aufraeumen()
})

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

interface Detail {
  beleg: Beleg
  protokoll: Protokolleintrag[]
  lieferant: Lieferant | null
  lieferantenvorschlag: { schluessel: string; vorhanden: Lieferant | null; neu: { name: string } } | null
  kreditorVorschlag: number | null
  kontierungsvorschlag: Kontierung | null
  freigabe: { hindernisse: string[]; begruendungNoetig: boolean; vorsteuerGefaehrdet: boolean }
  dublettenVergleich: { hinweis: { stufe: string }; anderer: { belegnummer: string } | null }[]
}

/** Eingerichteter Server mit Beispiel-Firma und Test-Kontenplan (Spezifikation 9.2). */
async function bereit(): Promise<Server> {
  const s = testserver()
  server.push(s)
  await s.einrichten()
  const e = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen & { passwortGesetzt?: boolean }
  delete e.passwortGesetzt
  const r = await s.anfrage('/api/einstellungen', s.json({ ...e, firma: { ...BEISPIEL_FIRMA, ustId: undefined }, eingerichtetAm: 'jetzt' }, { method: 'PUT' }))
  expect(r.status).toBe(200)
  const csv = 'Konto;Bezeichnung;Automatik\n4900;Testaufwand;nein\n4901;Testaufwand Automatik;ja\n'
  expect((await s.anfrage('/api/sachkonten', s.json({ csv }))).status).toBe(200)
  return s
}

async function hochladen(s: Server, name: string, bytes: Uint8Array): Promise<string> {
  const r = await s.hochladen([{ name, bytes }])
  expect(r.status).toBe(201)
  const e = ((await r.json()) as { ergebnisse: { belegId: string }[] }).ergebnisse[0]
  return e.belegId
}

async function detail(s: Server, id: string): Promise<Detail> {
  const r = await s.anfrage(`/api/belege/${id}`)
  expect(r.status).toBe(200)
  return (await r.json()) as Detail
}

async function schritt(s: Server, id: string, pfad: string, daten: unknown, methode = 'POST', erwartet = 200) {
  const r = await s.anfrage(`/api/belege/${id}/${pfad}`, s.json(daten, { method: methode }))
  const text = await r.text()
  expect(r.status, text).toBe(erwartet)
  return JSON.parse(text) as { beleg: Beleg; fehler?: { code: string; text: string } }
}

/** B4 bis B6 mit neuem Lieferanten und 4900 auf allen Zeilen. */
async function bisZurFreigabe(s: Server, id: string, konto = 4900) {
  const d = await detail(s, id)
  await schritt(s, id, 'lieferant', d.lieferantenvorschlag?.vorhanden ? { lieferantId: d.lieferantenvorschlag.vorhanden.id } : { neu: { name: d.lieferantenvorschlag!.neu.name } }, 'PUT')
  const v = (await detail(s, id)).kontierungsvorschlag!
  await schritt(s, id, 'kontierung', { zeilen: v.zeilen.map(() => ({ sachkonto: konto })) }, 'PUT')
  return schritt(s, id, 'freigeben', { inhaltGeprueft: true })
}

describe('Assistentenschritte über die API (3.5, 3.6)', () => {
  it('U-2 über die API: 01.01a zuordnen, mit 4900 kontieren, freigeben', async () => {
    const s = await bereit()
    const id = await hochladen(s, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    const d = await detail(s, id)
    expect(d.beleg.status).toBe('geprueft')
    expect(d.lieferantenvorschlag).toMatchObject({ schluessel: 'ustid:DE123456789', vorhanden: null, neu: { name: '[Seller name]' } })
    expect(d.kreditorVorschlag).toBe(70000)
    expect(d.kontierungsvorschlag?.zeilen).toEqual([{ bruttoCent: 33690, steuerkategorie: 'S', steuersatz: '7', steuerfall: 'vorsteuer-7', sachkonto: null, buSchluessel: '8', buchungstext: '[Seller name] 123456XX' }])
    expect(d.freigabe.hindernisse).toEqual(['Der Lieferant ist noch nicht zugeordnet.', 'Der Beleg ist noch nicht kontiert.'])

    // Kontieren vor dem Zuordnen geht nicht
    const vorher = await schritt(s, id, 'kontierung', { zeilen: [{ sachkonto: 4900 }] }, 'PUT', 409)
    expect(vorher.fehler?.code).toBe('LIEFERANT-FEHLT')

    const z = await schritt(s, id, 'lieferant', { neu: { name: '[Seller name]' } }, 'PUT')
    expect(z.beleg.status).toBe('geprueft')
    const k = await schritt(s, id, 'kontierung', { zeilen: [{ sachkonto: 4900 }] }, 'PUT')
    expect(k.beleg.status).toBe('kontiert')
    expect(k.beleg.kontierung?.zeilen[0]).toMatchObject({ sachkonto: 4900, buSchluessel: '8' })

    const ohneHaken = await schritt(s, id, 'freigeben', { inhaltGeprueft: false }, 'POST', 409)
    expect(ohneHaken.fehler?.text).toContain('Rn. 35a')
    const f = await schritt(s, id, 'freigeben', { inhaltGeprueft: true })
    expect(f.beleg).toMatchObject({ status: 'freigegeben', inhaltGeprueft: true, freigabe: { begruendung: null } })

    const nach = await detail(s, id)
    expect(nach.lieferant).toMatchObject({ name: '[Seller name]', kreditorKonto: 70000, schluessel: 'ustid:DE123456789' })
    expect(nach.protokoll.map((p) => p.aktion)).toEqual(['eingang', 'pruefung', 'lieferant-zugeordnet', 'kontiert', 'freigegeben'])
    expect(nach.protokoll[4].daten).toMatchObject({ kreditorKonto: 70000, inhaltGeprueft: true, aufbewahrenBis: '2034-12-31' })
    const lieferanten = (await (await s.anfrage('/api/lieferanten')).json()) as { lieferanten: (Lieferant & { belege: number; regeln: Kontierungsregel[] })[] }
    expect(lieferanten.lieferanten[0].regeln).toMatchObject([{ steuerkategorie: 'S', steuersatz: '7', sachkonto: 4900, buSchluessel: '8', anzahl: 1 }])

    // Nach der Freigabe ist der Beleg eingefroren
    expect((await schritt(s, id, 'kontierung', { zeilen: [{ sachkonto: 4901 }] }, 'PUT', 409)).fehler?.text).toContain('Freigabe zurück')
    // Rücknahme senkt die Historie wieder
    const r = await schritt(s, id, 'freigabe-zuruecknehmen', { grund: 'Konto falsch' })
    expect(r.beleg).toMatchObject({ status: 'kontiert', freigabe: null })
    const nachher = (await (await s.anfrage('/api/lieferanten')).json()) as { lieferanten: { regeln: Kontierungsregel[] }[] }
    expect(nachher.lieferanten[0].regeln).toEqual([])
  })

  it('T-K4 über die API: der zweite Beleg des Lieferanten erhält den Vorschlag aus der Historie', async () => {
    const s = await bereit()
    const erste = await hochladen(s, 'a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await bisZurFreigabe(s, erste)
    const zweite = await hochladen(s, 'b.xml', kosit('standard/01.02a-INVOICE_ubl.xml'))
    const d = await detail(s, zweite)
    expect(d.lieferantenvorschlag?.vorhanden?.name).toBe('[Seller name]')
    await schritt(s, zweite, 'lieferant', { lieferantId: d.lieferantenvorschlag!.vorhanden!.id }, 'PUT')
    const v = (await detail(s, zweite)).kontierungsvorschlag!
    expect(v.herkunft).toBe('historie')
    expect(v.zeilen.every((z) => z.sachkonto === 4900)).toBe(true)
  })

  it('U-3 über die API: M1 ist nicht angenommen; Freigabe nur mit Begründung', async () => {
    const s = await bereit()
    const { mutation } = await import('../testhilfen/dateien.ts')
    const id = await hochladen(s, 'M1.xml', mutation('M1'))
    const d = await detail(s, id)
    expect(d.freigabe).toMatchObject({ begruendungNoetig: true, vorsteuerGefaehrdet: true })
    await schritt(s, id, 'lieferant', { neu: { name: 'Lieferant M1' } }, 'PUT')
    await schritt(s, id, 'kontierung', { zeilen: [{ sachkonto: 4900 }] }, 'PUT')
    expect((await schritt(s, id, 'freigeben', { inhaltGeprueft: true, begruendung: 'kurz' }, 'POST', 409)).fehler?.text).toContain('mindestens 10 Zeichen')
    const f = await schritt(s, id, 'freigeben', { inhaltGeprueft: true, begruendung: 'Steuerbetrag mit dem Lieferanten geklärt' })
    expect(f.beleg.freigabe?.begruendung).toBe('Steuerbetrag mit dem Lieferanten geklärt')
  })

  it('T-D2 über die API: gleiche Rechnung als UBL und CII sperrt bis zur Entscheidung', async () => {
    const s = await bereit()
    await hochladen(s, 'ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    const cii = await hochladen(s, 'cii.xml', kosit('standard/01.01a-INVOICE_uncefact.xml'))
    const d = await detail(s, cii)
    expect(d.dublettenVergleich).toMatchObject([{ hinweis: { stufe: 'gleiche-rechnung' }, anderer: { belegnummer: 'B-00001' } }])
    expect(d.freigabe.hindernisse).toContain('Möglicherweise dieselbe Rechnung wie ein anderer Beleg: Entscheiden Sie im Schritt „Zuordnen“, ob es eine Dublette ist.')
    const r = await schritt(s, cii, 'dublette', { ergebnis: 'dublette' })
    expect(r.beleg).toMatchObject({ status: 'abgelehnt', ablehnung: { grund: 'Dublette von B-00001' }, dublettenEntscheidung: { ergebnis: 'dublette' } })
    // Ablehnung aufheben: Entscheidung neu treffen
    const a = await schritt(s, cii, 'ablehnung-aufheben', {})
    expect(a.beleg).toMatchObject({ status: 'geprueft', ablehnung: null, dublettenEntscheidung: null })
    const k = await schritt(s, cii, 'dublette', { ergebnis: 'keine-dublette' })
    expect(k.beleg.status).toBe('geprueft')
    expect((await detail(s, cii)).freigabe.hindernisse).not.toContain('Möglicherweise dieselbe Rechnung wie ein anderer Beleg: Entscheiden Sie im Schritt „Zuordnen“, ob es eine Dublette ist.')
    expect((await schritt(s, cii, 'dublette', { ergebnis: 'dublette' }, 'POST', 200)).beleg.status).toBe('abgelehnt')
    const ohne = await hochladen(s, '02.xml', kosit('standard/02.01a-INVOICE_ubl.xml'))
    expect((await schritt(s, ohne, 'dublette', { ergebnis: 'dublette' }, 'POST', 409)).fehler?.code).toBe('KEINE-DUBLETTE')
  })

  it('lehnt ab nur mit Grund; Kreditorenkonto von Hand wird geprüft', async () => {
    const s = await bereit()
    const id = await hochladen(s, 'a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    expect((await schritt(s, id, 'ablehnen', { grund: 'x' }, 'POST', 400)).fehler?.code).toBe('GRUND')
    expect((await schritt(s, id, 'lieferant', { neu: { name: 'L' }, kreditorKonto: 7000 }, 'PUT', 400)).fehler?.text).toContain('5 Stellen')
    const z = await schritt(s, id, 'lieferant', { neu: { name: 'L' }, kreditorKonto: 70500 }, 'PUT')
    expect(z.beleg.lieferantId).toBeTruthy()
    expect((await detail(s, id)).lieferant?.kreditorKonto).toBe(70500)
    expect((await schritt(s, id, 'lieferant', { neu: { name: 'L' } }, 'PUT', 409)).fehler?.code).toBe('LIEFERANT-VORHANDEN')
    const a = await schritt(s, id, 'ablehnen', { grund: 'Keine Bestellung von uns' })
    expect(a.beleg).toMatchObject({ status: 'abgelehnt', ablehnung: { grund: 'Keine Bestellung von uns' } })
    expect((await schritt(s, id, 'freigeben', { inhaltGeprueft: true }, 'POST', 409)).fehler?.text).toContain('abgelehnt')
  })
})

describe('Erfassung von Hand über die API (3.7, R16)', () => {
  it('PDF ohne XML: erfassen, zuordnen, kontieren, freigeben; Kette bleibt intakt', async () => {
    const s = await bereit()
    const id = await hochladen(s, 'Quittung.pdf', zugferd('pdf-ohne-xml.pdf'))
    expect((await detail(s, id)).beleg.status).toBe('eingegangen')
    const hand = {
      lieferantName: 'Bäckerei Korn',
      lieferantUstId: null,
      lieferantSteuernummer: '12/345/67890',
      rechnungsnummer: 'Q-77',
      rechnungsdatum: '2026-10-02',
      leistungsdatum: '2026-10-02',
      steuern: [{ kategorie: 'S', satz: '7', bemessungCent: 1000, steuerCent: 70 }],
      bruttoCent: 1071,
    }
    const falsch = await schritt(s, id, 'handerfassung', hand, 'PUT', 400)
    expect(falsch.fehler?.text).toContain('Bruttobetrag ist 10,71 €')
    const r = await schritt(s, id, 'handerfassung', { ...hand, bruttoCent: 1070 }, 'PUT')
    expect(r.beleg.status).toBe('geprueft')
    expect(r.beleg.pruefung?.pflichtangaben?.regelwerk).toBe('§ 33 UStDV')
    const d = await detail(s, id)
    const eintrag = d.protokoll.at(-1)!
    expect(eintrag).toMatchObject({ aktion: 'pruefung', daten: { art: 'handerfassung', handerfassung: { rechnungsnummer: 'Q-77', bruttoCent: 1070 } } })
    expect(d.lieferantenvorschlag).toMatchObject({ schluessel: 'stnr:1234567890', neu: { name: 'Bäckerei Korn' } })
    await bisZurFreigabe(s, id)
    // Der zweite Prüfbericht ist der aktuelle
    const bericht = (await (await s.anfrage(`/api/belege/${id}/bericht`)).json()) as { pflichtangaben: { regelwerk: string } }
    expect(bericht.pflichtangaben.regelwerk).toBe('§ 33 UStDV')
    const kette = (await (await s.anfrage('/api/archiv/pruefen', s.json({}))).json()) as { bericht: { ok: boolean; fehler: string[] } }
    expect(kette.bericht).toMatchObject({ ok: true, fehler: [] })
    // E-Rechnungen werden nicht von Hand erfasst
    const xml = await hochladen(s, 'x.xml', kosit('standard/02.01a-INVOICE_ubl.xml'))
    expect((await schritt(s, xml, 'handerfassung', { ...hand, bruttoCent: 1070 }, 'PUT', 409)).fehler?.code).toBe('E-RECHNUNG')
  })
})

describe('Stammdaten (4.1)', () => {
  it('Kontenplan von Hand und als CSV, Lieferant mit Kreditorenkonto', async () => {
    const s = await bereit()
    const konten = (await (await s.anfrage('/api/sachkonten')).json()) as { sachkonten: { nummer: number }[] }
    expect(konten.sachkonten.map((k) => k.nummer)).toEqual([4900, 4901])
    expect((await s.anfrage('/api/sachkonten', s.json({ nummer: 12345, bezeichnung: 'zu lang', automatikkonto: false, aktiv: true }, { method: 'PUT' }))).status).toBe(400)
    const neu = await s.anfrage('/api/sachkonten', s.json({ nummer: 4930, bezeichnung: 'Bürobedarf', automatikkonto: false, aktiv: true }, { method: 'PUT' }))
    expect(await neu.json()).toMatchObject({ neu: true })
    const imp = await s.anfrage('/api/sachkonten', s.json({ csv: '4930;Büromaterial\n4940;Bücher\nabc;x' }))
    expect(await imp.json()).toEqual({ uebernommen: 2, neu: 1, geaendert: 1, fehler: ['Zeile 3: „abc“ ist keine Kontonummer.'] })
    expect((await s.anfrage('/api/sachkonten', s.json({ csv: 'abc;x' }))).status).toBe(400)

    const id = await hochladen(s, 'a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await schritt(s, id, 'lieferant', { neu: { name: '[Seller name]' } }, 'PUT')
    const l = (await detail(s, id)).lieferant!
    const put = (daten: object) => s.anfrage(`/api/lieferanten/${l.id}`, s.json({ name: l.name, ustId: l.ustId, steuernummer: l.steuernummer, anschrift: l.anschrift, kreditorKonto: null, ...daten }, { method: 'PUT' }))
    expect((await put({ kreditorKonto: 60000 })).status).toBe(400)
    const ok = await put({ name: 'Seller GmbH', kreditorKonto: 70010 })
    expect(await ok.json()).toMatchObject({ lieferant: { name: 'Seller GmbH', kreditorKonto: 70010 } })
    expect((await s.anfrage('/api/lieferanten/00000000-0000-4000-8000-00000000AAAA', s.json({ name: 'x', ustId: null, steuernummer: null, anschrift: {}, kreditorKonto: null }, { method: 'PUT' }))).status).toBe(404)
    const protokoll = s.d.protokoll.alle().filter((e) => e.aktion === 'einstellungen-geaendert').map((e) => (e.daten as { bereich: string }).bereich)
    expect(protokoll).toEqual(['benutzer', 'einstellungen', 'sachkonten-import', 'sachkonto', 'sachkonten-import', 'lieferant'])
  })

  it('setzt den Abschluss der Einrichtung mit der Uhr des Servers', async () => {
    const s = await bereit()
    const e = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen
    expect(e.eingerichtetAm).toBe('2026-11-11T09:30:00.000Z')
    s.vorspulen(60_000)
    const r = await s.anfrage('/api/einstellungen', s.json({ ...e, passwortGesetzt: undefined, eingerichtetAm: 'später' }, { method: 'PUT' }))
    expect(((await r.json()) as Einstellungen).eingerichtetAm).toBe('2026-11-11T09:30:00.000Z')
  })
})

describe('Übergabe an die Kanzlei (4.4 bis 4.6)', () => {
  it('U-4 über die API: 04/2016 mit 01.01a; Dateien, Kettenanker, Belegpaket bytegleich (T-E7)', async () => {
    const s = await bereit()
    const id = await hochladen(s, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await bisZurFreigabe(s, id)
    const liste = (await (await s.anfrage('/api/uebergaben')).json()) as { vorschlag: string }
    expect(liste.vorschlag).toBe('2016-04')
    const plan = (await (await s.anfrage('/api/uebergaben/plan?monat=2016-04')).json()) as { belege: { id: string }[]; sperren: unknown[]; summen: unknown[]; nachtragNr: number; buchungen: number }
    expect(plan).toMatchObject({ nachtragNr: 0, sperren: [], buchungen: 1, summen: [{ kategorie: 'S', satz: '7', bruttoCent: 33690 }] })
    expect((await s.anfrage('/api/uebergaben/plan?monat=2016-13')).status).toBe(400)

    s.vorspulen(60_000)
    // Doppelklick: zwei gleichzeitige Anfragen ergeben genau einen Lauf
    const [r, zweite] = await Promise.all([s.anfrage('/api/uebergaben', s.json({ monat: '2016-04' })), s.anfrage('/api/uebergaben', s.json({ monat: '2016-04' }))])
    expect(r.status).toBe(201)
    expect(zweite.status).toBe(409)
    expect(['LAEUFT', 'KEINE-BELEGE']).toContain(((await zweite.json()) as { fehler: { code: string } }).fehler.code)
    expect(s.d.exporte.alle()).toHaveLength(1)
    const { lauf } = (await r.json()) as { lauf: Exportlauf }
    expect(lauf.dateien.map((f) => f.name)).toEqual(['EXTF_Buchungsstapel_1001_1_2016-04.csv', 'Belege_2016-04.zip'])
    const letzter = s.d.protokoll.letzter()!
    expect(lauf.kettenanker).toEqual(letzter)
    expect(s.d.protokoll.alle().at(-1)).toMatchObject({ aktion: 'exportiert', belegId: null, daten: { belege: [id], monat: '2016-04' } })

    const extf = await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/${lauf.dateien[0].name}`)
    const bytes = new Uint8Array(await extf.arrayBuffer())
    expect(sha(bytes)).toBe(lauf.dateien[0].sha256)
    const text = dekodiereWindows1252(bytes)
    expect(text.split('\r\n')[2].split(';').slice(0, 11)).toEqual(['336,90', '"H"', '"EUR"', '', '', '', '70000', '4900', '"8"', '0404', '"123456XX"'])
    // erneuter Download bytegleich
    const zweiter = new Uint8Array(await (await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/${lauf.dateien[0].name}`)).arrayBuffer())
    expect(zweiter).toEqual(bytes)

    const zip = unzipSync(new Uint8Array(await (await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/Belege_2016-04.zip`)).arrayBuffer()))
    expect(Object.keys(zip).sort()).toEqual(['ansicht/B-00001_123456XX.html', 'index.csv', 'originale/B-00001_123456XX.xml', 'pruefberichte/B-00001.json'])
    expect(sha(zip['originale/B-00001_123456XX.xml'])).toBe('0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb')
    expect(strFromU8(zip['ansicht/B-00001_123456XX.html'])).toContain('123456XX')
    expect(strFromU8(zip['index.csv'])).toContain('"B-00001";')

    const d = await detail(s, id)
    expect(d.beleg).toMatchObject({ status: 'exportiert', exportlaufId: lauf.id })
    expect((await schritt(s, id, 'freigabe-zuruecknehmen', {}, 'POST', 409)).fehler?.text).toContain('übergeben')
    // ein Beleg wird genau einmal exportiert
    expect((await s.anfrage('/api/uebergaben', s.json({ monat: '2016-04' }))).status).toBe(409)
    const detailLauf = (await (await s.anfrage(`/api/uebergaben/${lauf.id}`)).json()) as { belege: { id: string }[]; benutzer: string }
    expect(detailLauf).toMatchObject({ belege: [{ id }], benutzer: 'Robin' })
    expect((await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/gibtsnicht.csv`)).status).toBe(404)
    expect((await s.anfrage('/api/uebergaben/00000000-0000-4000-8000-000000000000')).status).toBe(404)
    const kette = (await (await s.anfrage('/api/archiv/pruefen', s.json({ anker: [lauf.kettenanker] }))).json()) as { bericht: { ok: boolean } }
    expect(kette.bericht.ok).toBe(true)
  })

  it('sperrt mit Sonderfall ohne BU-Schlüssel (T-K3) und übergibt 01.20a nur als Beleg (T-E8)', async () => {
    const s = await bereit()
    const ae = await hochladen(s, '01.21a.xml', kosit('standard/01.21a-INVOICE_ubl.xml'))
    await bisZurFreigabe(s, ae)
    const r = await s.anfrage('/api/uebergaben', s.json({ monat: '2020-11' }))
    expect(r.status).toBe(409)
    const antwort = (await r.json()) as { fehler: { code: string }; sperren: { grund: string }[] }
    expect(antwort.fehler.code).toBe('GESPERRT')
    expect(antwort.sperren[0].grund).toBe('B-00001: BU-Schlüssel fehlt für den Steuerfall „Sonderfall“; mit der Kanzlei abstimmen.')

    const gs = await hochladen(s, '01.20a.xml', kosit('standard/01.20a-INVOICE_ubl.xml'))
    const v = (await detail(s, gs)).kontierungsvorschlag!
    expect(v.nurBeleg).toBe(true)
    await bisZurFreigabe(s, gs)
    expect((await detail(s, gs)).lieferant?.kreditorKonto).toBeNull()
    const lauf = (await (await s.anfrage('/api/uebergaben', s.json({ monat: '2021-01' }))).json()) as { lauf: Exportlauf }
    expect(lauf.lauf.dateien.map((f) => f.name)).toEqual(['Belege_2021-01.zip'])
    expect(lauf.lauf.nurBelegIds).toEqual([gs])
    expect(lauf.lauf.hinweise).toEqual(['Keine Buchungszeile in diesem Lauf, deshalb keine EXTF-Datei.'])
    expect((await s.anfrage('/api/uebergaben', s.json({ monat: '2021-02' }))).status).toBe(409)
  })
})

describe('Prüferexport (R22)', () => {
  it('enthält Originale, Prüfberichte, Belege, Protokoll und Kettenbericht', async () => {
    const s = await bereit()
    const id = await hochladen(s, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await hochladen(s, '02.01a.xml', kosit('standard/02.01a-INVOICE_ubl.xml'))
    await bisZurFreigabe(s, id)
    const r = await s.anfrage('/api/archiv/prueferexport', s.json({ von: '2016-01-01', bis: '2016-12-31' }))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-disposition')).toContain('Prueferexport_2016-01-01_2016-12-31.zip')
    const zip = unzipSync(new Uint8Array(await r.arrayBuffer()))
    expect(Object.keys(zip).sort()).toEqual(['LIESMICH.txt', 'belege.csv', 'kettenbericht.txt', 'originale/B-00001_123456XX.xml', 'protokoll.jsonl', 'pruefberichte/B-00001/1.json'])
    const csv = strFromU8(zip['belege.csv'])
    expect(csv.split('\r\n')[0].startsWith('id;laufnummer;status;')).toBe(true)
    expect(csv).toContain('original.sha256')
    expect(csv.split('\r\n')).toHaveLength(3)
    const protokoll = strFromU8(zip['protokoll.jsonl']).trim().split('\n').map((z) => JSON.parse(z) as Protokolleintrag)
    expect(protokoll.at(-1)?.aktion).toBe('kette-geprueft')
    expect(strFromU8(zip['kettenbericht.txt'])).toContain('in Ordnung')
    expect(s.d.protokoll.alle().at(-1)).toMatchObject({ aktion: 'prueferexport', daten: { von: '2016-01-01', belege: 1, kettePruefungOk: true } })
  })
})
