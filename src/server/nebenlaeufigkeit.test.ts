/**
 * Gleichzeitige Anfragen (Prüferfund vom 11.11.2026): Doppelklick, zweites Fenster, zweiter Benutzer oder
 * der Postfach-Abruf dürfen keinen neueren Stand still überschreiben, keinen Schritt doppelt protokollieren
 * und keine unverbuchten Dateien hinterlassen, die die Kettenprüfung als Fehler meldet.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Akteur, Beleg, Einstellungen, Kontierung, Kontierungsregel, Lieferant, Protokolleintrag } from '../fach/typen.ts'
import { kosit, WURZEL, zugferd } from '../testhilfen/dateien.ts'
import { BEISPIEL_FIRMA } from '../testhilfen/rechnungen.ts'
import { testserver } from '../testhilfen/server.ts'
import { erfasseVonHand, GEAENDERT_TEXT, lehneAb, nimmFreigabeZurueck } from './dienste/belegschritte.ts'

type Server = ReturnType<typeof testserver>
const server: Server[] = []
afterEach(() => {
  for (const s of server.splice(0)) s.aufraeumen()
})

interface Detail {
  beleg: Beleg
  protokoll: Protokolleintrag[]
  lieferant: Lieferant | null
  lieferantenvorschlag: { vorhanden: Lieferant | null; neu: { name: string } } | null
  kontierungsvorschlag: Kontierung | null
}

async function bereit(): Promise<Server> {
  const s = testserver()
  server.push(s)
  await s.einrichten()
  const e = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen & { passwortGesetzt?: boolean }
  delete e.passwortGesetzt
  expect((await s.anfrage('/api/einstellungen', s.json({ ...e, firma: { ...BEISPIEL_FIRMA, ustId: undefined }, eingerichtetAm: 'jetzt' }, { method: 'PUT' }))).status).toBe(200)
  expect((await s.anfrage('/api/sachkonten', s.json({ csv: '4900;Testaufwand;nein\n4901;Testaufwand Automatik;ja\n' }))).status).toBe(200)
  return s
}

async function hochladen(s: Server, name: string, bytes: Uint8Array): Promise<string> {
  const r = await s.hochladen([{ name, bytes }])
  expect(r.status).toBe(201)
  return ((await r.json()) as { ergebnisse: { belegId: string }[] }).ergebnisse[0].belegId
}

const detail = async (s: Server, id: string) => (await (await s.anfrage(`/api/belege/${id}`)).json()) as Detail

/** Zuordnen (neuer oder vorhandener Lieferant) und alle Zeilen auf 4900 kontieren. */
async function kontiert(s: Server, id: string) {
  const d = await detail(s, id)
  const zuordnung = d.lieferantenvorschlag!.vorhanden ? { lieferantId: d.lieferantenvorschlag!.vorhanden.id } : { neu: { name: d.lieferantenvorschlag!.neu.name } }
  expect((await s.anfrage(`/api/belege/${id}/lieferant`, s.json(zuordnung, { method: 'PUT' }))).status).toBe(200)
  const v = (await detail(s, id)).kontierungsvorschlag!
  expect((await s.anfrage(`/api/belege/${id}/kontierung`, s.json({ zeilen: v.zeilen.map(() => ({ sachkonto: 4900 })) }, { method: 'PUT' }))).status).toBe(200)
}

async function ketteInOrdnung(s: Server) {
  const r = (await (await s.anfrage('/api/archiv/pruefen', s.json({}))).json()) as { bericht: { ok: boolean; fehler: string[]; dateien: number } }
  expect(r.bericht.fehler).toEqual([])
  expect(r.bericht.ok).toBe(true)
  return r.bericht
}

const fallbeispiel = (name: string) => new Uint8Array(readFileSync(join(WURZEL, 'testdaten', 'fallbeispiel', name)))

const akteur = (s: Server): Akteur => ({ art: 'benutzer', id: s.d.benutzer.alle()[0].id })

