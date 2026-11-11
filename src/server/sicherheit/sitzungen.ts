/**
 * Sitzungen (Spezifikation 8): zufälliges Token im Cookie (HttpOnly, SameSite=Strict, Secure
 * unter HTTPS), serverseitig nur als SHA-256 gespeichert, 8 h Leerlauf-Ablauf. Im Speicher:
 * nach einem Neustart meldet man sich neu an.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Uuid } from '../../fach/typen.ts'

export const COOKIE = 'bb_sitzung'
export const LEERLAUF_MS = 8 * 60 * 60 * 1000

interface Sitzung {
  benutzerId: Uuid
  letzteAktivitaet: number
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

export class Sitzungen {
  private readonly sitzungen = new Map<string, Sitzung>()
  private readonly jetzt: () => number

  constructor(jetzt: () => number = Date.now) {
    this.jetzt = jetzt
  }

  oeffnen(benutzerId: Uuid): string {
    const token = randomBytes(32).toString('base64url')
    this.sitzungen.set(hash(token), { benutzerId, letzteAktivitaet: this.jetzt() })
    return token
  }

  /** Benutzer zur Sitzung; verlängert die Sitzung. Abgelaufene Sitzungen werden entfernt. */
  pruefen(token: string | undefined): Uuid | null {
    if (!token) return null
    const schluessel = hash(token)
    const s = this.sitzungen.get(schluessel)
    if (!s) return null
    if (this.jetzt() - s.letzteAktivitaet > LEERLAUF_MS) {
      this.sitzungen.delete(schluessel)
      return null
    }
    s.letzteAktivitaet = this.jetzt()
    return s.benutzerId
  }

  schliessen(token: string | undefined): void {
    if (token) this.sitzungen.delete(hash(token))
  }
}

/**
 * Anmeldesperre (Spezifikation 8): nach 5 Fehlversuchen je Anmeldename innerhalb von 15 Minuten
 * ist der Name 15 Minuten gesperrt, auch für das richtige Passwort.
 */
export class Anmeldesperre {
  static readonly FENSTER_MS = 15 * 60 * 1000
  static readonly VERSUCHE = 5
  private readonly fehlversuche = new Map<string, number[]>()
  private readonly jetzt: () => number

  constructor(jetzt: () => number = Date.now) {
    this.jetzt = jetzt
  }

  private aktuelle(name: string): number[] {
    const grenze = this.jetzt() - Anmeldesperre.FENSTER_MS
    const liste = (this.fehlversuche.get(name.toLowerCase()) ?? []).filter((t) => t > grenze)
    this.fehlversuche.set(name.toLowerCase(), liste)
    return liste
  }

  /** Millisekunden bis zum Ende der Sperre, 0 wenn nicht gesperrt. */
  gesperrtFuer(name: string): number {
    const liste = this.aktuelle(name)
    if (liste.length < Anmeldesperre.VERSUCHE) return 0
    return Math.max(0, liste.at(-1)! + Anmeldesperre.FENSTER_MS - this.jetzt())
  }

  fehlversuch(name: string): void {
    this.aktuelle(name).push(this.jetzt())
  }

  erfolg(name: string): void {
    this.fehlversuche.delete(name.toLowerCase())
  }
}
