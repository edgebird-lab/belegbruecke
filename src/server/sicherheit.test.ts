import { request } from 'node:http'
import { mkdtempSync, rmSync, chmodSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { kosit } from '../testhilfen/dateien.ts'
import { PASSWORT, testserver } from '../testhilfen/server.ts'
import { hashePasswort, pruefePasswort } from './sicherheit/passwort.ts'
import { Sitzungen } from './sicherheit/sitzungen.ts'
import { starteServer } from './start.ts'

const server: ReturnType<typeof testserver>[] = []
function neu() {
  const s = testserver()
  server.push(s)
  return s
}
afterEach(() => {
  for (const s of server.splice(0)) s.aufraeumen()
})

const anmelden = (s: ReturnType<typeof testserver>, passwort: string, anmeldename = 'robin') => s.anfrage('/api/anmelden', s.json({ anmeldename, passwort }))

describe('Anmeldung und Sitzung (2.6)', () => {
  it('richtet den ersten Benutzer ein, danach nur noch Anmeldung', async () => {
    const s = neu()
    expect(((await (await s.anfrage('/api/sitzung')).json()) as { einrichtungNoetig: boolean }).einrichtungNoetig).toBe(true)
    await s.einrichten()
    const sitzung = (await (await s.anfrage('/api/sitzung')).json()) as { angemeldet: boolean; benutzer: { anmeldename: string } }
    expect(sitzung).toMatchObject({ angemeldet: true, benutzer: { anmeldename: 'robin' } })
    const zweite = await s.anfrage('/api/einrichtung/benutzer', s.json({ anmeldename: 'eva', name: 'Eva', passwort: PASSWORT }))
    expect(zweite.status).toBe(409)
    expect(s.d.protokoll.alle()[0]).toMatchObject({ aktion: 'einstellungen-geaendert', daten: { bereich: 'benutzer', neu: { anmeldename: 'robin' } } })
  })

  it('setzt das Sitzungs-Cookie HttpOnly und SameSite=Strict', async () => {
    const s = neu()
    const r = await s.anfrage('/api/einrichtung/benutzer', s.json({ anmeldename: 'robin', name: 'Robin', passwort: PASSWORT }))
    const cookie = r.headers.get('set-cookie')!
    expect(cookie).toMatch(/^bb_sitzung=[A-Za-z0-9_-]{43};/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Secure') // http auf 127.0.0.1
  })

  it('meldet ab und an', async () => {
    const s = neu()
    await s.einrichten()
    await s.anfrage('/api/abmelden', { method: 'POST' })
    expect((await s.anfrage('/api/belege')).status).toBe(401)
    expect((await anmelden(s, PASSWORT)).status).toBe(200)
    expect((await s.anfrage('/api/belege')).status).toBe(200)
  })

  it('T-S1: nach 5 Fehlversuchen ist der Name 15 Minuten gesperrt', { timeout: 60_000 }, async () => {
    const s = neu()
    await s.einrichten()
    s.abmeldenLokal()
    for (let i = 0; i < 5; i++) {
      const r = await anmelden(s, 'falsch-falsch')
      expect(r.status).toBe(401)
      expect(((await r.json()) as { fehler: { code: string } }).fehler.code).toBe('ANMELDUNG-FALSCH')
    }
    const sechste = await anmelden(s, PASSWORT)
    expect(sechste.status).toBe(429)
    expect(((await sechste.json()) as { fehler: { text: string } }).fehler.text).toContain('15 Minuten')
    s.vorspulen(14 * 60 * 1000)
    expect((await anmelden(s, PASSWORT)).status).toBe(429)
    s.vorspulen(60 * 1000 + 1)
    expect((await anmelden(s, PASSWORT)).status).toBe(200)
    const log = s.d.db.alle<{ ereignis: string }>('SELECT ereignis FROM sicherheitslog ORDER BY id')
    expect(log.filter((l) => l.ereignis === 'anmeldung-fehlgeschlagen')).toHaveLength(5)
    expect(log.filter((l) => l.ereignis === 'anmeldung-gesperrt')).toHaveLength(2)
    // GoBD-Protokoll ohne Anmeldeereignisse und ohne IP
    expect(s.d.protokoll.alle().some((p) => JSON.stringify(p).includes('anmeldung'))).toBe(false)
  })

  it('verrät nicht, ob ein Anmeldename existiert', async () => {
    const s = neu()
    await s.einrichten()
    s.abmeldenLokal()
    const unbekannt = (await (await anmelden(s, PASSWORT, 'niemand')).json()) as { fehler: { text: string } }
    const falsch = (await (await anmelden(s, 'falsch-falsch')).json()) as { fehler: { text: string } }
    expect(unbekannt.fehler.text).toBe(falsch.fehler.text)
  })

  it('läuft nach 8 Stunden ohne Aktivität ab', () => {
    let jetzt = 0
    const sitzungen = new Sitzungen(() => jetzt)
    const token = sitzungen.oeffnen('B')
    jetzt += 7 * 60 * 60 * 1000
    expect(sitzungen.pruefen(token)).toBe('B') // verlängert
    jetzt += 8 * 60 * 60 * 1000 - 1
    expect(sitzungen.pruefen(token)).toBe('B')
    jetzt += 8 * 60 * 60 * 1000 + 1
    expect(sitzungen.pruefen(token)).toBeNull()
    expect(sitzungen.pruefen('erfunden')).toBeNull()
  })

  it('hasht Passwörter mit scrypt nach OWASP-Mindestwerten', async () => {
    const h = await hashePasswort('Kennwort mit Ümlaut')
    expect(h).toMatch(/^scrypt\$N=131072\$r=8\$p=1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{86}==$/)
    expect(await pruefePasswort('Kennwort mit Ümlaut', h)).toBe(true)
    expect(await pruefePasswort('Kennwort mit Umlaut', h)).toBe(false)
    expect(await pruefePasswort('x', 'md5$abc')).toBe(false)
  })

  it('erlaubt höchstens 3 Benutzer und prüft Passwortlänge', async () => {
    const s = neu()
    await s.einrichten()
    expect((await s.anfrage('/api/benutzer', s.json({ anmeldename: 'eva', name: 'Eva', passwort: 'kurz' }))).status).toBe(400)
    expect((await s.anfrage('/api/benutzer', s.json({ anmeldename: 'eva', name: 'Eva', passwort: PASSWORT }))).status).toBe(201)
    expect((await s.anfrage('/api/benutzer', s.json({ anmeldename: 'eva', name: 'Eva 2', passwort: PASSWORT }))).status).toBe(409)
    expect((await s.anfrage('/api/benutzer', s.json({ anmeldename: 'max', name: 'Max', passwort: PASSWORT }))).status).toBe(201)
    const vierter = await s.anfrage('/api/benutzer', s.json({ anmeldename: 'ida', name: 'Ida', passwort: PASSWORT }))
    expect(vierter.status).toBe(409)
    expect(((await vierter.json()) as { fehler: { code: string } }).fehler.code).toBe('ZU-VIELE-BENUTZER')
  })
})

describe('Schutz vor fremden Anfragen (2.6)', () => {
  it('T-S2: POST ohne Sitzung ergibt 401, ohne X-Belegbruecke 403', async () => {
    const s = neu()
    await s.einrichten()
    const ohneKopfzeile = await s.hochladen([])
    expect(ohneKopfzeile.status).toBe(400) // mit Sitzung und Kopfzeile: nur die leere Eingabe fehlt
    const ohneCsrf = await s.anfrage('/api/archiv/pruefen', s.json({}, { ohneCsrf: true }))
    expect(ohneCsrf.status).toBe(403)
    expect(((await ohneCsrf.json()) as { fehler: { code: string } }).fehler.code).toBe('CSRF')
    s.abmeldenLokal()
    const ohneSitzung = await s.anfrage('/api/archiv/pruefen', s.json({}))
    expect(ohneSitzung.status).toBe(401)
    expect(((await ohneSitzung.json()) as { fehler: { code: string; text: string } }).fehler).toEqual({ code: 'NICHT-ANGEMELDET', text: 'Bitte melden Sie sich an.' })
    expect((await s.anfrage('/api/belege')).status).toBe(401)
  })

  it('T-S3: jede Antwort trägt CSP, nosniff und no-referrer', async () => {
    const s = neu()
    for (const r of [await s.anfrage('/api/status'), await s.anfrage('/api/belege'), await s.anfrage('/api/gibt-es-nicht'), await s.anfrage('/api/status', { basis: 'http://belegbruecke.example' })]) {
      expect(r.headers.get('content-security-policy')).toBe("default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
      expect(r.headers.get('x-content-type-options')).toBe('nosniff')
      expect(r.headers.get('referrer-policy')).toBe('no-referrer')
    }
  })

  it('T-S7: fremder Host ergibt 421, fremder Origin 403', async () => {
    const s = neu()
    await s.einrichten()
    const host = await s.anfrage('/api/status', { basis: 'http://belegbruecke.example' })
    expect(host.status).toBe(421)
    expect(((await host.json()) as { fehler: { code: string } }).fehler.code).toBe('HOST-UNGUELTIG')
    expect((await s.anfrage('/api/status', { basis: 'http://localhost:8784' })).status).toBe(200)
    expect((await s.anfrage('/api/status', { basis: 'http://127.0.0.1:9999' })).status).toBe(421)
    const origin = await s.anfrage('/api/archiv/pruefen', s.json({}, { origin: 'https://boese.example' }))
    expect(origin.status).toBe(403)
    expect(((await origin.json()) as { fehler: { code: string } }).fehler.code).toBe('URSPRUNG-UNGUELTIG')
    expect((await s.anfrage('/api/archiv/pruefen', s.json({}, { origin: null }))).status).toBe(403)
    expect((await s.anfrage('/api/archiv/pruefen', s.json({}, { origin: 'http://localhost:8784' }))).status).toBe(200)
  })

  it('T-S8: die Ansicht hat eine eigene CSP mit sandbox und frame-ancestors self', async () => {
    const s = neu()
    await s.einrichten()
    const r = await s.hochladen([{ name: 'a.xml', bytes: kosit('standard/01.01a-INVOICE_ubl.xml') }])
    const { ergebnisse } = (await r.json()) as { ergebnisse: { belegId: string }[] }
    const ansicht = await s.anfrage(`/api/belege/${ergebnisse[0].belegId}/ansicht`)
    expect(ansicht.headers.get('content-security-policy')).toBe(
      "sandbox allow-scripts allow-downloads; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'",
    )
    expect(ansicht.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })

  it('weist unbekannte Belege und kaputte Eingaben mit deutschem Text ab', async () => {
    const s = neu()
    await s.einrichten()
    const r = await s.anfrage('/api/belege/00000000-0000-4000-8000-000000000000')
    expect(r.status).toBe(404)
    expect(((await r.json()) as { fehler: { text: string } }).fehler.text).toBe('Diesen Beleg gibt es nicht.')
    expect((await s.anfrage('/api/belege/..%2F..%2Fx')).status).toBe(404)
    const kaputt = await s.anfrage('/api/anmelden', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{kaputt' })
    expect(kaputt.status).toBe(400)
  })
})

describe('Echter HTTP-Server mit Worker-Pool', () => {
  it('lauscht auf 127.0.0.1, prüft im Worker und weist fremde Hosts ab', { timeout: 120_000 }, async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'bb-start-'))
    const port = 18784
    const s = await starteServer({ datenOrdner: ordner, port, oberflaeche: null })
    try {
      const roh = (host: string) =>
        new Promise<number>((ok, fehler) => {
          const r = request({ host: '127.0.0.1', port, path: '/api/status', headers: { host } }, (res) => {
            res.resume()
            ok(res.statusCode ?? 0)
          })
          r.on('error', fehler)
          r.end()
        })
      expect(await roh(`127.0.0.1:${port}`)).toBe(200)
      expect(await roh('belegbruecke.example')).toBe(421)
      expect(await roh(`localhost:${port}`)).toBe(200)
      // Ablauf über HTTP mit Prüfung im Worker
      const basis = `http://127.0.0.1:${port}`
      const kopf = { 'content-type': 'application/json', 'x-belegbruecke': '1', origin: basis }
      const einrichtung = await fetch(`${basis}/api/einrichtung/benutzer`, { method: 'POST', headers: kopf, body: JSON.stringify({ anmeldename: 'robin', name: 'Robin', passwort: PASSWORT }) })
      const cookie = einrichtung.headers.get('set-cookie')!.split(';')[0]
      const fd = new FormData()
      fd.append('dateien', new File([kosit('standard/01.01a-INVOICE_ubl.xml') as Uint8Array<ArrayBuffer>], '01.01a.xml'))
      const upload = await fetch(`${basis}/api/belege`, { method: 'POST', headers: { 'x-belegbruecke': '1', origin: basis, cookie }, body: fd })
      const { ergebnisse } = (await upload.json()) as { ergebnisse: { ok: boolean; status: string }[] }
      expect(ergebnisse[0]).toMatchObject({ ok: true, status: 'geprueft' })
    } finally {
      await s.beenden()
      for (const e of readdirSync(ordner, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
      rmSync(ordner, { recursive: true, force: true })
    }
  })
})
