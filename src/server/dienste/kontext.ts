/** Alle Dienste des Servers an einer Stelle; Tests bauen sie mit eigenem Prüfer und eigener Uhr. */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Syntax } from '../../fach/typen.ts'
import type { Ausfuehrer } from '../../pruefung/eingang.ts'
import { Postfachdienst } from '../postfach/dienst.ts'
import { Schluesselbund, standardSchluesselDatei } from '../postfach/schluessel.ts'
import { Ablage } from '../speicher/ablage.ts'
import { Belegspeicher } from '../speicher/belege.ts'
import { Datenbank } from '../speicher/db.ts'
import { Exportspeicher, Lieferantenspeicher, Regelspeicher, Sachkontenspeicher } from '../speicher/kontierung.ts'
import { Protokoll } from '../speicher/protokoll.ts'
import { Benutzerspeicher, Einstellungsspeicher } from '../speicher/stammdaten.ts'
import { Anmeldesperre, Sitzungen } from '../sicherheit/sitzungen.ts'

export interface Pruefer extends Ausfuehrer {
  ansicht(text: string, syntax: Syntax): Promise<string>
  beenden?(): Promise<void>
}

export interface Dienste {
  datenOrdner: string
  db: Datenbank
  ablage: Ablage
  protokoll: Protokoll
  belege: Belegspeicher
  einstellungen: Einstellungsspeicher
  benutzer: Benutzerspeicher
  lieferanten: Lieferantenspeicher
  sachkonten: Sachkontenspeicher
  regeln: Regelspeicher
  exporte: Exportspeicher
  /** IMAP-Abruf mit Zeitgeber (Phase 5); startet erst mit starte() */
  postfach: Postfachdienst
  pruefer: Pruefer
  sitzungen: Sitzungen
  sperre: Anmeldesperre
  uhr: () => Date
  version: string
  /** Host-Kopfzeilen, die der Server beantwortet (Schutz vor DNS-Rebinding) */
  erlaubteHosts: string[]
  /** unter HTTPS: Sitzungs-Cookie mit Secure */
  https: boolean
  sicherheitslog(ereignis: string, angaben: { anmeldename?: string | null; ip?: string | null; daten?: Record<string, unknown> }): void
}

export function leseVersion(): string {
  const paket = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }
  return paket.version
}

export interface Dienstoptionen {
  datenOrdner: string
  port: number
  pruefer: Pruefer
  uhr?: () => Date
  version?: string
  https?: boolean
  /** Schlüsseldatei für das Postfach-Passwort; Standard neben dem Datenordner (BB_SCHLUESSEL_DATEI) */
  schluesselDatei?: string
  /** zusätzlicher Vertrauensanker für IMAP, nur für den Testserver (BB_IMAP_CA) */
  imapCa?: string
}

export function erzeugeDienste(o: Dienstoptionen): Dienste {
  mkdirSync(o.datenOrdner, { recursive: true })
  const db = new Datenbank(join(o.datenOrdner, 'belegbruecke.sqlite'))
  const uhr = o.uhr ?? (() => new Date())
  const d: Dienste = {
    datenOrdner: o.datenOrdner,
    db,
    ablage: new Ablage(o.datenOrdner),
    protokoll: new Protokoll(db, uhr),
    belege: new Belegspeicher(db),
    einstellungen: new Einstellungsspeicher(db),
    benutzer: new Benutzerspeicher(db),
    lieferanten: new Lieferantenspeicher(db),
    sachkonten: new Sachkontenspeicher(db),
    regeln: new Regelspeicher(db),
    exporte: new Exportspeicher(db),
    pruefer: o.pruefer,
    sitzungen: new Sitzungen(() => uhr().getTime()),
    sperre: new Anmeldesperre(() => uhr().getTime()),
    uhr,
    version: o.version ?? leseVersion(),
    erlaubteHosts: [`127.0.0.1:${o.port}`, `localhost:${o.port}`],
    https: o.https ?? false,
    sicherheitslog(ereignis, angaben) {
      db.aendern('INSERT INTO sicherheitslog (zeitpunkt, ereignis, anmeldename, ip, json) VALUES (?, ?, ?, ?, ?)', [
        uhr().toISOString(),
        ereignis,
        angaben.anmeldename ?? null,
        angaben.ip ?? null,
        JSON.stringify(angaben.daten ?? {}),
      ])
    },
    postfach: null as unknown as Postfachdienst,
  }
  d.postfach = new Postfachdienst(d, new Schluesselbund(o.schluesselDatei ?? standardSchluesselDatei(o.datenOrdner)), { ca: o.imapCa })
  return d
}

/** Sicherheitslog aufräumen (Spezifikation 8): IP nach 7 Tagen, übrige Einträge nach 90 Tagen. */
export function raeumeSicherheitslogAuf(d: Dienste): void {
  const jetzt = d.uhr().getTime()
  const tag = 24 * 60 * 60 * 1000
  d.db.aendern('UPDATE sicherheitslog SET ip = NULL WHERE ip IS NOT NULL AND zeitpunkt < ?', [new Date(jetzt - 7 * tag).toISOString()])
  d.db.aendern('DELETE FROM sicherheitslog WHERE zeitpunkt < ?', [new Date(jetzt - 90 * tag).toISOString()])
}
