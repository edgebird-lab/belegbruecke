/**
 * Programmtor für das Windows-Programm (Spezifikation 7.8, Weg A). Im Programm lauscht der Server
 * auf einem zufälligen Port von 127.0.0.1; dort könnten ihn auch andere Programme und andere
 * Benutzer desselben Rechners erreichen. Das Tor lässt deshalb nur das Fenster der Tauri-Hülle durch:
 *
 * 1. Der Server erzeugt beim Start ein Einmal-Token und gibt es nur über die Pipe an die Hülle.
 * 2. Die Hülle öffnet einmal `/programm/start?token=…`. Der Server tauscht das Token gegen ein
 *    Cookie mit einem zweiten Zufallswert (HttpOnly, SameSite=Strict) und vergisst das Token.
 * 3. Jede andere Anfrage ohne dieses Cookie, auch an die Oberfläche und an die öffentlichen
 *    API-Pfade, beantwortet der Server mit 403.
 *
 * Anmeldung, CSRF-, Host- und Origin-Schutz (middleware.ts) gelten dahinter unverändert. Verglichen
 * wird über SHA-256 in konstanter Zeit; gespeichert sind nur die Hashes.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

export const PROGRAMM_COOKIE = 'bb_programm'
export const PROGRAMM_START = '/programm/start'

const hash = (wert: string) => createHash('sha256').update(wert, 'utf8').digest()

function gleich(wert: string | undefined, erwartet: Buffer): boolean {
  if (!wert) return false
  return timingSafeEqual(hash(wert), erwartet)
}

function verweigert(c: Context) {
  c.header('Cache-Control', 'no-store')
  const text = 'Die Belegbrücke ist nur über ihr Programmfenster erreichbar.'
  if (c.req.path.startsWith('/api/')) return c.json({ fehler: { code: 'NUR-PROGRAMM', text } }, 403)
  return c.text(text, 403)
}

export interface Programmtor {
  /** Einmal-Token für /programm/start (64 Hexzeichen); nur für die Hülle bestimmt */
  token: string
  /** true, solange das Token noch nicht eingelöst ist */
  offen(): boolean
  middleware: MiddlewareHandler
}

export function erzeugeProgrammtor(): Programmtor {
  const token = randomBytes(32).toString('hex')
  const cookieWert = randomBytes(32).toString('base64url')
  let tokenHash: Buffer | null = hash(token)
  const cookieHash = hash(cookieWert)

  const middleware: MiddlewareHandler = async (c, next) => {
    if (c.req.path === PROGRAMM_START) {
      if (c.req.method !== 'GET' || !tokenHash || !gleich(c.req.query('token'), tokenHash)) return verweigert(c)
      tokenHash = null
      setCookie(c, PROGRAMM_COOKIE, cookieWert, { httpOnly: true, sameSite: 'Strict', path: '/' })
      c.header('Cache-Control', 'no-store')
      return c.redirect('/', 303)
    }
    if (!gleich(getCookie(c, PROGRAMM_COOKIE), cookieHash)) return verweigert(c)
    await next()
  }

  return { token, offen: () => tokenHash !== null, middleware }
}
