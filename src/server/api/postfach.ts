/**
 * Postfach (Spezifikation 7.6): Status, Verbindungstest, Abruf auf Knopfdruck, Passwort nur schreibbar.
 * Das Passwort steht nie im Protokoll und nie im Klartext in der Datenbank (Spezifikation 8).
 */
import type { Hono } from 'hono'
import { z } from 'zod'
import type { Dienste } from '../dienste/kontext.ts'
import { fehler, type Umgebung } from '../sicherheit/middleware.ts'
import { akteurVon, leseJson } from './hilfen.ts'

const server = z
  .string()
  .trim()
  .min(1, 'Server fehlt')
  .max(253)
  .regex(/^[A-Za-z0-9.-]+$/, 'Servername nur aus Buchstaben, Ziffern, Punkt und Bindestrich')

const testSchema = z
  .object({
    server,
    port: z.number().int().min(1).max(65535),
    benutzer: z.string().trim().min(1, 'Benutzer fehlt').max(200),
    /** leer = gespeichertes Passwort verwenden */
    passwort: z.string().max(500).optional(),
    ordner: z.string().min(1).max(200),
  })
  .strict()

const passwortSchema = z.object({ passwort: z.string().min(1, 'Passwort fehlt').max(500) }).strict()

export function registrierePostfach(app: Hono<Umgebung>, d: Dienste): void {
  app.get('/api/postfach/status', (c) => c.json(d.postfach.status()))

  app.post('/api/postfach/test', async (c) => {
    const e = await leseJson(c, testSchema)
    if (e.fehler) return e.fehler
    let passwort = e.daten.passwort
    if (!passwort) {
      try {
        passwort = d.postfach.zugang()?.passwort
      } catch {
        passwort = undefined
      }
    }
    if (!passwort) return fehler(c, 400, 'PASSWORT-FEHLT', 'Bitte das Passwort des Postfachs eingeben.')
    const r = await d.postfach.teste({ server: e.daten.server, port: e.daten.port, benutzer: e.daten.benutzer, passwort }, e.daten.ordner)
    return c.json(r)
  })

  app.put('/api/postfach/passwort', async (c) => {
    const e = await leseJson(c, passwortSchema)
    if (e.fehler) return e.fehler
    const alt = d.einstellungen.lies()
    const neu = { ...alt, postfach: { ...alt.postfach, passwortVerschluesselt: d.postfach.verschluessele(e.daten.passwort) } }
    d.db.transaktion(() => {
      d.einstellungen.schreibe(neu, d.uhr().toISOString())
      // ohne Wert: nur, dass es geändert wurde
      d.protokoll.anhaengen({ akteur: akteurVon(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'postfach-passwort', aenderungen: [{ pfad: 'postfach.passwortVerschluesselt', alt: '(geändert)', neu: '(geändert)' }] } })
    })
    return c.json({ passwortGesetzt: true })
  })

  app.post('/api/postfach/abrufen', async (c) => {
    const bericht = await d.postfach.abrufen()
    return c.json({ bericht, status: d.postfach.status() })
  })
}
