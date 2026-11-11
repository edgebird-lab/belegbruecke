/**
 * Passwörter mit scrypt (Spezifikation 8): N = 2^17, r = 8, p = 1, Salt 16 Byte, maxmem 256 MiB
 * (OWASP-Mindestwerte). Format: "scrypt$N=131072$r=8$p=1$<salt b64>$<hash b64>".
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const N = 131072
const R = 8
const P = 1
const LAENGE = 64
const MAXMEM = 256 * 1024 * 1024

function ableiten(passwort: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, fehler) => {
    scrypt(passwort.normalize('NFC'), salt, LAENGE, { N: n, r, p, maxmem: MAXMEM }, (e, schluessel) => (e ? fehler(e) : ok(schluessel)))
  })
}

export async function hashePasswort(passwort: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await ableiten(passwort, salt, N, R, P)
  return `scrypt$N=${N}$r=${R}$p=${P}$${salt.toString('base64')}$${hash.toString('base64')}`
}

/** Prüft in konstanter Zeit; unbekannte Formate sind nie gültig. */
export async function pruefePasswort(passwort: string, gespeichert: string): Promise<boolean> {
  const t = /^scrypt\$N=(\d+)\$r=(\d+)\$p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(gespeichert)
  if (!t) return false
  const erwartet = Buffer.from(t[5], 'base64')
  const ist = await ableiten(passwort, Buffer.from(t[4], 'base64'), Number(t[1]), Number(t[2]), Number(t[3]))
  return ist.length === erwartet.length && timingSafeEqual(ist, erwartet)
}

/** Fester Vergleichswert, damit eine Anmeldung mit unbekanntem Namen genauso lange dauert. */
export const ATTRAPPE = `scrypt$N=${N}$r=${R}$p=${P}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(LAENGE).toString('base64')}`
