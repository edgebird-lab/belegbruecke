/**
 * HTTP-API der Belegbrücke (Spezifikation 7.6) mit Hono; Eingaben mit zod geprüft, Fehler mit
 * deutschem Text und Code. Im Betrieb liefert derselbe Server die gebaute Oberfläche aus.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, relative, sep } from 'node:path'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { einstellungsAenderungen } from '../fach/einstellungen.ts'
import type { Benutzer, Einstellungen } from '../fach/typen.ts'
import { artefaktversionen } from '../pruefung/artefakte.ts'
import { registriereBelege } from './api/belege.ts'
import { registrierePostfach } from './api/postfach.ts'
import { anmeldungSchema, einstellungenSchema, kettenpruefungSchema, neuerBenutzerSchema, zodText } from './api/schemata.ts'
import { registriereStammdaten } from './api/stammdaten.ts'
import { registriereUebergabe } from './api/uebergabe.ts'
import { pruefeArchiv, kettenberichtText } from './dienste/kette.ts'
import type { Dienste } from './dienste/kontext.ts'
import { fehler, ipAdresse, kopfzeilen, schutz, type Umgebung } from './sicherheit/middleware.ts'
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

/** Einstellungen für die Oberfläche: Postfach-Passwort nie herausgeben (Spezifikation 7.6). */
function einstellungenFuerAusgabe(e: Einstellungen) {
  return { ...e, postfach: { ...e.postfach, passwortVerschluesselt: '' }, passwortGesetzt: e.postfach.passwortVerschluesselt !== '' }
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
    // scrypt dauert; eine gleichzeitige zweite Anfrage darf in der Zwischenzeit keinen zweiten „ersten“ Benutzer anlegen
    const angelegt = d.db.transaktion(() => {
      if (d.benutzer.anzahl() > 0) return false
      d.benutzer.anlegen(b)
      d.protokoll.anhaengen({ akteur: { art: 'benutzer', id: b.id }, aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'benutzer', neu: { anmeldename: b.anmeldename, name: b.name } } })
      return true
    })
    if (!angelegt) return fehler(c, 409, 'SCHON-EINGERICHTET', 'Es gibt bereits einen Benutzer. Bitte melden Sie sich an.')
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
    // Nach dem Warten auf scrypt erneut prüfen: Höchstzahl und Name können inzwischen vergeben sein
    const ergebnis = d.db.transaktion(() => {
      if (d.benutzer.anzahl() >= MAX_BENUTZER) return 'zu-viele' as const
      if (d.benutzer.nachName(b.anmeldename)) return 'vergeben' as const
      d.benutzer.anlegen(b)
      d.protokoll.anhaengen({ akteur: akteur(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'benutzer', neu: { anmeldename: b.anmeldename, name: b.name } } })
      return 'ok' as const
    })
    if (ergebnis === 'zu-viele') return fehler(c, 409, 'ZU-VIELE-BENUTZER', `Version 0.1 erlaubt höchstens ${MAX_BENUTZER} Benutzer.`)
    if (ergebnis === 'vergeben') return fehler(c, 409, 'NAME-VERGEBEN', 'Dieser Anmeldename ist vergeben.')
    return c.json({ benutzer: oeffentlicherBenutzer(b) }, 201)
  })

  app.get('/api/benutzer', (c) => c.json({ benutzer: d.benutzer.alle().map(oeffentlicherBenutzer), hoechstens: MAX_BENUTZER }))

  // Angaben für Einrichtung (E5) und Einstellungen; nur angemeldet, weil sie den Datenordner nennen
  app.get('/api/system', (c) => c.json({ version: d.version, datenOrdner: d.datenOrdner, artefakte: artefaktversionen() }))

  // ---------- Einstellungen ----------
  app.get('/api/einstellungen', (c) => c.json(einstellungenFuerAusgabe(d.einstellungen.lies())))

  app.put('/api/einstellungen', async (c) => {
    const e = await json(c, einstellungenSchema)
    if (e.fehler) return e.fehler
    const alt = d.einstellungen.lies()
    // Das Passwort ist nur über den Postfach-Schritt schreibbar (Phase 5); hier bleibt es unverändert
    const neu: Einstellungen = { ...(e.daten as Einstellungen), postfach: { ...(e.daten as Einstellungen).postfach, passwortVerschluesselt: alt.postfach.passwortVerschluesselt } }
    // Abschluss der Einrichtung (E5): Zeitpunkt nach der Uhr des Servers, danach unveränderlich
    neu.eingerichtetAm = alt.eingerichtetAm ?? (neu.eingerichtetAm ? d.uhr().toISOString() : null)
    const aenderungen = einstellungsAenderungen(alt, neu)
    if (aenderungen.length) {
      d.db.transaktion(() => {
        d.einstellungen.schreibe(neu, d.uhr().toISOString())
        d.protokoll.anhaengen({ akteur: akteur(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'einstellungen', aenderungen: aenderungen as unknown as Record<string, unknown>[] } })
      })
    }
    return c.json(einstellungenFuerAusgabe(neu))
  })

  registriereBelege(app, d)
  registriereStammdaten(app, d)
  registriereUebergabe(app, d)
  registrierePostfach(app, d)

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
