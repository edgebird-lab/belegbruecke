/**
 * Belege: Upload, Liste, Detail mit Vorschlägen für den Assistenten, Dateien (Original, Bericht,
 * Ansicht) und die Assistentenschritte B3 bis B6 (Spezifikation 7.6).
 */
import type { Hono } from 'hono'
import { aufbewahrungText } from '../../fach/aufbewahrung.ts'
import { leseBetragEingabe } from '../../fach/betrag.ts'
import { belegnummer } from '../../fach/dubletten.ts'
import { begruendungNoetig, freigabeHindernisse, vorsteuerGefaehrdet } from '../../fach/freigabe.ts'
import { ansichtHtml, letzterBericht } from '../dienste/ansicht.ts'
import {
  entscheideDublette,
  erfasseVonHand,
  gibFrei,
  hebeAblehnungAuf,
  kontierungsvorschlag,
  kontiere,
  kreditorVorschlag,
  lehneAb,
  lieferantenvorschlag,
  nimmFreigabeZurueck,
  ordneLieferantZu,
} from '../dienste/belegschritte.ts'
import { nimmAn } from '../dienste/eingang.ts'
import type { Dienste } from '../dienste/kontext.ts'
import { ANSICHT_CSP, fehler, type Umgebung } from '../sicherheit/middleware.ts'
import { akteurVon, anhangKopf, belegZusammenfassung, ladeBeleg, leseJson, schrittAntwort } from './hilfen.ts'
import { ablehnungSchema, belegfilterSchema, dubletteSchema, freigabeSchema, handerfassungSchema, kontierungSchema, ruecknahmeSchema, zodText, zuordnungSchema } from './schemata.ts'

/** CSP für PDF und Bilder in der Anzeige: nichts nachladen, nur in der eigenen Oberfläche einbetten. */
const ANZEIGE_CSP = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'"

