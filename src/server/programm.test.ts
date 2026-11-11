/**
 * Windows-Programm (Schritt 7.3): Programmtor mit Einmal-Token und der Einstieg, den die Tauri-Hülle
 * als Sidecar startet (zufälliger Port, Bereit-Zeile, Ende mit stdin).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { request } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, describe, expect, it } from 'vitest'
import { lokalerAusfuehrer } from '../pruefung/eingang.ts'
import { erzeugeApp } from './app.ts'
import { erzeugeDienste } from './dienste/kontext.ts'
import { BEREIT } from './programm.ts'
import { erzeugeProgrammtor, PROGRAMM_COOKIE, PROGRAMM_START } from './sicherheit/programmtor.ts'

const ordner: string[] = []
const prozesse: ChildProcess[] = []
afterEach(() => {
  for (const p of prozesse.splice(0)) if (p.exitCode === null) p.kill()
  for (const o of ordner.splice(0)) rmSync(o, { recursive: true, force: true })
})

function neuerOrdner() {
  const o = mkdtempSync(join(tmpdir(), 'bb-programm-'))
  ordner.push(o)
  return o
}

describe('Programmtor', () => {
  function app() {
    const basis = neuerOrdner()
    const d = erzeugeDienste({ datenOrdner: join(basis, 'daten'), port: 8784, version: '0.0.1', pruefer: { ...lokalerAusfuehrer, ansicht: async () => '' }, schluesselDatei: join(basis, 'x.schluessel') })
    const tor = erzeugeProgrammtor()
    const a = erzeugeApp(d, { programmtor: tor.middleware })
    const anfrage = (pfad: string, o: RequestInit = {}) => a.request(pfad.startsWith('http') ? pfad : `http://127.0.0.1:8784${pfad}`, o)
    return { d, tor, anfrage }
  }

  it('lässt ohne Cookie nichts durch, auch nicht die öffentlichen Pfade', async () => {
    const { d, anfrage } = app()
    for (const pfad of ['/', '/index.html', '/api/status', '/api/sitzung']) {
      const r = await anfrage(pfad)
      expect(r.status, pfad).toBe(403)
      expect(r.headers.get('content-security-policy'), pfad).toBeTruthy()
    }
    const anmelden = await anfrage('/api/anmelden', { method: 'POST', headers: { 'content-type': 'application/json', 'x-belegbruecke': '1', origin: 'http://127.0.0.1:8784' }, body: '{"anmeldename":"robin","passwort":"x"}' })
    expect(anmelden.status).toBe(403)
    expect(await anmelden.json()).toMatchObject({ fehler: { code: 'NUR-PROGRAMM' } })
    // Ein abgewiesener Versuch zählt nicht als Fehlversuch der Anmeldung
    expect(d.sperre.gesperrtFuer('robin')).toBe(0)
    d.db.schliessen()
  })

  it('tauscht das Einmal-Token genau einmal gegen das Cookie', async () => {
    const { d, tor, anfrage } = app()
    expect(tor.token).toMatch(/^[0-9a-f]{64}$/)
    expect((await anfrage(`${PROGRAMM_START}?token=${'0'.repeat(64)}`)).status).toBe(403)
    expect((await anfrage(PROGRAMM_START)).status).toBe(403)
    expect((await anfrage(`${PROGRAMM_START}?token=${tor.token}`, { method: 'POST', headers: { 'x-belegbruecke': '1', origin: 'http://127.0.0.1:8784' } })).status).toBe(403)
    expect(tor.offen()).toBe(true)

    const r = await anfrage(`${PROGRAMM_START}?token=${tor.token}`)
    expect(r.status).toBe(303)
    expect(r.headers.get('location')).toBe('/')
    expect(r.headers.get('cache-control')).toBe('no-store')
    const gesetzt = r.headers.get('set-cookie')!
    expect(gesetzt).toMatch(new RegExp(`^${PROGRAMM_COOKIE}=[A-Za-z0-9_-]{43};`))
    expect(gesetzt).toContain('HttpOnly')
    expect(gesetzt).toContain('SameSite=Strict')
    expect(gesetzt).not.toMatch(/Max-Age|Expires/i)
    expect(tor.offen()).toBe(false)
    const cookie = gesetzt.split(';')[0]

    // Zweites Einlösen scheitert, auch mit Cookie wird kein neues ausgestellt
    const nochmal = await anfrage(`${PROGRAMM_START}?token=${tor.token}`, { headers: { cookie } })
    expect(nochmal.status).toBe(403)
    expect(nochmal.headers.get('set-cookie')).toBeNull()

    // Mit Cookie gelten die üblichen Regeln: Status offen, API mit Anmeldung, CSRF, Host
    expect((await anfrage('/api/status', { headers: { cookie } })).status).toBe(200)
    expect((await anfrage('/api/belege', { headers: { cookie } })).status).toBe(401)
    const ohneCsrf = await anfrage('/api/einrichtung/benutzer', { method: 'POST', headers: { cookie, 'content-type': 'application/json', origin: 'http://127.0.0.1:8784' }, body: '{}' })
    expect(ohneCsrf.status).toBe(403)
    expect((await anfrage('http://belegbruecke.example/api/status', { headers: { cookie } })).status).toBe(421)
    // Ein falscher Cookie-Wert gilt nicht
    expect((await anfrage('/api/status', { headers: { cookie: `${PROGRAMM_COOKIE}=${'A'.repeat(43)}` } })).status).toBe(403)
    d.db.schliessen()
  })

  it('erzeugt bei jedem Start neue Zufallswerte', () => {
    expect(erzeugeProgrammtor().token).not.toBe(erzeugeProgrammtor().token)
  })
})

describe('Einstieg des Programms (Sidecar)', () => {
  function roh(port: number, pfad: string, kopf: Record<string, string>) {
    return new Promise<number>((ok, fehler) => {
      const r = request({ host: '127.0.0.1', port, path: pfad, headers: kopf }, (res) => {
        res.resume()
        ok(res.statusCode ?? 0)
      })
      r.on('error', fehler)
      r.end()
    })
  }

  it('meldet Port und Token, schützt den Server und endet sauber, wenn stdin schließt', { timeout: 90_000 }, async () => {
    const basis = neuerOrdner()
    const p = spawn(process.execPath, [join(import.meta.dirname, 'programm.ts')], {
      env: { ...process.env, BB_DATEN: join(basis, 'daten'), BB_OBERFLAECHE: join(basis, 'keine-oberflaeche') },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    prozesse.push(p)
    let fehlerText = ''
    p.stderr!.on('data', (b: Buffer) => (fehlerText += b.toString()))
    const zeilen = createInterface({ input: p.stdout! })
    const bereit = await new Promise<string>((ok, fehler) => {
      zeilen.on('line', (z) => z.startsWith(BEREIT) && ok(z))
      p.once('exit', (code) => fehler(new Error(`Server beendet mit ${code}: ${fehlerText}`)))
    })
    const treffer = /^BELEGBRUECKE-BEREIT (\d+) ([0-9a-f]{64})$/.exec(bereit)
    expect(treffer).not.toBeNull()
    const port = Number(treffer![1])
    const basisUrl = `http://127.0.0.1:${port}`
    expect(port).not.toBe(8784)

    expect((await fetch(`${basisUrl}/api/status`)).status).toBe(403)
    const start = await fetch(`${basisUrl}${PROGRAMM_START}?token=${treffer![2]}`, { redirect: 'manual' })
    expect(start.status).toBe(303)
    const cookie = start.headers.get('set-cookie')!.split(';')[0]
    const status = await fetch(`${basisUrl}/api/status`, { headers: { cookie } })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ einrichtungNoetig: true })
    expect((await fetch(`${basisUrl}${PROGRAMM_START}?token=${treffer![2]}`, { redirect: 'manual' })).status).toBe(403)
    expect(await roh(port, '/api/status', { cookie, host: 'belegbruecke.example' })).toBe(421)
    expect(await roh(port, '/api/status', { cookie, host: `localhost:${port}` })).toBe(200)

    const ende = new Promise<number | null>((ok) => p.once('exit', (code) => ok(code)))
    p.stdin!.end()
    expect(await ende).toBe(0)
    await expect(fetch(`${basisUrl}/api/status`)).rejects.toThrow()
  })

  it('startet nicht ohne Datenordner', { timeout: 30_000 }, async () => {
    const env = { ...process.env }
    delete env.BB_DATEN
    const p = spawn(process.execPath, [join(import.meta.dirname, 'programm.ts')], { env, stdio: ['pipe', 'pipe', 'pipe'] })
    prozesse.push(p)
    let fehlerText = ''
    p.stderr!.on('data', (b: Buffer) => (fehlerText += b.toString()))
    const code = await new Promise<number | null>((ok) => p.once('exit', ok))
    expect(code).not.toBe(0)
    expect(fehlerText).toContain('BB_DATEN fehlt')
  })
})
