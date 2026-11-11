/**
 * Selbst signiertes Testzertifikat für 127.0.0.1 und localhost, zur Laufzeit erzeugt (ASN.1 DER von
 * Hand, Signatur mit node:crypto). So braucht der IMAP-Testserver weder OpenSSL noch einen
 * Schlüssel im Repo. Nur für Tests.
 */
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'

function laenge(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const bytes: number[] = []
  for (let r = n; r > 0; r >>= 8) bytes.unshift(r & 0xff)
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

const tlv = (tag: number, inhalt: Buffer) => Buffer.concat([Buffer.from([tag]), laenge(inhalt.length), inhalt])
const folge = (...teile: Buffer[]) => tlv(0x30, Buffer.concat(teile))
const menge = (...teile: Buffer[]) => tlv(0x31, Buffer.concat(teile))
const kontext = (n: number, inhalt: Buffer) => tlv(0xa0 | n, inhalt)

function oid(text: string): Buffer {
  const [a, b, ...rest] = text.split('.').map(Number)
  const bytes = [40 * a + b]
  for (const n of rest) {
    const teil: number[] = [n & 0x7f]
    for (let r = n >> 7; r > 0; r >>= 7) teil.unshift((r & 0x7f) | 0x80)
    bytes.push(...teil)
  }
  return tlv(0x06, Buffer.from(bytes))
}

function ganzzahl(b: Buffer): Buffer {
  return tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b)
}

/** UTCTime bis 2049, danach GeneralizedTime (RFC 5280, 4.1.2.5). */
function zeit(d: Date): Buffer {
  const iso = d.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return d.getUTCFullYear() < 2050 ? tlv(0x17, Buffer.from(`${iso.slice(2)}Z`)) : tlv(0x18, Buffer.from(`${iso}Z`))
}

function pem(art: string, der: Buffer): string {
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n')
  return `-----BEGIN ${art}-----\n${b64}${b64.endsWith('\n') ? '' : '\n'}-----END ${art}-----\n`
}

export interface Testzertifikat {
  /** privater Schlüssel (PKCS#8, PEM) */
  key: string
  /** Zertifikat (PEM); als `ca` beim Client zugleich Vertrauensanker */
  cert: string
}

export function erzeugeTestzertifikat(name = 'localhost'): Testzertifikat {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const spki = publicKey.export({ type: 'spki', format: 'der' })
  const algorithmus = folge(oid('1.2.840.10045.4.3.2')) // ecdsa-with-SHA256
  const dn = folge(menge(folge(oid('2.5.4.3'), tlv(0x0c, Buffer.from(name)))))
  const jetzt = Date.now()
  const gueltig = folge(zeit(new Date(jetzt - 86_400_000)), zeit(new Date(jetzt + 5 * 365 * 86_400_000)))
  const alternativ = folge(oid('2.5.29.17'), tlv(0x04, folge(tlv(0x82, Buffer.from('localhost')), tlv(0x87, Buffer.from([127, 0, 0, 1])))))
  const tbs = folge(kontext(0, ganzzahl(Buffer.from([2]))), ganzzahl(randomBytes(12)), algorithmus, dn, gueltig, dn, spki, kontext(3, folge(alternativ)))
  const signatur = sign('sha256', tbs, privateKey)
  const zertifikat = folge(tbs, algorithmus, tlv(0x03, Buffer.concat([Buffer.from([0]), signatur])))
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), cert: pem('CERTIFICATE', zertifikat) }
}