export function registriereBelege(app: Hono<Umgebung>, d: Dienste): void {
  app.get('/api/zaehler', (c) => c.json(d.belege.zaehler()))

  app.post('/api/belege', async (c) => {
    let dateien: File[]
    try {
      const body = await c.req.parseBody({ all: true })
      const roh = body['dateien']
      dateien = (Array.isArray(roh) ? roh : roh === undefined ? [] : [roh]).filter((f): f is File => typeof f !== 'string')
    } catch {
      return fehler(c, 400, 'EINGABE', 'Erwartet wird ein Formular (multipart/form-data) mit dem Feld „dateien“.')
    }
    if (dateien.length === 0) return fehler(c, 400, 'EINGABE', 'Es wurde keine Datei übertragen (Feld „dateien“).')
    const ergebnisse = []
    for (const f of dateien) {
      ergebnisse.push(await nimmAn(d, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, { art: 'upload', benutzerId: c.get('benutzer')!.id }, akteurVon(c)))
    }
    return c.json({ ergebnisse }, 201)
  })

  app.get('/api/belege', (c) => {
    const f = belegfilterSchema.safeParse(c.req.query())
    if (!f.success) return fehler(c, 400, 'EINGABE', zodText(f.error))
    const { betrag, offen, ...rest } = f.data
    let bruttoCent: number | undefined
    if (betrag) {
      const cent = leseBetragEingabe(betrag)
      if (cent === null) return fehler(c, 400, 'EINGABE', `„${betrag}“ ist kein Betrag. Beispiel: 336,90`)
      bruttoCent = Math.abs(cent)
    }
    return c.json({ belege: d.belege.liste({ ...rest, offen: offen === '1', bruttoCent }).map(belegZusammenfassung) })
  })

  app.get('/api/belege/:id', (c) => {
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    const lieferant = b.lieferantId ? d.lieferanten.hole(b.lieferantId) : null
    const vorschlag = lieferantenvorschlag(d, b)
    return c.json({
      beleg: b,
      zusammenfassung: belegZusammenfassung(b),
      aufbewahrung: aufbewahrungText(b.aufbewahrenBis),
      protokoll: d.protokoll.fuerBeleg(b.id),
      lieferant,
      lieferantenvorschlag: vorschlag,
      kreditorVorschlag: kreditorVorschlag(d, lieferant ?? vorschlag?.vorhanden ?? null),
      kontierungsvorschlag: kontierungsvorschlag(d, b),
      freigabe: { hindernisse: freigabeHindernisse(b), begruendungNoetig: begruendungNoetig(b), vorsteuerGefaehrdet: vorsteuerGefaehrdet(b) },
      dublettenVergleich: b.dubletten.map((h) => {
        const anderer = d.belege.hole(h.andererBelegId)
        return { hinweis: h, anderer: anderer ? belegZusammenfassung(anderer) : null }
      }),
      exportlauf: b.exportlaufId ? d.exporte.hole(b.exportlaufId) : null,
    })
  })

  app.get('/api/belege/:id/original', async (c) => {
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    const bytes = await d.ablage.lies(b.original.speicherpfad)
    // Anzeige im Browser nur für PDF und Bilder; XML immer als Download (ein Stylesheet könnte Skripte ausführen)
    const anzeige = c.req.query('anzeige') === '1' && b.original.mimeTyp !== 'application/xml'
    const kopf: Record<string, string> = { 'Content-Type': b.original.mimeTyp, 'Content-Disposition': anhangKopf(b.original.dateiname, anzeige) }
    if (anzeige) kopf['Content-Security-Policy'] = ANZEIGE_CSP
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, kopf)
  })

  app.get('/api/belege/:id/bericht', async (c) => {
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    const pfad = letzterBericht(d, b.id)
    if (!pfad) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Für diesen Beleg gibt es noch keinen Prüfbericht.')
    const bytes = await d.ablage.lies(pfad)
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': anhangKopf(`Pruefbericht_${belegnummer(b.laufnummer)}.json`) })
  })

  app.get('/api/belege/:id/ansicht', async (c) => {
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    const html = await ansichtHtml(d, b)
    if (html === null) return fehler(c, 404, 'KEINE-ANSICHT', 'Für diesen Beleg gibt es keine Ansicht der E-Rechnung (kein lesbares XML).')
    return c.body(html, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ANSICHT_CSP })
  })

  // ---------- Assistentenschritte ----------
  // Bei allen Schritten zuerst den Körper lesen (das wartet) und erst danach den Beleg laden: Zwischen
  // Laden und Schritt liegt so kein await, und eine zweite gleichzeitige Anfrage (Doppelklick, zweites
  // Fenster) sieht schon den neuen Stand, etwa „Der Beleg ist freigegeben“.
  app.post('/api/belege/:id/dublette', async (c) => {
    const e = await leseJson(c, dubletteSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, entscheideDublette(d, b, e.daten.ergebnis, akteurVon(c)))
  })

  app.put('/api/belege/:id/lieferant', async (c) => {
    const e = await leseJson(c, zuordnungSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, ordneLieferantZu(d, b, { ...e.daten, lieferantId: e.daten.lieferantId?.toUpperCase() }, akteurVon(c)))
  })

  app.put('/api/belege/:id/kontierung', async (c) => {
    const e = await leseJson(c, kontierungSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, kontiere(d, b, e.daten.zeilen, akteurVon(c)))
  })

  app.put('/api/belege/:id/handerfassung', async (c) => {
    const e = await leseJson(c, handerfassungSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, await erfasseVonHand(d, b, e.daten, akteurVon(c)))
  })

  app.post('/api/belege/:id/freigeben', async (c) => {
    const e = await leseJson(c, freigabeSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, gibFrei(d, b, { inhaltGeprueft: e.daten.inhaltGeprueft, begruendung: e.daten.begruendung ?? null }, akteurVon(c)))
  })

  app.post('/api/belege/:id/ablehnen', async (c) => {
    const e = await leseJson(c, ablehnungSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, lehneAb(d, b, e.daten.grund, akteurVon(c)))
  })

  app.post('/api/belege/:id/freigabe-zuruecknehmen', async (c) => {
    const e = await leseJson(c, ruecknahmeSchema)
    if (e.fehler) return e.fehler
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, nimmFreigabeZurueck(d, b, e.daten.grund ?? null, akteurVon(c)))
  })

  app.post('/api/belege/:id/ablehnung-aufheben', (c) => {
    const b = ladeBeleg(d, c)
    if (b instanceof Response) return b
    return schrittAntwort(c, hebeAblehnungAuf(d, b, akteurVon(c)))
  })
}
