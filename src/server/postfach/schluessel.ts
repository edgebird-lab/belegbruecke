/**
 * Postfach-Passwort verschlüsselt (Spezifikation 8): AES-256-GCM, gespeichert als
 * Base64(iv | tag | daten). Der 32-Byte-Schlüssel liegt in einer eigenen Datei außerhalb des
 * Datenordners (`BB_SCHLUESSEL_DATEI`, Standard neben dem Datenordner), Rechte nur für den Dienst.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const IV = 12
const TAG = 16

/** Standardort der Schlüsseldatei: neben dem Datenordner, nie darin. */
export function standardSchluesselDatei(datenOrdner: string): string {
  return process.env.BB_SCHLUESSEL_DATEI ?? join(dirname(datenOrdner), `${basename(datenOrdner)}.schluessel`)
}

export class Schluesselbund {
  private readonly datei: string
  private schluessel: Buffer | null = null

  constructor(datei: string) {
    this.datei = datei
  }

  /** Lädt den Schlüssel oder legt ihn beim ersten Gebrauch an. */
  private hole(): Buffer {
    if (this.schluessel) return this.schluessel
    if (existsSync(this.datei)) {
      const s = readFileSync(this.datei)
      if (s.length !== 32) throw new Error(`Die Schlüsseldatei ${this.datei} ist beschädigt (erwartet 32 Byte).`)
      this.schluessel = s
    } else {
      mkdirSync(dirname(this.datei), { recursive: true })
      const s = randomBytes(32)
      writeFileSync(this.datei, s, { flag: 'wx', mode: 0o600 })
      try {
        chmodSync(this.datei, 0o600)
      } catch {
        // Windows kennt nur den Schreibschutz; die Datei liegt im Benutzerprofil
      }
      this.schluessel = s
    }
    return this.schluessel
  }

  verschluessele(text: string): string {
    const iv = randomBytes(IV)
    const c = createCipheriv('aes-256-gcm', this.hole(), iv)
    const daten = Buffer.concat([c.update(text, 'utf8'), c.final()])
    return Buffer.concat([iv, c.getAuthTag(), daten]).toString('base64')
  }

  /** Entschlüsselt; wirft bei falschem Schlüssel oder veränderten Daten. */
  entschluessele(wert: string): string {
    const roh = Buffer.from(wert, 'base64')
    if (roh.length < IV + TAG) throw new Error('Verschlüsseltes Passwort ist unvollständig.')
    const d = createDecipheriv('aes-256-gcm', this.hole(), roh.subarray(0, IV))
    d.setAuthTag(roh.subarray(IV, IV + TAG))
    return Buffer.concat([d.update(roh.subarray(IV + TAG)), d.final()]).toString('utf8')
  }
}
