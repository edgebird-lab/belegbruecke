/**
 * Postfach-Zeitgeber (R23 Punkt 1): Abruf alle `intervallMinuten` und auf Knopfdruck, nie zwei
 * gleichzeitig. Hält den Status für die Anzeige im Eingang (Schritt 5.4). Fehler beenden den Dienst
 * nicht; sie stehen in Klartext im Status.
 */
import type { Dienste } from '../dienste/kontext.ts'
import { rufeAb, testeVerbindung, type Abrufbericht, type Verbindungsoptionen, type Zugang } from './abruf.ts'
import type { Schluesselbund } from './schluessel.ts'

export interface Postfachstatus {
  aktiv: boolean
  eingerichtet: boolean
  laeuft: boolean
  letzterAbruf: Abrufbericht | null
  naechsterAbruf: string | null
}

export class Postfachdienst {
  private readonly d: Dienste
  private readonly schluessel: Schluesselbund
  private readonly optionen: Verbindungsoptionen
  private zeitgeber: ReturnType<typeof setInterval> | null = null
  private laufend: Promise<Abrufbericht> | null = null
  private letzter: Abrufbericht | null = null
  private faellig: number | null = null

  constructor(d: Dienste, schluessel: Schluesselbund, optionen: Verbindungsoptionen = {}) {
    this.d = d
    this.schluessel = schluessel
    this.optionen = optionen
  }

  /** Zugangsdaten aus den Einstellungen; null, wenn das Postfach aus oder unvollständig ist. */
  zugang(): Zugang | null {
    const p = this.d.einstellungen.lies().postfach
    if (!p.server || !p.benutzer || !p.passwortVerschluesselt) return null
    return { server: p.server, port: p.port, benutzer: p.benutzer, passwort: this.schluessel.entschluessele(p.passwortVerschluesselt) }
  }

  verschluessele(passwort: string): string {
    return this.schluessel.verschluessele(passwort)
  }

  async teste(z: Zugang, ordner: string) {
    return testeVerbindung(z, ordner, this.optionen)
  }

  status(): Postfachstatus {
    const p = this.d.einstellungen.lies().postfach
    return {
      aktiv: p.aktiv,
      eingerichtet: !!(p.server && p.benutzer && p.passwortVerschluesselt),
      laeuft: this.laufend !== null,
      letzterAbruf: this.letzter,
      naechsterAbruf: p.aktiv && this.faellig !== null ? new Date(this.faellig).toISOString() : null,
    }
  }

  /** Ein Abruf jetzt; läuft schon einer, wartet der Aufruf auf dessen Ergebnis. */
  async abrufen(): Promise<Abrufbericht> {
    if (this.laufend) return this.laufend
    const e = this.d.einstellungen.lies().postfach
    const jetzt = this.d.uhr()
    let z: Zugang | null
    try {
      z = this.zugang()
    } catch {
      z = null
      this.letzter = { zeitpunkt: jetzt.toISOString(), ok: false, fehler: 'Das gespeicherte Passwort lässt sich nicht entschlüsseln (Schlüsseldatei fehlt oder ist neu). Bitte das Passwort erneut eingeben.', nachrichten: 0, belege: 0, mails: [] }
      return this.letzter
    }
    if (!z) {
      this.letzter = { zeitpunkt: jetzt.toISOString(), ok: false, fehler: 'Das Postfach ist nicht vollständig eingerichtet (Server, Benutzer und Passwort).', nachrichten: 0, belege: 0, mails: [] }
      return this.letzter
    }
    this.laufend = rufeAb(this.d, z, e, this.optionen)
    try {
      this.letzter = await this.laufend
      return this.letzter
    } finally {
      this.laufend = null
      this.faellig = this.d.uhr().getTime() + e.intervallMinuten * 60_000
    }
  }

  /** Prüft alle 30 Sekunden, ob ein Abruf fällig ist. */
  starte(): void {
    if (this.zeitgeber) return
    this.faellig = this.d.uhr().getTime() + 5_000
    this.zeitgeber = setInterval(() => void this.vielleicht(), 30_000)
    this.zeitgeber.unref()
  }

  async vielleicht(): Promise<void> {
    const p = this.d.einstellungen.lies().postfach
    if (!p.aktiv || this.laufend || this.faellig === null || this.d.uhr().getTime() < this.faellig) return
    try {
      await this.abrufen()
    } catch (e) {
      console.error('Postfach:', e)
    }
  }

  async stoppe(): Promise<void> {
    if (this.zeitgeber) clearInterval(this.zeitgeber)
    this.zeitgeber = null
    await this.laufend?.catch(() => undefined)
  }
}
