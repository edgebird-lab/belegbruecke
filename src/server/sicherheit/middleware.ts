/**
 * Schutzschicht des Servers (Spezifikation 8): Host-Prüfung gegen DNS-Rebinding (421),
 * Origin-Prüfung und Pflicht-Kopfzeile X-Belegbruecke bei ändernden Anfragen (403),
 * Sitzungspflicht für die API (401), Sicherheitsheader auf jeder Antwort.
 */
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import type { Benutzer } from '../../fach/typen.ts'
import type { Dienste } from '../dienste/kontext.ts'
import { COOKIE } from './sitzungen.ts'

export type Umgebung = { Variables: { benutzer: Benutzer | null } }

export const APP_CSP = "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
export const ANSICHT_CSP = "sandbox allow-scripts allow-downloads; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'"

export function fehler(c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 421 | 429 | 500, code: string, text: string) {
  return c.json({ fehler: { code, text } }, status)
}

const AENDERND = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Öffentliche API-Pfade; alle anderen unter /api verlangen eine Sitzung. */
const OEFFENTLICH = new Set(['GET /api/status', 'GET /api/sitzung', 'POST /api/anmelden', 'POST /api/einrichtung/benutzer'])

export function ipAdresse(c: Context): string | null {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined
  return env?.incoming?.socket?.remoteAddress ?? null
}

export function schutz(d: Dienste): MiddlewareHandler<Umgebung> {
  const ursprunge = new Set(d.erlaubteHosts.flatMap((h) => [`http://${h}`, `https://${h}`]))
  return async (c, next) => {
    const url = new URL(c.req.url)
    if (!d.erlaubteHosts.includes(url.host)) {
      return fehler(c, 421, 'HOST-UNGUELTIG', `Der Server antwortet nur unter ${d.erlaubteHosts.join(' oder ')}.`)
    }
    if (AENDERND.has(c.req.method)) {
      const origin = c.req.header('origin')
      if (!origin || !ursprunge.has(origin)) return fehler(c, 403, 'URSPRUNG-UNGUELTIG', 'Ändernde Anfragen sind nur von der Oberfläche der Belegbrücke erlaubt.')
      if (c.req.header('x-belegbruecke') !== '1') return fehler(c, 403, 'CSRF', 'Die Anfrage kommt nicht von der Oberfläche der Belegbrücke (Kopfzeile X-Belegbruecke fehlt).')
    }
    const benutzerId = d.sitzungen.pruefen(getCookie(c, COOKIE))
    const benutzer = benutzerId ? d.benutzer.nachId(benutzerId) : null
    c.set('benutzer', benutzer && benutzer.aktiv ? benutzer : null)
    if (url.pathname.startsWith('/api/') && !OEFFENTLICH.has(`${c.req.method} ${url.pathname}`) && !c.get('benutzer')) {
      return fehler(c, 401, 'NICHT-ANGEMELDET', 'Bitte melden Sie sich an.')
    }
    await next()
  }
}

/** Sicherheitsheader; eine Route kann eine eigene CSP setzen (Ansicht). */
export const kopfzeilen: MiddlewareHandler = async (c, next) => {
  await next()
  const h = c.res.headers
  if (!h.has('Content-Security-Policy')) h.set('Content-Security-Policy', APP_CSP)
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'no-referrer')
  if (c.req.path.startsWith('/api/')) h.set('Cache-Control', 'no-store')
}
