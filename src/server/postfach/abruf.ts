/**
 * IMAP-Abruf mit imapflow (R23, Schritt 5.2): nur TLS, Nachrichten im Ordner holen, je Mail verarbeiten,
 * danach in den Zielordner verschieben (ohne Beleg nach „<Zielordner>/ohne-beleg“); bei Fehlern bleibt
 * die Mail liegen. Verbindungstest und Fehlermeldungen in Klartext (Schritt 5.3).
 */
import { ImapFlow } from 'imapflow'
import type { PostfachEinstellungen, Zeitpunkt } from '../../fach/typen.ts'
import type { Dienste } from '../dienste/kontext.ts'
import { MAIL_HOECHSTENS_BYTES, verarbeiteMail, type Mailergebnis } from './mail.ts'

export interface Zugang {
  server: string
  port: number
  benutzer: string
  passwort: string
}

export interface Verbindungsoptionen {
  /** zusätzlicher Vertrauensanker (nur für den IMAP-Testserver, BB_IMAP_CA) */
  ca?: string
  zeitlimitMs?: number
}

/** Höchstens so viele Mails je Abruf; der Rest folgt beim nächsten. */
export const MAILS_JE_ABRUF = 50

export interface Abrufbericht {
  zeitpunkt: Zeitpunkt
  ok: boolean
  /** Fehler der Verbindung in Klartext, sonst null */
  fehler: string | null
  nachrichten: number
  belege: number
  mails: Mailergebnis[]
}

export const ANMELDUNG_FEHLGESCHLAGEN = 'Anmeldung am Postfach fehlgeschlagen. Benutzer oder Passwort stimmen nicht; viele Anbieter verlangen für IMAP ein eigenes App-Passwort.'

