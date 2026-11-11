/**
 * HTTP-API der Belegbrücke (Spezifikation 7.6) mit Hono; Eingaben mit zod geprüft, Fehler mit
 * deutschem Text und Code. Im Betrieb liefert derselbe Server die gebaute Oberfläche aus.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize, relative, sep } from 'node:path'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { aufbewahrungText } from '../fach/aufbewahrung.ts'
import { belegnummer } from '../fach/dubletten.ts'
import { einstellungsAenderungen } from '../fach/einstellungen.ts'
import { formatBezeichnung } from '../fach/formaterkennung.ts'
import { ampel } from '../fach/pruefbericht.ts'
import type { Beleg, Benutzer, Einstellungen } from '../fach/typen.ts'
import { dekodiereXml } from '../fach/zeichensatz.ts'
import { artefaktversionen } from '../pruefung/artefakte.ts'
import { anmeldungSchema, belegfilterSchema, einstellungenSchema, kettenpruefungSchema, neuerBenutzerSchema, zodText } from './api/schemata.ts'
import { nimmAn } from './dienste/eingang.ts'
import { pruefeArchiv, kettenberichtText } from './dienste/kette.ts'
import type { Dienste } from './dienste/kontext.ts'
import { ANSICHT_CSP, fehler, ipAdresse, kopfzeilen, schutz, type Umgebung } from './sicherheit/middleware.ts'
import { ATTRAPPE, hashePasswort, pruefePasswort } from './sicherheit/passwort.ts'
import { Anmeldesperre, COOKIE, LEERLAUF_MS } from './sicherheit/sitzungen.ts'

export const MAX_BENUTZER = 3

export interface Appoptionen {
  /** Ordner der gebauten Oberfläche (dist); null = nur API */
  oberflaeche?: string | null
}

function oeffentlicherBenutzer(b: Benutzer) {
  return { id: b.id, anmeldename: b.anmeldename, name: b.name }
}

function belegZusammenfassung(b: Beleg) {
  const d = b.daten
  return {
    id: b.id,
    laufnummer: b.laufnummer,
    belegnummer: belegnummer(b.laufnummer),
    status: b.status,
    eingangAm: b.eingangAm,
    dateiname: b.original.dateiname,
    format: formatBezeichnung(b.format),
    belegart: b.format.belegart,
    lieferant: b.handerfassung?.lieferantName ?? (d ? (d.typcode === '389' ? d.kaeufer.name : d.verkaeufer.name) : null),
    rechnungsnummer: b.handerfassung?.rechnungsnummer ?? d?.rechnungsnummer ?? null,
    rechnungsdatum: b.handerfassung?.rechnungsdatum ?? d?.rechnungsdatum ?? null,
    bruttoCent: b.handerfassung?.bruttoCent ?? d?.summen.bruttoCent ?? null,
    waehrung: d?.waehrung ?? 'EUR',
    ampel: ampel(b.format, b.pruefung),
    dubletten: b.dubletten.length,
    aufbewahrenBis: b.aufbewahrenBis,
  }
}

/** Einstellungen für die Oberfläche: Postfach-Passwort nie herausgeben (Spezifikation 7.6). */
function einstellungenFuerAusgabe(e: Einstellungen) {
  return { ...e, postfach: { ...e.postfach, passwortVerschluesselt: '' }, passwortGesetzt: e.postfach.passwortVerschluesselt !== '' }
}

