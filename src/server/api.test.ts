import { afterEach, describe, expect, it } from 'vitest'
import { kosit, text, zugferd } from '../testhilfen/dateien.ts'
import { testserver } from '../testhilfen/server.ts'
import type { Beleg, Protokolleintrag } from '../fach/typen.ts'

const server: ReturnType<typeof testserver>[] = []
function neu() {
  const s = testserver()
  server.push(s)
  return s
}
afterEach(() => {
  for (const s of server.splice(0)) s.aufraeumen()
})

interface Ergebnis {
  ok: boolean
  code?: string
  text?: string
  belegId?: string
  laufnummer?: number
  status?: string
  format?: string
  ampel?: { farbe: string; text: string }
  dubletten?: { stufe: string; grund: string }[]
}

async function hochladen(s: ReturnType<typeof testserver>, name: string, bytes: Uint8Array) {
  const r = await s.hochladen([{ name, bytes }])
  expect(r.status).toBe(201)
  return ((await r.json()) as { ergebnisse: Ergebnis[] }).ergebnisse[0]
}

describe('HTTP-API: Upload-Ablauf (2.5)', () => {
  it('lädt 01.01a hoch und erhält „angenommen“', async () => {
    const s = neu()
    await s.einrichten()
    const e = await hochladen(s, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    expect(e).toMatchObject({ ok: true, laufnummer: 1, status: 'geprueft', format: 'XRechnung 3.0, UBL' })
    expect(e.ampel?.farbe).toBe('gelb') // Leistungszeitpunkt (R8 Nr. 6), siehe T9

    const r = await s.anfrage(`/api/belege/${e.belegId}`)
    const { beleg, protokoll, aufbewahrung } = (await r.json()) as { beleg: Beleg; protokoll: Protokolleintrag[]; aufbewahrung: string }
    expect(beleg.pruefung?.angenommen).toBe(true)
    expect(beleg.pruefung?.szenario).toBe('EN16931 XRechnung (UBL Invoice)')
    expect(beleg.pruefung?.pruefprogramm).toBe('belegbruecke 0.1.0')
    expect(beleg.daten?.rechnungsnummer).toBe('123456XX')
    expect(beleg.original).toMatchObject({ sha256: '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb', groesseBytes: 6887, mimeTyp: 'application/xml' })
    expect(beleg.aufbewahrenBis).toBe('2034-12-31')
    expect(aufbewahrung).toContain('31.12.2034')
    expect(protokoll.map((p) => p.aktion)).toEqual(['eingang', 'pruefung'])
    expect(protokoll[0].daten).toMatchObject({ dateiname: '01.01a-INVOICE_ubl.xml', groesseBytes: 6887, quelle: 'upload', sha256: beleg.original.sha256 })
    expect(protokoll[1].daten).toMatchObject({ angenommen: true, szenario: 'EN16931 XRechnung (UBL Invoice)', berichtSha256: beleg.pruefberichtSha256 })
  })

  it('liefert Original, Prüfbericht und Ansicht', async () => {
    const s = neu()
    await s.einrichten()
    const bytes = kosit('standard/01.01a-INVOICE_ubl.xml')
    const e = await hochladen(s, 'Rechnung März.xml', bytes)
    const original = await s.anfrage(`/api/belege/${e.belegId}/original`)
    expect(original.headers.get('content-type')).toBe('application/xml')
    expect(original.headers.get('content-disposition')).toBe(`attachment; filename="Rechnung M_rz.xml"; filename*=UTF-8''Rechnung%20M%C3%A4rz.xml`)
    expect(new Uint8Array(await original.arrayBuffer())).toEqual(bytes)
    const bericht = await s.anfrage(`/api/belege/${e.belegId}/bericht`)
    expect(bericht.headers.get('content-disposition')).toContain('Pruefbericht_B-00001.json')
    expect(((await bericht.json()) as { angenommen: boolean }).angenommen).toBe(true)
    const ansicht = await s.anfrage(`/api/belege/${e.belegId}/ansicht`)
    expect(ansicht.status).toBe(200)
    expect(await ansicht.text()).toContain('123456XX')
    // zweiter Abruf aus dem Zwischenspeicher
    expect((await s.anfrage(`/api/belege/${e.belegId}/ansicht`)).status).toBe(200)
  })

  it('T-D1: dieselbe Datei zweimal ergibt keinen neuen Beleg, aber einen Protokolleintrag', async () => {
    const s = neu()
    await s.einrichten()
    const bytes = kosit('standard/01.01a-INVOICE_ubl.xml')
    const erste = await hochladen(s, 'a.xml', bytes)
    const zweite = await hochladen(s, 'b.xml', bytes)
    expect(zweite).toMatchObject({ ok: false, code: 'DUBLETTE-IDENTISCH', belegId: erste.belegId, laufnummer: 1 })
    expect(zweite.text).toContain('B-00001')
    const liste = (await (await s.anfrage('/api/belege')).json()) as { belege: unknown[] }
    expect(liste.belege).toHaveLength(1)
    const verworfen = s.d.protokoll.alle().filter((p) => p.aktion === 'eingang-verworfen')
    expect(verworfen).toHaveLength(1)
    expect(verworfen[0].daten).toMatchObject({ grund: 'identische-datei', andererBelegId: erste.belegId, dateiname: 'b.xml' })
  })

  it('T-D2: 01.01a als UBL, dann als CII ist die gleiche Rechnung', async () => {
    const s = neu()
    await s.einrichten()
    await hochladen(s, 'ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    const cii = await hochladen(s, 'cii.xml', kosit('standard/01.01a-INVOICE_uncefact.xml'))
    expect(cii.dubletten?.map((h) => h.stufe)).toEqual(['gleiche-rechnung'])
  })

  it('nimmt mehrere Dateien auf einmal an, auch ZUGFeRD und PDF ohne XML', async () => {
    const s = neu()
    await s.einrichten()
    const r = await s.hochladen([
      { name: 'zf.pdf', bytes: zugferd('zf-en16931.pdf') },
      { name: 'scan.pdf', bytes: zugferd('pdf-ohne-xml.pdf') },
      { name: '03.01a.xml', bytes: kosit('standard/03.01a-INVOICE_ubl.xml') },
    ])
    const { ergebnisse } = (await r.json()) as { ergebnisse: Ergebnis[] }
    expect(ergebnisse.map((e) => [e.ok, e.status, e.format])).toEqual([
      [true, 'geprueft', 'EN 16931, CII'],
      [true, 'eingegangen', 'PDF ohne E-Rechnung'],
      [true, 'geprueft', 'XRechnung 3.0, UBL'],
    ])
    expect(ergebnisse[1].ampel?.farbe).toBe('grau')
    // Ansicht aus der PDF
    const ansicht = await s.anfrage(`/api/belege/${ergebnisse[0].belegId}/ansicht`)
    expect(await ansicht.text()).toContain('123456XX')
    expect((await s.anfrage(`/api/belege/${ergebnisse[1].belegId}/ansicht`)).status).toBe(404)
    const liste = (await (await s.anfrage('/api/belege?status=geprueft')).json()) as { belege: { belegnummer: string }[] }
    expect(liste.belege.map((b) => b.belegnummer)).toEqual(['B-00003', 'B-00001'])
  })

  it('lehnt unbekannte Dateitypen ab und protokolliert das', async () => {
    const s = neu()
    await s.einrichten()
    const e = await hochladen(s, 'notiz.txt', text('Bitte zahlen'))
    expect(e).toMatchObject({ ok: false, code: 'DATEI-TYP' })
    expect(s.d.protokoll.alle().at(-1)).toMatchObject({ aktion: 'eingang-verworfen', daten: { grund: 'DATEI-TYP', dateiname: 'notiz.txt' } })
  })

  it('T-S4: der Dateiname aus dem Upload wird nie als Pfad benutzt', async () => {
    const s = neu()
    await s.einrichten()
    const e = await hochladen(s, '../../x.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    const { beleg } = (await (await s.anfrage(`/api/belege/${e.belegId}`)).json()) as { beleg: Beleg }
    expect(beleg.original.dateiname).toBe('x.xml')
    expect(beleg.original.speicherpfad).toBe(`originale/0e/${beleg.original.sha256}.xml`)
  })

  it('sucht nach Rechnungsnummer, Namen und Monat', async () => {
    const s = neu()
    await s.einrichten()
    await s.hochladen([
      { name: 'a.xml', bytes: kosit('standard/01.01a-INVOICE_ubl.xml') },
      { name: 'b.xml', bytes: kosit('standard/03.01a-INVOICE_ubl.xml') },
    ])
    const suche = async (q: string) => ((await (await s.anfrage(`/api/belege?${q}`)).json()) as { belege: { rechnungsnummer: string }[] }).belege.map((b) => b.rechnungsnummer)
    expect(await suche('suche=123456XX')).toEqual(['123456XX'])
    expect(await suche('suche=seller%20name')).toHaveLength(2)
    expect(await suche('monat=2016-04')).toEqual(['123456XX'])
    expect(await suche('suche=gibt-es-nicht')).toEqual([])
    expect((await s.anfrage('/api/belege?status=unsinn')).status).toBe(400)
  })

  it('prüft das Archiv über die API', async () => {
    const s = neu()
    await s.einrichten()
    await hochladen(s, 'a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    const r = await s.anfrage('/api/archiv/pruefen', s.json({}))
    const { bericht, text: t } = (await r.json()) as { bericht: { ok: boolean; dateien: number }; text: string }
    expect(bericht).toMatchObject({ ok: true, dateien: 2 })
    expect(t).toContain('Kettenbericht')
  })

  it('liest und ändert Einstellungen mit Protokolleintrag, Passwort nie sichtbar', async () => {
    const s = neu()
    await s.einrichten()
    const e = (await (await s.anfrage('/api/einstellungen')).json()) as Record<string, unknown> & { firma: { name: string }; datev: Record<string, unknown> }
    expect(e.datev).toMatchObject({ beraternummer: 1001, mandantennummer: 1, kontenrahmen: 'SKR03', buSchluessel: { 'vorsteuer-19': '9', 'vorsteuer-7': '8' } })
    expect(e.passwortGesetzt).toBe(false)
    const { passwortGesetzt: _, ...ohne } = e
    void _
    const neu1 = { ...ohne, firma: { ...e.firma, name: '[Buyer name]' } }
    const r = await s.anfrage('/api/einstellungen', s.json(neu1, { method: 'PUT' }))
    expect(r.status).toBe(200)
    const eintrag = s.d.protokoll.alle().at(-1)!
    expect(eintrag).toMatchObject({ aktion: 'einstellungen-geaendert', daten: { bereich: 'einstellungen', aenderungen: [{ pfad: 'firma.name', alt: '', neu: '[Buyer name]' }] } })
    const falsch = await s.anfrage('/api/einstellungen', s.json({ ...neu1, datev: { ...e.datev, beraternummer: 5 } }, { method: 'PUT' }))
    expect(falsch.status).toBe(400)
    const f = (await falsch.json()) as { fehler: { code: string; text: string } }
    expect(f.fehler.code).toBe('EINGABE')
    expect(f.fehler.text).toContain('datev.beraternummer')
  })

  it('meldet die Prüfartefakte im Status', async () => {
    const s = neu()
    const st = (await (await s.anfrage('/api/status')).json()) as { version: string; artefakte: { konfiguration: string } | null; einrichtungNoetig: boolean }
    expect(st.version).toBe('0.1.0')
    expect(st.einrichtungNoetig).toBe(true)
    expect(st.artefakte?.konfiguration).toContain('XRechnung 3.0.2')
  })
})