describe('Gleichzeitige Anfragen auf denselben Beleg', () => {
  it('doppeltes Freigeben: genau eine Freigabe, ein Protokolleintrag, die Kontierungsregel zählt einmal', async () => {
    const s = await bereit()
    const id = await hochladen(s, '01.01a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await kontiert(s, id)
    const antworten = await Promise.all([1, 2].map(() => s.anfrage(`/api/belege/${id}/freigeben`, s.json({ inhaltGeprueft: true }))))
    // Vorher: 200 und 200, zwei Einträge „freigegeben“ und anzahl 2 in der Kontierungsregel
    expect(antworten.map((r) => r.status).sort()).toEqual([200, 409])
    const zweite = (await antworten.find((r) => r.status === 409)!.json()) as { fehler: { code: string; text: string } }
    expect(zweite.fehler.code).toBe('FREIGABE')
    expect(zweite.fehler.text).toBe('Der Beleg ist freigegeben. Nehmen Sie zuerst die Freigabe zurück.')
    const d = await detail(s, id)
    expect(d.protokoll.filter((p) => p.aktion === 'freigegeben')).toHaveLength(1)
    expect((s.d.regeln.fuerLieferant(d.lieferant!.id) as Kontierungsregel[]).map((r) => r.anzahl)).toEqual([1])
  })

  it('ein veralteter Stand überschreibt nichts: Ablehnen nach fremder Freigabe ergibt 409', async () => {
    const s = await bereit()
    const id = await hochladen(s, '01.01a.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
    await kontiert(s, id)
    const veraltet = s.d.belege.hole(id)!
    expect((await s.anfrage(`/api/belege/${id}/freigeben`, s.json({ inhaltGeprueft: true }))).status).toBe(200)
    const r = lehneAb(s.d, veraltet, 'Rechnung doppelt erhalten', akteur(s))
    expect(r).toEqual({ ok: false, status: 409, code: 'GEAENDERT', text: GEAENDERT_TEXT })
    expect(s.d.belege.hole(id)!.status).toBe('freigegeben')
    expect((await detail(s, id)).protokoll.map((p) => p.aktion)).not.toContain('abgelehnt')
    // ebenso eine Rücknahme mit veraltetem Stand (zweites Fenster, das die Freigabe noch nicht kennt)
    const frisch = s.d.belege.hole(id)!
    expect(nimmFreigabeZurueck(s.d, frisch, null, akteur(s)).ok).toBe(true)
    expect(nimmFreigabeZurueck(s.d, frisch, null, akteur(s))).toMatchObject({ ok: false, code: 'GEAENDERT' })
    await ketteInOrdnung(s)
  })

  it('Ablehnen, solange die Prüfung noch läuft, ergibt 409; danach geht es', async () => {
    const s = await bereit()
    // Prüfung anhalten, bis der Test sie freigibt
    const echt = s.d.pruefer.xml
    let weiter: () => void = () => undefined
    const gestoppt = new Promise<void>((ok) => (weiter = ok))
    s.d.pruefer.xml = async (bytes, rahmen) => {
      await gestoppt
      return echt(bytes, rahmen)
    }
    const upload = s.hochladen([{ name: '01.01a.xml', bytes: kosit('standard/01.01a-INVOICE_ubl.xml') }])
    let beleg: Beleg | undefined
    for (let i = 0; i < 200 && !beleg; i++) {
      await new Promise((ok) => setTimeout(ok, 10))
      beleg = s.d.belege.liste()[0]
    }
    expect(beleg).toMatchObject({ status: 'eingegangen', pruefung: null })
    const r = await s.anfrage(`/api/belege/${beleg!.id}/ablehnen`, s.json({ grund: 'keine Rechnung' }))
    expect(r.status).toBe(409)
    expect(((await r.json()) as { fehler: { code: string } }).fehler.code).toBe('PRUEFUNG-LAEUFT')
    weiter()
    expect((await upload).status).toBe(201)
    expect(s.d.belege.hole(beleg!.id)!.status).toBe('geprueft')
    expect((await s.anfrage(`/api/belege/${beleg!.id}/ablehnen`, s.json({ grund: 'keine Rechnung' }))).status).toBe(200)
  })
})

describe('Erfassung von Hand gleichzeitig', () => {
  const hand = (nummer: string) => ({ lieferantName: 'Bäckerei Korn', lieferantUstId: null, lieferantSteuernummer: '21/815/08150', rechnungsnummer: nummer, rechnungsdatum: '2026-10-30', leistungsdatum: null, steuern: [{ kategorie: 'S', satz: '7', bemessungCent: 1000, steuerCent: 70 }], bruttoCent: 1070 })

  it('zweimal zugleich gespeichert: einmal 200, einmal 409; ein Bericht, Kette in Ordnung', async () => {
    const s = await bereit()
    const id = await hochladen(s, 'quittung.pdf', zugferd('pdf-ohne-xml.pdf'))
    const antworten = await Promise.all(['Q-1', 'Q-2'].map((n) => s.anfrage(`/api/belege/${id}/handerfassung`, s.json(hand(n), { method: 'PUT' }))))
    expect(antworten.map((r) => r.status).sort()).toEqual([200, 409])
    const d = await detail(s, id)
    expect(d.protokoll.filter((p) => p.aktion === 'pruefung')).toHaveLength(2) // Eingang und eine Erfassung
    expect(readdirSync(join(s.ordner, 'berichte', id)).sort()).toEqual(['1.json', '2.json'])
    await ketteInOrdnung(s)
  })

  it('mit veraltetem Stand: 409, der schon geschriebene Bericht wird verworfen, Kette in Ordnung', async () => {
    const s = await bereit()
    const id = await hochladen(s, 'quittung.pdf', zugferd('pdf-ohne-xml.pdf'))
    const veraltet = s.d.belege.hole(id)!
    expect((await s.anfrage(`/api/belege/${id}/handerfassung`, s.json(hand('Q-1'), { method: 'PUT' }))).status).toBe(200)
    const r = await erfasseVonHand(s.d, veraltet, hand('Q-2') as Parameters<typeof erfasseVonHand>[2], akteur(s))
    expect(r).toMatchObject({ ok: false, status: 409, code: 'GEAENDERT' })
    // Vorher blieb 3.json ohne Protokolleintrag liegen: „Datei ohne Protokolleintrag“ in der Kettenprüfung
    expect(readdirSync(join(s.ordner, 'berichte', id)).sort()).toEqual(['1.json', '2.json'])
    expect(s.d.belege.hole(id)!.handerfassung?.rechnungsnummer).toBe('Q-1')
    await ketteInOrdnung(s)
  })
})

describe('Übergabe, während sich ein Beleg ändert', () => {
  it('Rücknahme einer Freigabe während der Erzeugung: 409, kein Lauf, keine Dateien, Kette in Ordnung', async () => {
    const s = await bereit()
    // zwei Rechnungen aus dem Fallbeispiel, beide im Oktober 2026
    const a = await hochladen(s, '01.xml', fallbeispiel('01-01.01a-INVOICE_ubl.xml'))
    const b = await hochladen(s, '02.xml', fallbeispiel('02-01.02a-INVOICE_ubl.xml'))
    for (const id of [a, b]) {
      await kontiert(s, id)
      expect((await s.anfrage(`/api/belege/${id}/freigeben`, s.json({ inhaltGeprueft: true }))).status).toBe(200)
    }
    const monat = '2026-10'
    // Die Ansicht entsteht im Worker; währenddessen nimmt ein zweites Fenster eine Freigabe zurück
    const echt = s.d.pruefer.ansicht
    let einmal = true
    s.d.pruefer.ansicht = async (text, syntax) => {
      if (einmal) {
        einmal = false
        expect(nimmFreigabeZurueck(s.d, s.d.belege.hole(b)!, 'zweites Fenster', akteur(s)).ok).toBe(true)
      }
      return echt(text, syntax)
    }
    const r = await s.anfrage('/api/uebergaben', s.json({ monat }))
    expect(r.status).toBe(409)
    expect(((await r.json()) as { fehler: { code: string } }).fehler.code).toBe('GEAENDERT')
    // Vorher: Lauf mit dem zurückgenommenen Beleg, der danach als „exportiert“ mit alter Kontierung dastand
    expect(s.d.exporte.alle()).toEqual([])
    expect(readdirSync(join(s.ordner, 'exporte'), { recursive: true })).toEqual([])
    expect([s.d.belege.hole(a)!.status, s.d.belege.hole(b)!.status]).toEqual(['freigegeben', 'kontiert'])
    await ketteInOrdnung(s)
    // Neuer Versuch mit dem aktuellen Stand gelingt und nimmt nur den freigegebenen Beleg
    const neu = await s.anfrage('/api/uebergaben', s.json({ monat }))
    expect(neu.status).toBe(201)
    expect(((await neu.json()) as { lauf: { belegIds: string[] } }).lauf.belegIds).toEqual([a])
  })
})

describe('Benutzer gleichzeitig anlegen', () => {
  it('zwei „erste“ Benutzer zugleich: einer wird angelegt, der andere erhält 409', async () => {
    const s = testserver()
    server.push(s)
    const anlegen = (name: string) => s.anfrage('/api/einrichtung/benutzer', s.json({ anmeldename: name, name, passwort: 'sehr-geheim-123' }))
    const antworten = await Promise.all([anlegen('robin'), anlegen('mallory')])
    expect(antworten.map((r) => r.status).sort()).toEqual([201, 409])
    expect(s.d.benutzer.anzahl()).toBe(1)
  })
})
