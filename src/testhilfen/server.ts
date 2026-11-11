/** Server für Tests: temporärer Datenordner, Prüfung im Prozess, steuerbare Uhr, Cookie-Verwaltung. */
import { chmodSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lokalerAusfuehrer } from '../pruefung/eingang.ts'
import { ansicht } from '../pruefung/extraktion.ts'
import { erzeugeApp } from '../server/app.ts'
import { erzeugeDienste, type Dienste } from '../server/dienste/kontext.ts'

export const BASIS = 'http://127.0.0.1:8784'
export const PASSWORT = 'sehr-geheim-123'

export interface Anfrageoptionen extends RequestInit {
  /** ohne Pflicht-Kopfzeile X-Belegbruecke */
  ohneCsrf?: boolean
  origin?: string | null
  basis?: string
}

export function testserver(start = '2026-11-11T09:30:00.000Z') {
  const ordner = mkdtempSync(join(tmpdir(), 'bb-server-'))
  let jetzt = new Date(start).getTime()
  const uhr = () => new Date(jetzt)
  const d: Dienste = erzeugeDienste({ datenOrdner: ordner, port: 8784, uhr, version: '0.0.1', pruefer: { ...lokalerAusfuehrer, ansicht: async (t, s) => ansicht(t, s) } })
  const app = erzeugeApp(d)
  let cookie = ''

  async function anfrage(pfad: string, o: Anfrageoptionen = {}): Promise<Response> {
    const methode = (o.method ?? 'GET').toUpperCase()
    const kopf = new Headers(o.headers)
    if (cookie) kopf.set('cookie', cookie)
    if (methode !== 'GET' && methode !== 'HEAD') {
      if (!o.ohneCsrf) kopf.set('x-belegbruecke', '1')
      if (o.origin !== null) kopf.set('origin', o.origin ?? BASIS)
    }
    const antwort = await app.request(`${o.basis ?? BASIS}${pfad}`, { ...o, headers: kopf })
    const gesetzt = antwort.headers.get('set-cookie')
    if (gesetzt) cookie = /Max-Age=0/i.test(gesetzt) ? '' : gesetzt.split(';')[0]
    return antwort
  }

  const json = (daten: unknown, o: Anfrageoptionen = {}): Anfrageoptionen => ({ method: 'POST', ...o, headers: { 'content-type': 'application/json', ...(o.headers as Record<string, string>) }, body: JSON.stringify(daten) })

  async function einrichten(anmeldename = 'robin') {
    const r = await anfrage('/api/einrichtung/benutzer', json({ anmeldename, name: 'Robin', passwort: PASSWORT }))
    if (r.status !== 201) throw new Error(`Einrichtung fehlgeschlagen: ${r.status} ${await r.text()}`)
  }

  async function hochladen(dateien: { name: string; bytes: Uint8Array; typ?: string }[]) {
    const fd = new FormData()
    for (const f of dateien) fd.append('dateien', new File([f.bytes as Uint8Array<ArrayBuffer>], f.name, { type: f.typ ?? 'application/octet-stream' }))
    return anfrage('/api/belege', { method: 'POST', body: fd })
  }

  function aufraeumen() {
    d.db.schliessen()
    for (const e of readdirSync(ordner, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
    rmSync(ordner, { recursive: true, force: true })
  }

  return {
    d,
    app,
    ordner,
    anfrage,
    json,
    einrichten,
    hochladen,
    aufraeumen,
    vorspulen: (ms: number) => {
      jetzt += ms
    },
    abmeldenLokal: () => {
      cookie = ''
    },
  }
}
