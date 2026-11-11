/**
 * Postfach (Phase 5): T-I1 bis T-I4 mit selbst erzeugten E-Mails und dem IMAP-Testserver über TLS
 * (statt GreenMail, damit kein Java nötig ist).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Beleg, Einstellungen } from '../fach/typen.ts'
import { kosit, zugferd } from '../testhilfen/dateien.ts'
import { ImapTestserver } from '../testhilfen/imap-testserver.ts'
import { baueMail } from '../testhilfen/mails.ts'
import { testserver } from '../testhilfen/server.ts'
import { erzeugeTestzertifikat } from '../testhilfen/tls.ts'
import { ANMELDUNG_FEHLGESCHLAGEN, klartextFehler, type Abrufbericht } from './postfach/abruf.ts'
import { absenderErlaubt, verarbeiteMail } from './postfach/mail.ts'
import { Schluesselbund } from './postfach/schluessel.ts'

const zertifikat = erzeugeTestzertifikat()
const PASSWORT_POSTFACH = 'Postfach-Geheimnis-4711'

const mailXRechnung = () =>
  baueMail({ betreff: 'Rechnung 123456789', messageId: '<m1@lieferant.example>', anhaenge: [{ name: '03.01a-INVOICE_ubl.xml', typ: 'application/xml', inhalt: kosit('standard/03.01a-INVOICE_ubl.xml') }] })
const mailZugferd = () => baueMail({ betreff: 'Rechnung als PDF', messageId: '<m2@lieferant.example>', anhaenge: [{ name: 'Rechnung 123456XX.pdf', typ: 'application/pdf', inhalt: zugferd('zf-en16931.pdf') }] })
// PDF mit eingebettetem XML und dasselbe XML noch einmal einzeln (byte-gleich, siehe docs/entscheidungen.md T7)
const mailBeides = () =>
  baueMail({
    betreff: 'Rechnung als PDF und XML',
    messageId: '<m3@lieferant.example>',
    anhaenge: [
      { name: 'Rechnung.pdf', typ: 'application/pdf', inhalt: zugferd('zf-xrechnung.pdf') },
      { name: 'xrechnung.xml', typ: 'application/xml', inhalt: kosit('standard/01.01a-INVOICE_uncefact.xml') },
    ],
  })

const server: ReturnType<typeof testserver>[] = []
function neu() {
  const s = testserver('2026-11-11T09:30:00.000Z', { imapCa: zertifikat.cert })
  server.push(s)
  return s
}
afterEach(() => {
  for (const s of server.splice(0)) s.aufraeumen()
})

const EINSTELLUNG = { emlAufbewahren: true, nurVonAbsendern: [] as string[] }

describe('E-Mails verarbeiten (5.1)', () => {
  it('T-I1: XRechnung, ZUGFeRD sowie PDF und XML derselben Rechnung ergeben 1 + 1 + 2 Belege', async () => {
    const s = neu()
    const r1 = await verarbeiteMail(s.d, mailXRechnung(), EINSTELLUNG)
    const r2 = await verarbeiteMail(s.d, mailZugferd(), EINSTELLUNG)
    const r3 = await verarbeiteMail(s.d, mailBeides(), EINSTELLUNG)
    expect([r1, r2, r3].map((r) => [r.art, r.belege.filter((b) => b.ok).length])).toEqual([
      ['belege', 1],
      ['belege', 1],
      ['belege', 2],
    ])
    const [pdf, xml] = r3.belege
    expect((s.d.belege.hole(pdf.belegId!) as Beleg).format).toMatchObject({ container: 'pdf-mit-xml', profil: 'xrechnung-3.0' })
    expect(xml.dubletten?.some((h) => h.stufe === 'gleiche-rechnung' && h.andererBelegId === pdf.belegId)).toBe(true)

    // Quelle, Roh-Mail und Protokoll
    const beleg = s.d.belege.hole(r1.belege[0].belegId!) as Beleg
    expect(beleg.quelle).toMatchObject({ art: 'imap', messageId: '<m1@lieferant.example>', absender: 'rechnung@lieferant.example', betreff: 'Rechnung 123456789', emlSha256: r1.emlSha256 })
    expect(r1.emlSha256).toMatch(/^[0-9a-f]{64}$/)
    const eingang = s.d.protokoll.fuerBeleg(beleg.id)[0]
    expect(eingang.daten).toMatchObject({ quelle: 'imap', messageId: '<m1@lieferant.example>', emlSha256: r1.emlSha256, emlPfad: `originale/${r1.emlSha256!.slice(0, 2)}/${r1.emlSha256}.eml` })
    expect(existsSync(join(s.ordner, 'originale', r1.emlSha256!.slice(0, 2), `${r1.emlSha256}.eml`))).toBe(true)
    const { pruefeArchiv } = await import('./dienste/kette.ts')
    const bericht = await pruefeArchiv(s.d.db, s.d.ablage, s.d.protokoll)
    expect(bericht).toMatchObject({ ok: true, fehler: [] })
  })

  it('T-I2: dieselben Mails noch einmal ergeben keinen neuen Beleg', async () => {
    const s = neu()
    for (const m of [mailXRechnung(), mailZugferd(), mailBeides()]) await verarbeiteMail(s.d, m, EINSTELLUNG)
    const anzahl = s.d.belege.liste().length
    const wieder = await Promise.all([mailXRechnung(), mailZugferd(), mailBeides()].map((m) => verarbeiteMail(s.d, m, EINSTELLUNG)))
    expect(wieder.map((r) => r.art)).toEqual(['bekannt', 'bekannt', 'bekannt'])
    expect(s.d.belege.liste()).toHaveLength(anzahl)
    // gleiche Anhänge mit anderer Message-ID: identische Datei, kein Beleg, keine Roh-Mail
    const kopie = await verarbeiteMail(s.d, baueMail({ betreff: 'Kopie', messageId: '<kopie@lieferant.example>', anhaenge: [{ name: 'r.xml', typ: 'application/xml', inhalt: kosit('standard/03.01a-INVOICE_ubl.xml') }] }), EINSTELLUNG)
    expect(kopie).toMatchObject({ art: 'belege', emlSha256: null })
    expect(kopie.belege[0]).toMatchObject({ ok: false, code: 'DUBLETTE-IDENTISCH' })
    expect(kopie.text).toContain('liegt bereits als B-00001 im Archiv')
  })

  it('übernimmt keine Bilder, filtert Absender und begrenzt die Anhänge', async () => {
    const s = neu()
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const bild = await verarbeiteMail(s.d, baueMail({ betreff: 'Foto', messageId: '<bild@x>', anhaenge: [{ name: 'quittung.png', typ: 'image/png', inhalt: png }] }), EINSTELLUNG)
    expect(bild).toMatchObject({ art: 'ohne-beleg', belege: [], emlSha256: null })
    const ohne = await verarbeiteMail(s.d, baueMail({ betreff: 'Hallo', messageId: '<ohne@x>', anhaenge: [] }), EINSTELLUNG)
    expect(ohne.art).toBe('ohne-beleg')
    const gefiltert = await verarbeiteMail(s.d, mailXRechnung(), { emlAufbewahren: true, nurVonAbsendern: ['@andere.example'] })
    expect(gefiltert.art).toBe('gefiltert')
    expect(absenderErlaubt('rechnung@lieferant.example', ['@lieferant.example'])).toBe(true)
    expect(absenderErlaubt('rechnung@lieferant.example', ['RECHNUNG@lieferant.example'])).toBe(true)
    expect(absenderErlaubt('x@lieferant.example', ['rechnung@lieferant.example'])).toBe(false)
    const viele = await verarbeiteMail(s.d, baueMail({ betreff: 'Viele', messageId: '<viele@x>', anhaenge: Array.from({ length: 21 }, (_, i) => ({ name: `a${i}.png`, typ: 'image/png', inhalt: png })) }), EINSTELLUNG)
    expect(viele).toMatchObject({ art: 'fehler' })
    expect(viele.text).toContain('höchstens 20')
    const kaputt = await verarbeiteMail(s.d, new Uint8Array(51 * 1024 * 1024), EINSTELLUNG)
    expect(kaputt.text).toContain('größer als 50 MB')
    // ohne Zustimmung keine Roh-Mail
    const r = await verarbeiteMail(s.d, mailZugferd(), { emlAufbewahren: false, nurVonAbsendern: [] })
    expect(r).toMatchObject({ art: 'belege', emlSha256: null })
    expect((s.d.belege.hole(r.belege[0].belegId!) as Beleg).quelle).toMatchObject({ art: 'imap', emlSha256: null })
  })
})

describe('Passwort und Fehlermeldungen (5.3)', () => {
  it('verschlüsselt mit AES-256-GCM und erkennt Veränderungen', () => {
    const s = neu()
    const b = new Schluesselbund(s.schluesselDatei)
    const geheim = b.verschluessele('äöü-Passwort')
    expect(geheim).not.toContain('Passwort')
    expect(b.entschluessele(geheim)).toBe('äöü-Passwort')
    expect(b.verschluessele('x')).not.toBe(b.verschluessele('x'))
    expect(readFileSync(s.schluesselDatei)).toHaveLength(32)
    expect(new Schluesselbund(s.schluesselDatei).entschluessele(geheim)).toBe('äöü-Passwort')
    const roh = Buffer.from(geheim, 'base64')
    roh[roh.length - 1] ^= 1
    expect(() => b.entschluessele(roh.toString('base64'))).toThrow()
    expect(() => b.entschluessele('AAAA')).toThrow('unvollständig')
  })

  it('nennt Netz- und TLS-Fehler in Klartext', () => {
    const z = { server: 'imap.example', port: 993 }
    expect(klartextFehler({ authenticationFailed: true }, z)).toBe(ANMELDUNG_FEHLGESCHLAGEN)
    expect(klartextFehler({ code: 'ENOTFOUND' }, z)).toContain('gibt es nicht')
    expect(klartextFehler({ code: 'ECONNREFUSED' }, z)).toContain('Port 993')
    expect(klartextFehler({ code: 'ETIMEDOUT' }, z)).toContain('antwortet nicht')
    expect(klartextFehler({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }, z)).toContain('nicht vertrauenswürdig')
    expect(klartextFehler({ code: 'ERR_SSL_WRONG_VERSION_NUMBER' }, z)).toContain('kein STARTTLS')
    expect(klartextFehler(new Error('kaputt'), z)).toBe('Verbindung zum Postfach fehlgeschlagen: kaputt')
  })
})

describe('IMAP-Abruf gegen den Testserver (5.2, 5.3)', () => {
  let imap: ImapTestserver
  beforeAll(async () => {
    imap = await ImapTestserver.starte({ benutzer: 'eingang@firma.example', passwort: PASSWORT_POSTFACH, key: zertifikat.key, cert: zertifikat.cert })
  })
  afterAll(async () => {
    await imap.stoppe()
  })

  async function postfachEinrichten(s: ReturnType<typeof testserver>, passwort: string) {
    await s.einrichten()
    const e = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen & { passwortGesetzt?: boolean }
    delete e.passwortGesetzt
    const r = await s.anfrage('/api/einstellungen', s.json({ ...e, postfach: { ...e.postfach, aktiv: true, server: '127.0.0.1', port: imap.port, benutzer: 'eingang@firma.example' } }, { method: 'PUT' }))
    expect(r.status).toBe(200)
    expect((await s.anfrage('/api/postfach/passwort', s.json({ passwort }, { method: 'PUT' }))).status).toBe(200)
  }

  it('T-I4: drei Mails werden verarbeitet und liegen danach im Zielordner', async () => {
    for (const m of [mailXRechnung(), mailZugferd(), mailBeides()]) imap.lege(m)
    const s = neu()
    await postfachEinrichten(s, PASSWORT_POSTFACH)
    const test = await s.anfrage('/api/postfach/test', s.json({ server: '127.0.0.1', port: imap.port, benutzer: 'eingang@firma.example', ordner: 'INBOX' }))
    expect(await test.json()).toEqual({ ok: true, text: 'Verbindung in Ordnung: angemeldet als eingang@firma.example, Ordner „INBOX“ mit 3 Nachrichten.' })
    const r = await s.anfrage('/api/postfach/abrufen', s.json({}))
    const { bericht, status } = (await r.json()) as { bericht: Abrufbericht; status: { letzterAbruf: Abrufbericht; naechsterAbruf: string | null } }
    expect(bericht).toMatchObject({ ok: true, fehler: null, nachrichten: 3, belege: 4 })
    expect(bericht.mails.map((m) => m.art)).toEqual(['belege', 'belege', 'belege'])
    expect(imap.nachrichten('INBOX')).toHaveLength(0)
    expect(imap.nachrichten('Belegbruecke/verarbeitet')).toHaveLength(3)
    expect(status.letzterAbruf.belege).toBe(4)
    // zweiter Abruf: nichts mehr da
    const zweiter = (await (await s.anfrage('/api/postfach/abrufen', s.json({}))).json()) as { bericht: Abrufbericht }
    expect(zweiter.bericht).toMatchObject({ ok: true, nachrichten: 0, belege: 0 })
    // Mail ohne Rechnung landet unter „ohne-beleg“
    imap.lege(baueMail({ betreff: 'Newsletter', messageId: '<news@x>', anhaenge: [] }))
    const dritter = (await (await s.anfrage('/api/postfach/abrufen', s.json({}))).json()) as { bericht: Abrufbericht }
    expect(dritter.bericht.mails.map((m) => m.art)).toEqual(['ohne-beleg'])
    expect(imap.nachrichten('Belegbruecke/verarbeitet/ohne-beleg')).toHaveLength(1)
    expect(s.d.belege.liste({ status: 'geprueft' }).length).toBeGreaterThanOrEqual(3)
  })

  it('T-I3: falsches Passwort ergibt Klartext, der Dienst läuft weiter, kein Klartext in der Datenbank', async () => {
    const s = neu()
    await postfachEinrichten(s, 'falsches-Passwort-123')
    const test = (await (await s.anfrage('/api/postfach/test', s.json({ server: '127.0.0.1', port: imap.port, benutzer: 'eingang@firma.example', ordner: 'INBOX' }))).json()) as { ok: boolean; text: string }
    expect(test.ok).toBe(false)
    expect(test.text).toContain('Anmeldung am Postfach fehlgeschlagen')
    const r = (await (await s.anfrage('/api/postfach/abrufen', s.json({}))).json()) as { bericht: Abrufbericht }
    expect(r.bericht).toMatchObject({ ok: false, fehler: ANMELDUNG_FEHLGESCHLAGEN })
    // der Dienst antwortet weiter
    const status = (await (await s.anfrage('/api/postfach/status')).json()) as { aktiv: boolean; eingerichtet: boolean; laeuft: boolean }
    expect(status).toMatchObject({ aktiv: true, eingerichtet: true, laeuft: false })
    // mit richtigem Passwort klappt es
    expect((await s.anfrage('/api/postfach/passwort', s.json({ passwort: PASSWORT_POSTFACH }, { method: 'PUT' }))).status).toBe(200)
    expect(((await (await s.anfrage('/api/postfach/abrufen', s.json({}))).json()) as { bericht: Abrufbericht }).bericht.ok).toBe(true)
    // weder Datenbank noch WAL enthalten ein Passwort im Klartext; das Protokoll nennt nur „geändert“
    for (const datei of ['belegbruecke.sqlite', 'belegbruecke.sqlite-wal']) {
      const pfad = join(s.ordner, datei)
      if (!existsSync(pfad)) continue
      const inhalt = readFileSync(pfad)
      expect(inhalt.includes(Buffer.from(PASSWORT_POSTFACH))).toBe(false)
      expect(inhalt.includes(Buffer.from('falsches-Passwort-123'))).toBe(false)
    }
    const einstellungen = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen & { passwortGesetzt: boolean }
    expect(einstellungen.postfach.passwortVerschluesselt).toBe('')
    expect(einstellungen.passwortGesetzt).toBe(true)
    // falscher Port: Klartext statt Absturz
    const port = (await (await s.anfrage('/api/postfach/test', s.json({ server: '127.0.0.1', port: 1, benutzer: 'x', passwort: 'y', ordner: 'INBOX' }))).json()) as { ok: boolean; text: string }
    expect(port).toMatchObject({ ok: false })
    expect(port.text).toMatch(/keine Verbindung an|antwortet nicht/)
  })

  it('meldet ein unvollständig eingerichtetes Postfach', async () => {
    const s = neu()
    await s.einrichten()
    const r = (await (await s.anfrage('/api/postfach/abrufen', s.json({}))).json()) as { bericht: Abrufbericht }
    expect(r.bericht.fehler).toContain('nicht vollständig eingerichtet')
    expect((await s.anfrage('/api/postfach/test', s.json({ server: '127.0.0.1', port: imap.port, benutzer: 'x', ordner: 'INBOX' }))).status).toBe(400)
  })
})