/** Fehler von Netz, TLS und IMAP als deutscher Satz. */
export function klartextFehler(e: unknown, z: Pick<Zugang, 'server' | 'port'>): string {
  const f = e as { code?: string; authenticationFailed?: boolean; message?: string; responseText?: string }
  if (f?.authenticationFailed) return ANMELDUNG_FEHLGESCHLAGEN
  switch (f?.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Den Server „${z.server}“ gibt es nicht oder er ist nicht erreichbar. Bitte den Namen prüfen.`
    case 'ECONNREFUSED':
      return `Der Server „${z.server}“ nimmt auf Port ${z.port} keine Verbindung an. Für IMAP mit TLS ist meist Port 993 richtig.`
    case 'ETIMEDOUT':
    case 'CONNECT_TIMEOUT':
    case 'GREETING_TIMEOUT':
    case 'ESOCKETTIMEDOUT':
      return `Der Server „${z.server}“ antwortet nicht. Läuft die Internetverbindung, und stimmt der Port ${z.port}?`
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `Das TLS-Zertifikat von „${z.server}“ ist nicht vertrauenswürdig (${f.code}). Die Belegbrücke verbindet sich nur verschlüsselt mit gültigem Zertifikat.`
    case 'EPROTO':
    case 'ERR_SSL_WRONG_VERSION_NUMBER':
      return `Mit „${z.server}“ kommt keine TLS-Verbindung zustande. Die Belegbrücke nutzt nur IMAP über TLS (Port 993), kein STARTTLS und keine unverschlüsselte Verbindung.`
  }
  return `Verbindung zum Postfach fehlgeschlagen: ${f?.responseText || f?.message || String(e)}`
}

function client(z: Zugang, o: Verbindungsoptionen): ImapFlow {
  const c = new ImapFlow({
    host: z.server,
    port: z.port,
    secure: true,
    auth: { user: z.benutzer, pass: z.passwort },
    logger: false,
    tls: { minVersion: 'TLSv1.2', ...(o.ca ? { ca: o.ca } : {}) },
    disableAutoIdle: true,
    disableCompression: true,
    connectionTimeout: o.zeitlimitMs ?? 20_000,
    greetingTimeout: o.zeitlimitMs ?? 20_000,
    socketTimeout: 120_000,
  })
  // Fehler nach dem Verbindungsaufbau dürfen den Server nicht beenden
  c.on('error', () => undefined)
  return c
}

async function schliessen(c: ImapFlow) {
  await c.logout().catch(() => c.close())
}

/** Schritt E4 „Verbindung testen“: anmelden und prüfen, ob der Ordner existiert. */
export async function testeVerbindung(z: Zugang, ordner: string, o: Verbindungsoptionen = {}): Promise<{ ok: boolean; text: string }> {
  const c = client(z, o)
  try {
    await c.connect()
  } catch (e) {
    return { ok: false, text: klartextFehler(e, z) }
  }
  try {
    const ordnerListe = await c.list()
    const gefunden = ordnerListe.some((f) => f.path.toUpperCase() === ordner.toUpperCase())
    if (!gefunden) return { ok: false, text: `Angemeldet, aber den Ordner „${ordner}“ gibt es im Postfach nicht. Vorhanden: ${ordnerListe.map((f) => f.path).slice(0, 10).join(', ')}.` }
    const status = await c.status(ordner, { messages: true })
    const anzahl = status ? (status.messages ?? 0) : 0
    return { ok: true, text: `Verbindung in Ordnung: angemeldet als ${z.benutzer}, Ordner „${ordner}“ mit ${anzahl} Nachricht${anzahl === 1 ? '' : 'en'}.` }
  } catch (e) {
    return { ok: false, text: klartextFehler(e, z) }
  } finally {
    await schliessen(c)
  }
}

/** Legt einen Ordner an, falls er fehlt, und liefert seinen Pfad mit dem Trennzeichen des Servers. */
async function sichereOrdner(c: ImapFlow, pfad: string): Promise<string> {
  const r = await c.mailboxCreate(pfad.split('/').filter(Boolean))
  return r.path
}

/** Ein Abruf: alle Nachrichten im Ordner (höchstens MAILS_JE_ABRUF) verarbeiten und verschieben. */
export async function rufeAb(d: Dienste, z: Zugang, e: PostfachEinstellungen, o: Verbindungsoptionen = {}): Promise<Abrufbericht> {
  const bericht: Abrufbericht = { zeitpunkt: d.uhr().toISOString(), ok: false, fehler: null, nachrichten: 0, belege: 0, mails: [] }
  const c = client(z, o)
  try {
    await c.connect()
  } catch (x) {
    return { ...bericht, fehler: klartextFehler(x, z) }
  }
  try {
    const ziel = await sichereOrdner(c, e.zielOrdner)
    const ohneBeleg = await sichereOrdner(c, `${e.zielOrdner}/ohne-beleg`)
    const sperre = await c.getMailboxLock(e.ordner)
    try {
      const liste: { uid: number; groesse: number }[] = []
      if (c.mailbox && c.mailbox.exists > 0) {
        for await (const m of c.fetch('1:*', { uid: true, size: true })) liste.push({ uid: m.uid, groesse: m.size ?? 0 })
      }
      bericht.nachrichten = liste.length
      for (const n of liste.slice(0, MAILS_JE_ABRUF)) {
        if (n.groesse > MAIL_HOECHSTENS_BYTES) {
          bericht.mails.push({ messageId: '', absender: '', betreff: '', art: 'fehler', text: 'Eine E-Mail ist größer als 50 MB und bleibt liegen.', belege: [], emlSha256: null })
          continue
        }
        const m = await c.fetchOne(String(n.uid), { source: true }, { uid: true })
        if (!m || !m.source) continue
        let r: Mailergebnis
        try {
          r = await verarbeiteMail(d, new Uint8Array(m.source), e)
        } catch (x) {
          // Unerwarteter Fehler: Mail bleibt liegen, der nächste Abruf versucht es erneut
          r = { messageId: '', absender: '', betreff: '', art: 'fehler', text: `Verarbeitung fehlgeschlagen: ${(x as Error).message}`, belege: [], emlSha256: null }
        }
        bericht.mails.push(r)
        bericht.belege += r.belege.filter((b) => b.ok).length
        if (r.art === 'belege' || r.art === 'bekannt') await c.messageMove(String(n.uid), ziel, { uid: true })
        else if (r.art === 'ohne-beleg') await c.messageMove(String(n.uid), ohneBeleg, { uid: true })
      }
    } finally {
      sperre.release()
    }
    bericht.ok = true
  } catch (x) {
    bericht.fehler = klartextFehler(x, z)
  } finally {
    await schliessen(c)
  }
  return bericht
}
