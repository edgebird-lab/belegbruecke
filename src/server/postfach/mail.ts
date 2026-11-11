/**
 * E-Mail zerlegen und Anhänge übernehmen (R23, Schritt 5.1): Anhänge mit Dateiart XML oder PDF (nach
 * Inhalt, R1) werden je ein Beleg, Bilder nicht. Idempotent über (Message-ID, SHA-256 des Anhangs) in
 * `postfach_gesehen`. Die Roh-Mail wird nur aufbewahrt, wenn die Einstellung es will und die Mail
 * mindestens einen neuen Beleg liefert (Datensparsamkeit).
 */
import { createHash } from 'node:crypto'
import { simpleParser } from 'mailparser'
import { erkenneDateiart, pruefeAnnahme } from '../../fach/annahme.ts'
import type { PostfachEinstellungen, Zeitpunkt } from '../../fach/typen.ts'
import { nimmAn, type Eingangsergebnis } from '../dienste/eingang.ts'
import type { Dienste } from '../dienste/kontext.ts'

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

export const MAIL_HOECHSTENS_BYTES = 50 * 1024 * 1024
export const MAIL_HOECHSTENS_ANHAENGE = 20

export interface Mailanhang {
  name: string
  bytes: Uint8Array
  sha256: string
  art: 'xml' | 'pdf' | 'jpeg' | 'png' | null
}

export interface Mail {
  messageId: string
  absender: string
  betreff: string
  empfangenAm: Zeitpunkt
  anhaenge: Mailanhang[]
}

/** Zerlegt eine Roh-Mail; ohne Message-ID gilt eine aus dem Hash der Mail abgeleitete. */
export async function zerlegeMail(roh: Uint8Array, jetzt: Date): Promise<Mail> {
  const m = await simpleParser(Buffer.from(roh), { skipHtmlToText: true, skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true })
  const absender = m.from?.value.find((a) => a.address)?.address ?? ''
  return {
    messageId: (m.messageId ?? `<${sha256(roh)}@ohne-message-id.belegbruecke>`).slice(0, 998),
    absender: absender.toLowerCase(),
    betreff: (m.subject ?? '').slice(0, 300),
    empfangenAm: (m.date && !Number.isNaN(m.date.getTime()) ? m.date : jetzt).toISOString(),
    anhaenge: m.attachments
      .filter((a) => a.contentType !== 'message/rfc822')
      .map((a) => {
        const bytes = new Uint8Array(a.content)
        return { name: a.filename ?? 'anhang', bytes, sha256: sha256(bytes), art: erkenneDateiart(bytes) }
      }),
  }
}

export type Mailart = 'belege' | 'bekannt' | 'ohne-beleg' | 'gefiltert' | 'fehler'

export interface Mailergebnis {
  messageId: string
  absender: string
  betreff: string
  art: Mailart
  /** Klartext für die Statusanzeige */
  text: string
  belege: Eingangsergebnis[]
  emlSha256: string | null
}

function gesehen(d: Dienste, messageId: string, sha: string): boolean {
  return !!d.db.eins('SELECT 1 AS ja FROM postfach_gesehen WHERE message_id = ? AND anhang_sha256 = ?', [messageId, sha])
}

/** Absenderfilter: leer = alle; sonst exakte Adresse oder Domain mit „@beispiel.de“. */
export function absenderErlaubt(absender: string, filter: readonly string[]): boolean {
  const liste = filter.map((f) => f.trim().toLowerCase()).filter(Boolean)
  if (liste.length === 0) return true
  const a = absender.toLowerCase()
  return liste.some((f) => (f.startsWith('@') ? a.endsWith(f) : a === f))
}

/** Verarbeitet eine Roh-Mail (aus IMAP oder als .eml-Datei). */
export async function verarbeiteMail(d: Dienste, roh: Uint8Array, e: Pick<PostfachEinstellungen, 'emlAufbewahren' | 'nurVonAbsendern'>): Promise<Mailergebnis> {
  const leer = { messageId: '', absender: '', betreff: '', belege: [], emlSha256: null }
  if (roh.length > MAIL_HOECHSTENS_BYTES) return { ...leer, art: 'fehler', text: 'Die E-Mail ist größer als 50 MB und wird nicht verarbeitet.' }
  let mail: Mail
  try {
    mail = await zerlegeMail(roh, d.uhr())
  } catch {
    return { ...leer, art: 'fehler', text: 'Die E-Mail lässt sich nicht lesen.' }
  }
  const basis = { messageId: mail.messageId, absender: mail.absender, betreff: mail.betreff, belege: [] as Eingangsergebnis[], emlSha256: null as string | null }
  if (!absenderErlaubt(mail.absender, e.nurVonAbsendern)) return { ...basis, art: 'gefiltert', text: `Absender ${mail.absender || 'unbekannt'} steht nicht in der Liste; die E-Mail bleibt liegen.` }
  if (mail.anhaenge.length > MAIL_HOECHSTENS_ANHAENGE) {
    return { ...basis, art: 'fehler', text: `Die E-Mail hat ${mail.anhaenge.length} Anhänge; verarbeitet werden höchstens ${MAIL_HOECHSTENS_ANHAENGE}. Bitte von Hand hochladen.` }
  }
  // R23 Punkt 3: nur XML und PDF; Bilder nicht automatisch
  const kandidaten = mail.anhaenge.filter((a) => a.art === 'xml' || a.art === 'pdf')
  if (kandidaten.length === 0) return { ...basis, art: 'ohne-beleg', text: 'Keine Rechnung im Anhang (kein XML, keine PDF).' }
  const neu = kandidaten.filter((a) => !gesehen(d, mail.messageId, a.sha256))
  if (neu.length === 0) return { ...basis, art: 'bekannt', text: 'Schon verarbeitet.' }

  // Roh-Mail nur, wenn mindestens ein Anhang ein neuer Beleg wird (R23 Punkt 5)
  const liefertBeleg = neu.some((a) => pruefeAnnahme(a.bytes).ok && !d.belege.mitOriginalHash(a.sha256))
  let eml: { sha256: string; pfad: string } | null = null
  if (liefertBeleg && e.emlAufbewahren) {
    eml = await d.ablage.speichereInhalt(roh, 'eml')
    d.db.aendern('INSERT OR IGNORE INTO dateien (pfad, sha256, art, mime_typ, bytes, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [eml.pfad, eml.sha256, 'eml', 'message/rfc822', roh.length, d.uhr().toISOString()])
  }
  const belege: Eingangsergebnis[] = []
  for (const a of neu) {
    const quelle = { art: 'imap' as const, messageId: mail.messageId, absender: mail.absender, betreff: mail.betreff, empfangenAm: mail.empfangenAm, emlSha256: eml?.sha256 ?? null }
    belege.push(await nimmAn(d, { name: a.name, bytes: a.bytes }, quelle, { art: 'system', dienst: 'imap' }))
    d.db.aendern('INSERT OR IGNORE INTO postfach_gesehen (message_id, anhang_sha256, gesehen_am) VALUES (?, ?, ?)', [mail.messageId, a.sha256, d.uhr().toISOString()])
  }
  const angenommen = belege.filter((b) => b.ok).length
  return {
    ...basis,
    emlSha256: eml?.sha256 ?? null,
    belege,
    art: 'belege',
    text: angenommen ? `${angenommen} Beleg${angenommen === 1 ? '' : 'e'} übernommen.` : `Kein neuer Beleg: ${belege.map((b) => b.text).filter(Boolean).join(' ')}`,
  }
}