function anhangKopf(dateiname: string): string {
  const ascii = dateiname.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

export function erzeugeApp(d: Dienste, optionen: Appoptionen = {}): Hono<Umgebung> {
  const app = new Hono<Umgebung>()
  app.use('*', kopfzeilen)
  app.use('*', schutz(d))
  app.use('/api/*', bodyLimit({ maxSize: 120 * 1024 * 1024, onError: (c) => fehler(c, 413, 'ZU-GROSS', 'Die Anfrage ist zu groß (höchstens 120 MB je Upload).') }))
  app.onError((e, c) => {
    console.error(e)
    return fehler(c, 500, 'INTERN', 'Interner Fehler. Details stehen in der Konsole des Servers.')
  })

  const akteur = (c: Context<Umgebung>) => ({ art: 'benutzer' as const, id: c.get('benutzer')!.id })
  const setzeSitzung = (c: Context, benutzerId: string) => {
    setCookie(c, COOKIE, d.sitzungen.oeffnen(benutzerId), { httpOnly: true, sameSite: 'Strict', secure: d.https, path: '/', maxAge: Math.floor(LEERLAUF_MS / 1000) })
  }
  async function json<T>(c: Context, schema: { safeParse(x: unknown): { success: true; data: T } | { success: false; error: import('zod').ZodError } }) {
    let roh: unknown
    try {
      roh = await c.req.json()
    } catch {
      return { fehler: fehler(c, 400, 'EINGABE', 'Die Anfrage enthält kein gültiges JSON.') }
    }
    const r = schema.safeParse(roh)
    return r.success ? { daten: r.data } : { fehler: fehler(c, 400, 'EINGABE', zodText(r.error)) }
  }

  // ---------- Status und Sitzung ----------
  app.get('/api/status', (c) => c.json({ version: d.version, artefakte: artefaktversionen(), einrichtungNoetig: d.benutzer.anzahl() === 0 }))

  app.get('/api/sitzung', (c) => {
    const b = c.get('benutzer')
    return c.json({ angemeldet: !!b, benutzer: b ? oeffentlicherBenutzer(b) : null, einrichtungNoetig: d.benutzer.anzahl() === 0 })
  })

  app.post('/api/einrichtung/benutzer', async (c) => {
    if (d.benutzer.anzahl() > 0) return fehler(c, 409, 'SCHON-EINGERICHTET', 'Es gibt bereits einen Benutzer. Bitte melden Sie sich an.')
    const e = await json(c, neuerBenutzerSchema)
    if (e.fehler) return e.fehler
    const b: Benutzer = { id: randomUUID().toUpperCase(), anmeldename: e.daten.anmeldename, name: e.daten.name, passwortHash: await hashePasswort(e.daten.passwort), aktiv: true, angelegtAm: d.uhr().toISOString() }
    d.db.transaktion(() => {
      d.benutzer.anlegen(b)
      d.protokoll.anhaengen({ akteur: { art: 'benutzer', id: b.id }, aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'benutzer', neu: { anmeldename: b.anmeldename, name: b.name } } })
    })
    d.sicherheitslog('benutzer-angelegt', { anmeldename: b.anmeldename, ip: ipAdresse(c) })
    setzeSitzung(c, b.id)
    return c.json({ benutzer: oeffentlicherBenutzer(b) }, 201)
  })

  app.post('/api/anmelden', async (c) => {
    const e = await json(c, anmeldungSchema)
    if (e.fehler) return e.fehler
    const { anmeldename, passwort } = e.daten
    const ip = ipAdresse(c)
    const sperre = d.sperre.gesperrtFuer(anmeldename)
    if (sperre > 0) {
      d.sicherheitslog('anmeldung-gesperrt', { anmeldename, ip })
      return fehler(c, 429, 'GESPERRT', `Zu viele Fehlversuche. Die Anmeldung ist noch ${Math.ceil(sperre / 60000)} Minuten gesperrt.`)
    }
    const b = d.benutzer.nachName(anmeldename)
    // Auch für unbekannte Namen rechnen, damit die Antwortzeit nichts verrät
    const richtig = await pruefePasswort(passwort, b?.passwortHash ?? ATTRAPPE)
    if (!b || !b.aktiv || !richtig) {
      d.sperre.fehlversuch(anmeldename)
      d.sicherheitslog('anmeldung-fehlgeschlagen', { anmeldename, ip })
      return fehler(c, 401, 'ANMELDUNG-FALSCH', `Anmeldename oder Passwort falsch. Nach ${Anmeldesperre.VERSUCHE} Fehlversuchen wird die Anmeldung für 15 Minuten gesperrt.`)
    }
    d.sperre.erfolg(anmeldename)
    d.sicherheitslog('anmeldung', { anmeldename, ip })
    setzeSitzung(c, b.id)
    return c.json({ benutzer: oeffentlicherBenutzer(b) })
  })

  app.post('/api/abmelden', (c) => {
    d.sitzungen.schliessen(getCookie(c, COOKIE))
    deleteCookie(c, COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  app.post('/api/benutzer', async (c) => {
    if (d.benutzer.anzahl() >= MAX_BENUTZER) return fehler(c, 409, 'ZU-VIELE-BENUTZER', `Version 0.1 erlaubt höchstens ${MAX_BENUTZER} Benutzer.`)
    const e = await json(c, neuerBenutzerSchema)
    if (e.fehler) return e.fehler
    if (d.benutzer.nachName(e.daten.anmeldename)) return fehler(c, 409, 'NAME-VERGEBEN', 'Dieser Anmeldename ist vergeben.')
    const b: Benutzer = { id: randomUUID().toUpperCase(), anmeldename: e.daten.anmeldename, name: e.daten.name, passwortHash: await hashePasswort(e.daten.passwort), aktiv: true, angelegtAm: d.uhr().toISOString() }
    d.db.transaktion(() => {
      d.benutzer.anlegen(b)
      d.protokoll.anhaengen({ akteur: akteur(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'benutzer', neu: { anmeldename: b.anmeldename, name: b.name } } })
    })
    return c.json({ benutzer: oeffentlicherBenutzer(b) }, 201)
  })

  // ---------- Einstellungen ----------
  app.get('/api/einstellungen', (c) => c.json(einstellungenFuerAusgabe(d.einstellungen.lies())))

  app.put('/api/einstellungen', async (c) => {
    const e = await json(c, einstellungenSchema)
    if (e.fehler) return e.fehler
    const alt = d.einstellungen.lies()
    // Das Passwort ist nur über den Postfach-Schritt schreibbar (Phase 5); hier bleibt es unverändert
    const neu: Einstellungen = { ...(e.daten as Einstellungen), postfach: { ...(e.daten as Einstellungen).postfach, passwortVerschluesselt: alt.postfach.passwortVerschluesselt } }
    const aenderungen = einstellungsAenderungen(alt, neu)
    if (aenderungen.length) {
      d.db.transaktion(() => {
        d.einstellungen.schreibe(neu, d.uhr().toISOString())
        d.protokoll.anhaengen({ akteur: akteur(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'einstellungen', aenderungen: aenderungen as unknown as Record<string, unknown>[] } })
      })
    }
    return c.json(einstellungenFuerAusgabe(neu))
  })

  // ---------- Belege ----------
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
      ergebnisse.push(await nimmAn(d, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }, { art: 'upload', benutzerId: c.get('benutzer')!.id }, akteur(c)))
    }
    return c.json({ ergebnisse }, 201)
  })

  app.get('/api/belege', (c) => {
    const f = belegfilterSchema.safeParse(c.req.query())
    if (!f.success) return fehler(c, 400, 'EINGABE', zodText(f.error))
    return c.json({ belege: d.belege.liste(f.data).map(belegZusammenfassung) })
  })

  const ladeBeleg = (c: Context<Umgebung>): Beleg | Response => {
    const id = c.req.param('id') ?? ''
    if (!/^[0-9A-F-]{36}$/i.test(id)) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Diesen Beleg gibt es nicht.')
    return d.belege.hole(id.toUpperCase()) ?? fehler(c, 404, 'NICHT-GEFUNDEN', 'Diesen Beleg gibt es nicht.')
  }

  app.get('/api/belege/:id', (c) => {
    const b = ladeBeleg(c)
    if (b instanceof Response) return b
    return c.json({ beleg: b, zusammenfassung: belegZusammenfassung(b), aufbewahrung: aufbewahrungText(b.aufbewahrenBis), protokoll: d.protokoll.fuerBeleg(b.id) })
  })

  app.get('/api/belege/:id/original', async (c) => {
    const b = ladeBeleg(c)
    if (b instanceof Response) return b
    const bytes = await d.ablage.lies(b.original.speicherpfad)
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': b.original.mimeTyp, 'Content-Disposition': anhangKopf(b.original.dateiname) })
  })

  app.get('/api/belege/:id/bericht', async (c) => {
    const b = ladeBeleg(c)
    if (b instanceof Response) return b
    const z = d.db.eins<{ pfad: string }>("SELECT pfad FROM dateien WHERE art = 'bericht' AND pfad LIKE ? ORDER BY angelegt_am DESC, pfad DESC LIMIT 1", [`berichte/${b.id}/%`])
    if (!z) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Für diesen Beleg gibt es noch keinen Prüfbericht.')
    const bytes = await d.ablage.lies(z.pfad)
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': anhangKopf(`Pruefbericht_${belegnummer(b.laufnummer)}.json`) })
  })

  app.get('/api/belege/:id/ansicht', async (c) => {
    const b = ladeBeleg(c)
    if (b instanceof Response) return b
    if (!b.format.syntax || !b.format.xmlSha256) return fehler(c, 404, 'KEINE-ANSICHT', 'Für diesen Beleg gibt es keine Ansicht der E-Rechnung (kein lesbares XML).')
    const cache = d.ablage.absolut(`cache/ansicht/${b.format.xmlSha256}.html`)
    let html: string
    if (existsSync(cache)) html = readFileSync(cache, 'utf8')
    else {
      let xml = await d.ablage.lies(b.original.speicherpfad)
      if (b.format.container === 'pdf-mit-xml') {
        const pdf = await d.pruefer.pdf(xml)
        if (pdf.art !== 'mit-xml') return fehler(c, 404, 'KEINE-ANSICHT', 'Das XML in der PDF ist nicht lesbar.')
        xml = pdf.xml
      }
      const text = dekodiereXml(xml)
      if (!text.ok) return fehler(c, 404, 'KEINE-ANSICHT', 'Das XML ist nicht lesbar.')
      html = await d.pruefer.ansicht(text.text, b.format.syntax)
      mkdirSync(dirname(cache), { recursive: true })
      writeFileSync(cache, html)
    }
    return c.body(html, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ANSICHT_CSP })
  })

  // ---------- Archiv ----------
  app.post('/api/archiv/pruefen', async (c) => {
    const e = await json(c, kettenpruefungSchema)
    if (e.fehler) return e.fehler
    const bericht = await pruefeArchiv(d.db, d.ablage, d.protokoll, { anker: e.daten.anker ?? [], akteur: akteur(c) })
    return c.json({ bericht, text: kettenberichtText(bericht) })
  })

  app.all('/api/*', (c) => fehler(c, 404, 'NICHT-GEFUNDEN', 'Diese Schnittstelle gibt es nicht.'))

  // ---------- Oberfläche ----------
  const ui = optionen.oberflaeche
  if (ui && existsSync(join(ui, 'index.html'))) {
    app.get('*', (c) => {
      let pfad: string
      try {
        pfad = decodeURIComponent(new URL(c.req.url).pathname)
      } catch {
        pfad = '/'
      }
      const datei = normalize(join(ui, pfad))
      const rel = relative(ui, datei)
      const innen = rel !== '' && !rel.startsWith('..') && !rel.includes(`..${sep}`)
      const ziel = innen && existsSync(datei) && statSync(datei).isFile() ? datei : join(ui, 'index.html')
      const typ = MIME[extname(ziel)] ?? 'application/octet-stream'
      const cache = ziel.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
      return c.body(readFileSync(ziel), 200, { 'Content-Type': typ, 'Cache-Control': cache })
    })
  }
  return app
}
