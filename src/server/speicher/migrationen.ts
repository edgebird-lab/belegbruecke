/**
 * Schema der Datenbank (Spezifikation 7.5), versioniert über PRAGMA user_version. Tabellen sind
 * STRICT; komplexe Strukturen liegen als JSON-Spalte, Such- und Schlüsselfelder als eigene Spalten.
 * Neue Migrationen nur anhängen, nie bestehende ändern.
 */
import type { Datenbank } from './db.ts'

export interface Migration {
  version: number
  beschreibung: string
  sql: string
}

export const MIGRATIONEN: Migration[] = [
  {
    version: 1,
    beschreibung: 'Grundschema Version 0.1',
    sql: `
CREATE TABLE einstellungen (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
) STRICT;

CREATE TABLE benutzer (
  id TEXT PRIMARY KEY,
  anmeldename TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  passwort_hash TEXT NOT NULL,
  aktiv INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1)),
  angelegt_am TEXT NOT NULL
) STRICT;

CREATE TABLE dateien (
  pfad TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  art TEXT NOT NULL CHECK (art IN ('original', 'eml', 'bericht', 'export')),
  mime_typ TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  angelegt_am TEXT NOT NULL
) STRICT;
CREATE INDEX dateien_sha256 ON dateien (sha256);

CREATE TABLE lieferanten (
  id TEXT PRIMARY KEY,
  schluessel TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kreditor_konto INTEGER UNIQUE,
  json TEXT NOT NULL
) STRICT;

CREATE TABLE belege (
  id TEXT PRIMARY KEY,
  laufnummer INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('eingegangen', 'geprueft', 'kontiert', 'freigegeben', 'exportiert', 'abgelehnt')),
  eingang_am TEXT NOT NULL,
  original_sha256 TEXT NOT NULL,
  xml_sha256 TEXT,
  belegart TEXT,
  lieferant_schluessel TEXT,
  lieferant_id TEXT REFERENCES lieferanten (id),
  rechnungsnummer TEXT,
  rechnungsdatum TEXT,
  brutto_cent INTEGER,
  monat TEXT,
  suche TEXT NOT NULL DEFAULT '',
  exportlauf_id TEXT,
  json TEXT NOT NULL,
  geaendert_am TEXT NOT NULL
) STRICT;
CREATE INDEX belege_original ON belege (original_sha256);
CREATE INDEX belege_xml ON belege (xml_sha256);
CREATE INDEX belege_lieferant ON belege (lieferant_schluessel);
CREATE INDEX belege_status ON belege (status);
CREATE INDEX belege_monat ON belege (monat);

CREATE TABLE kontierungsregeln (
  lieferant_id TEXT NOT NULL REFERENCES lieferanten (id),
  steuerkategorie TEXT NOT NULL,
  steuersatz TEXT NOT NULL,
  sachkonto INTEGER NOT NULL,
  bu_schluessel TEXT,
  anzahl INTEGER NOT NULL,
  zuletzt TEXT NOT NULL,
  PRIMARY KEY (lieferant_id, steuerkategorie, steuersatz)
) STRICT;

CREATE TABLE sachkonten (
  nummer INTEGER PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  automatikkonto INTEGER NOT NULL DEFAULT 0 CHECK (automatikkonto IN (0, 1)),
  aktiv INTEGER NOT NULL DEFAULT 1 CHECK (aktiv IN (0, 1))
) STRICT;

CREATE TABLE exportlaeufe (
  id TEXT PRIMARY KEY,
  monat TEXT NOT NULL,
  nachtrag_nr INTEGER NOT NULL,
  json TEXT NOT NULL,
  UNIQUE (monat, nachtrag_nr)
) STRICT;

CREATE TABLE protokoll (
  nr INTEGER PRIMARY KEY,
  zeitpunkt TEXT NOT NULL,
  json TEXT NOT NULL,
  vorgaenger_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TRIGGER protokoll_kein_update BEFORE UPDATE ON protokoll
  BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;
CREATE TRIGGER protokoll_kein_delete BEFORE DELETE ON protokoll
  BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;

CREATE TABLE sicherheitslog (
  id INTEGER PRIMARY KEY,
  zeitpunkt TEXT NOT NULL,
  ereignis TEXT NOT NULL,
  anmeldename TEXT,
  ip TEXT,
  json TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE INDEX sicherheitslog_zeit ON sicherheitslog (zeitpunkt);

CREATE TABLE postfach_gesehen (
  message_id TEXT NOT NULL,
  anhang_sha256 TEXT NOT NULL,
  gesehen_am TEXT NOT NULL,
  PRIMARY KEY (message_id, anhang_sha256)
) STRICT;
`,
  },
]

/** Wendet fehlende Migrationen an, jede in einer eigenen Transaktion. */
export function migriere(db: Datenbank): number {
  const aktuell = db.eins<{ user_version: number }>('PRAGMA user_version')!.user_version
  let stand = aktuell
  for (const m of MIGRATIONEN) {
    if (m.version <= stand) continue
    db.transaktion(() => {
      db.ausfuehren(m.sql)
      db.ausfuehren(`PRAGMA user_version = ${m.version}`)
    })
    stand = m.version
  }
  return stand
}
