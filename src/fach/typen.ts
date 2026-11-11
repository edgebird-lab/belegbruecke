/**
 * Datenmodell der Belegbrücke (Spezifikation, Abschnitt 4). Vollständig für Version 0.1;
 * Erweiterungen später nur additiv. Gespeicherte JSON-Strukturen tragen `formatVersion`.
 * Ohne Node-APIs und ohne React.
 */

// ---------- Grundtypen ----------
/** Betrag in Cent, Ganzzahl. 12,34 € = 1234. Negativ erlaubt. */
export type Cent = number
/** Kalenderdatum ISO 8601, z. B. "2026-11-11" */
export type Datum = string
/** Zeitpunkt ISO 8601 in UTC, z. B. "2026-11-11T09:30:00.000Z" */
export type Zeitpunkt = string
/** SHA-256 als 64 Hex-Zeichen, Kleinbuchstaben */
export type Sha256 = string
/** UUID v4 in Großbuchstaben, 36 Zeichen. Beleg-IDs dienen zugleich als DATEV-Beleg-GUID. */
export type Uuid = string

// ---------- Einstellungen ----------
export interface Anschrift {
  zeile1?: string;        // BT-35 / BT-50
  zeile2?: string;        // BT-36 / BT-51
  plz?: string;           // BT-38 / BT-53
  ort?: string;           // BT-37 / BT-52
  land?: string;          // BT-40 / BT-55, ISO 3166-1 alpha-2
}

export interface Firma {
  name: string;                 // wie auf Rechnungen an uns
  namensVarianten: string[];    // weitere Schreibweisen
  anschrift: Anschrift
  ustId?: string;               // ohne Leerzeichen, z. B. "DE123456789"
  steuernummer?: string
  kleinunternehmer: boolean;    // dann Steuerfall "ohne-vorsteuer", außer AE, K, G, L, M (R13)
}

export type Steuerfall = "vorsteuer-19" | "vorsteuer-7" | "ohne-vorsteuer" | "sonderfall"
export type Kontenrahmen = "SKR03" | "SKR04"
export type Exportmodus = "buchungsstapel-und-belege" | "nur-belege"

export interface DatevEinstellungen {
  beraternummer: number;        // 1001 bis 9999999
  mandantennummer: number;      // 1 bis 99999
  wjBeginnMonatTag: string;     // "01-01" = Wirtschaftsjahr ab 1. Januar
  sachkontenlaenge: number;     // 4 bis 8, Standard 4
  kontenrahmen: Kontenrahmen
  kreditorenVon: number;        // Standard 70000 (Sachkontenlänge + 1 Stellen)
  kreditorenBis: number;        // Standard 99999
  buSchluessel: Record<Steuerfall, string | null>; // Vorbelegung R13
  exportmodus: Exportmodus
  duoPaket: boolean;            // nur nach Schritt 0.6 einschaltbar
  exportiertVon: string;        // Kopffeld 9, max. 25 Zeichen
  zeichensatz: "windows-1252" | "utf-8"
}

export interface PostfachEinstellungen {
  aktiv: boolean
  server: string
  port: number;                 // 993, nur TLS
  benutzer: string
  passwortVerschluesselt: string; // AES-256-GCM, Base64(iv | tag | daten)
  ordner: string;               // Standard "INBOX"
  zielOrdner: string;           // Standard "Belegbruecke/verarbeitet"
  intervallMinuten: number;     // 5 bis 1440, Standard 15
  nurVonAbsendern: string[];    // leer = alle Absender
  emlAufbewahren: boolean;      // Standard true (offene Frage 7)
}

export interface Aufbewahrungsregel {
  id: "buchungsbeleg"
  jahre: number;                // 8
  rechtsgrundlage: string;      // "§ 147 Abs. 3 AO; § 14b Abs. 1 UStG"
  gueltigAb: Datum;             // "2025-01-01"
}

export interface Einstellungen {
  formatVersion: 1
  firma: Firma
  datev: DatevEinstellungen
  postfach: PostfachEinstellungen
  aufbewahrung: Aufbewahrungsregel
  eingerichtetAm: Zeitpunkt | null
}

export interface Benutzer {
  id: Uuid
  anmeldename: string
  name: string
  passwortHash: string;         // "scrypt$N=131072$r=8$p=1$<salt b64>$<hash b64>"
  aktiv: boolean
  angelegtAm: Zeitpunkt
}

// ---------- Eingang und Format ----------
export type Quelle =
  | { art: "upload"; benutzerId: Uuid }
  | {
      art: "imap"
      messageId: string
      absender: string
      betreff: string
      empfangenAm: Zeitpunkt
      emlSha256: Sha256 | null;   // Roh-Mail, falls aufbewahrt
    }
// Scans von Papierbelegen kommen per Upload (Formaterkennung container "bild").

export interface Originaldatei {
  sha256: Sha256;               // über die empfangenen Bytes
  dateiname: string;            // nur Anzeige, bereinigt
  mimeTyp: "application/xml" | "application/pdf" | "image/jpeg" | "image/png"
  groesseBytes: number
  speicherpfad: string;         // relativ zum Datenordner, z. B. "originale/0e/0efa…cb.xml"
}

export type Syntax = "ubl-invoice" | "ubl-creditnote" | "cii"
export type Profil =
  | "xrechnung-3.0" | "xrechnung-3.0-extension" | "xrechnung-3.0-cvd"
  | "en16931" | "zugferd-basic" | "zugferd-extended"
  | "zugferd-minimum" | "zugferd-basic-wl" | "unbekannt"
export type Belegart = "e-rechnung" | "sonstige-rechnung"

export interface Formaterkennung {
  belegart: Belegart
  container: "xml" | "pdf-mit-xml" | "pdf-ohne-xml" | "bild"
  syntax: Syntax | null
  profil: Profil | null
  spezifikationsKennung: string | null;  // BT-24 wörtlich
  eingebettetAls: string | null;         // z. B. "factur-x.xml"
  xmlSha256: Sha256 | null;              // XML-Teil, bei XML-Datei = Originalhash
  zeichensatz: string | null;            // erkannter Zeichensatz des XML
  grund: string | null;                  // Klartext, warum keine E-Rechnung
}

// ---------- Prüfung ----------
export type Stufe = "fehler" | "warnung" | "hinweis"
export type Befundquelle =
  | "sicherheit" | "xml" | "xsd" | "szenario" | "en16931" | "xrechnung"
  | "ustg" | "plausibilitaet" | "dublette" | "pdf"
export type Fehlerklasse = "formatfehler" | "geschaeftsregelfehler" | "inhaltsfehler" | "keine"

export interface Befund {
  quelle: Befundquelle
  regelId: string;              // "BR-CO-17", "BR-DE-15", "XSD", "USTG-14-4-2", "PLAUS-IBAN"
  stufe: Stufe
  fehlerklasse: Fehlerklasse
  ustRelevant: boolean | "unklar"
  ort: string | null;           // XPath (Schematron) oder "Zeile:Spalte" (XSD)
  btBezug: string[];            // z. B. ["BT-117", "BT-116"]
  originaltext: string | null;  // Meldung des Regelwerks, unverändert
  klartext: string;             // deutsche Erklärung
  handlung: string;             // was zu tun ist
}

export type Pflichtangabe =
  | "name-anschrift-leistender" | "name-anschrift-empfaenger" | "steuernummer-oder-ustid"
  | "ausstellungsdatum" | "rechnungsnummer" | "menge-und-art" | "leistungszeitpunkt"
  | "entgelt-nach-steuersaetzen" | "steuersatz-und-betrag" | "angabe-gutschrift"

export interface Pflichtangabenpruefung {
  regelwerk: "§ 14 Abs. 4 UStG" | "§ 33 UStDV" | "§ 34a UStDV"
  ergebnisse: {
    angabe: Pflichtangabe
    status: "erfuellt" | "fehlt" | "pruefen" | "nicht-anwendbar"
    fundstelle: string[];       // BT-Nummern, die geprüft wurden
  }[]
  eigeneFirmaAlsEmpfaenger: "ja" | "nein" | "unklar"
}

export interface Pruefergebnis {
  formatVersion: 1
  zeitpunkt: Zeitpunkt
  pruefprogramm: string;        // "belegbruecke 0.1.0"
  artefakte: { konfiguration: string; enSchematron: string; xrSchematron: string }
  szenario: string | null;      // Name aus scenarios.xml oder eigenes Szenario
  wohlgeformt: boolean
  xsdGueltig: boolean | null;   // null = nicht geprüft
  angenommen: boolean;          // wie KoSIT-Bericht (R6)
  eingeschraenktGeprueft: boolean; // z. B. ZUGFeRD EXTENDED
  befunde: Befund[]
  pflichtangaben: Pflichtangabenpruefung | null
  dauerMs: number
}

// ---------- Rechnungsdaten (Auszug aus EN 16931) ----------
export interface Partei {
  name: string;                 // BT-27 / BT-44
  handelsname: string | null;   // BT-28 / BT-45
  kennungen: string[];          // BT-29 / BT-46
  ustId: string | null;         // BT-31 / BT-48, ohne Leerzeichen
  steuernummer: string | null;  // BT-32 (nur Verkäufer)
  anschrift: Anschrift;         // BG-5 / BG-8
  email: string | null;         // BT-43 / BT-58
}

export interface Position {
  nr: string;                   // BT-126
  bezeichnung: string;          // BT-153
  menge: string;                // BT-129, Dezimaltext
  einheit: string;              // BT-130
  nettoCent: Cent;              // BT-131
  steuerkategorie: string;      // BT-151
  steuersatz: string | null;    // BT-152, normalisiert ("19", "7", "0")
  zeitraum: { von: Datum | null; bis: Datum | null } | null; // BG-26
}

export interface Steuerzeile {
  kategorie: string;            // BT-118: S, Z, E, AE, K, G, O, L, M
  satz: string;                 // BT-119, normalisiert
  bemessungCent: Cent;          // BT-116
  steuerCent: Cent;             // BT-117
  befreiungsgrund: string | null; // BT-120
  befreiungsCode: string | null;  // BT-121
}

export interface Anhang {
  kennung: string;              // BT-122
  beschreibung: string | null;  // BT-123
  dateiname: string | null;     // Attribut zu BT-125
  mimeTyp: string | null
  groesseBytes: number | null
  externeAdresse: string | null; // BT-124: nur anzeigen, nie abrufen
}

export interface Rechnungsdaten {
  rechnungsnummer: string;      // BT-1
  rechnungsdatum: Datum;        // BT-2
  typcode: string;              // BT-3
  waehrung: string;             // BT-5
  faelligAm: Datum | null;      // BT-9
  kaeuferreferenz: string | null; // BT-10
  bestellreferenz: string | null; // BT-13
  vorherigeRechnung: string | null; // BT-25
  bemerkungen: string[];        // BT-22
  zahlungsbedingungen: string | null; // BT-20
  verkaeufer: Partei
  kaeufer: Partei
  /** BT-63, USt-IdNr. des Steuervertreters (BG-11); additiv ergänzt für R8 Nr. 2 */
  steuervertreterUstId?: string | null
  lieferdatum: Datum | null;    // BT-72
  abrechnungszeitraum: { von: Datum | null; bis: Datum | null } | null; // BG-14
  positionen: Position[];       // BG-25
  steuern: Steuerzeile[];       // BG-23
  summen: {
    positionenNettoCent: Cent;  // BT-106
    abschlaegeCent: Cent;       // BT-107
    zuschlaegeCent: Cent;       // BT-108
    nettoCent: Cent;            // BT-109
    steuerCent: Cent;           // BT-110
    bruttoCent: Cent;           // BT-112
    vorausbezahltCent: Cent;    // BT-113
    rundungCent: Cent;          // BT-114
    zahlbetragCent: Cent;       // BT-115
  }
  zahlung: { artCode: string | null; iban: string | null }; // BT-81, BT-84
  anhaenge: Anhang[];           // BG-24
}

/** Erfassung von Hand bei sonstigen Rechnungen (R16) */
export interface Handerfassung {
  lieferantName: string
  lieferantUstId: string | null
  lieferantSteuernummer: string | null
  rechnungsnummer: string
  rechnungsdatum: Datum
  leistungsdatum: Datum | null
  steuern: { kategorie: "S" | "E" | "AE"; satz: string; bemessungCent: Cent; steuerCent: Cent }[]
  bruttoCent: Cent
}

// ---------- Lieferanten und Kontierung ----------
export interface Lieferant {
  id: Uuid
  schluessel: string;           // R10, z. B. "ustid:DE123456789"
  name: string
  ustId: string | null
  steuernummer: string | null
  anschrift: Anschrift
  kreditorKonto: number | null; // vergeben bei der ersten Freigabe
  angelegtAm: Zeitpunkt
}

export interface Sachkonto {
  nummer: number
  bezeichnung: string
  automatikkonto: boolean;      // Vorsteuer automatisch, dann kein BU-Schlüssel
  aktiv: boolean
}

export interface Kontierungszeile {
  bruttoCent: Cent;             // Umsatz der Buchungszeile, immer ≥ 0
  steuerkategorie: string
  steuersatz: string
  steuerfall: Steuerfall
  sachkonto: number | null
  buSchluessel: string | null
  buchungstext: string;         // max. 60 Zeichen
}

export interface Kontierung {
  zeilen: Kontierungszeile[];   // leer bei nurBeleg
  nurBeleg: boolean;            // true bei BT-3 = 389: keine Buchungszeile, nur Beleg (R12, R19)
  sollHaben: "H" | "S";         // bezogen auf das Kreditorenkonto (R12 Punkt 6)
  herkunft: "historie" | "manuell"
  historieAnzahl: number;       // Zahl früherer Belege, aus denen der Vorschlag stammt
  manuellPruefen: string[];     // Gründe in Klartext
}

export interface Kontierungsregel {
  lieferantId: Uuid
  steuerkategorie: string
  steuersatz: string
  sachkonto: number
  buSchluessel: string | null
  anzahl: number
  zuletzt: Zeitpunkt
}

// ---------- Beleg ----------
export type Belegstatus =
  | "eingegangen" | "geprueft" | "kontiert" | "freigegeben" | "exportiert" | "abgelehnt"

export interface Dublettenhinweis {
  stufe: "identische-datei" | "gleiche-rechnung" | "aehnliche-rechnung"
  andererBelegId: Uuid
  grund: string
}

export interface Beleg {
  formatVersion: 1
  id: Uuid
  laufnummer: number;           // Anzeige "B-00042"
  status: Belegstatus
  quelle: Quelle
  eingangAm: Zeitpunkt
  original: Originaldatei
  format: Formaterkennung
  daten: Rechnungsdaten | null; // null, wenn nicht auslesbar
  handerfassung: Handerfassung | null
  pruefung: Pruefergebnis | null
  pruefberichtSha256: Sha256 | null
  dubletten: Dublettenhinweis[]
  dublettenEntscheidung: { ergebnis: "keine-dublette" | "dublette"; benutzerId: Uuid; am: Zeitpunkt } | null
  lieferantId: Uuid | null
  kontierung: Kontierung | null
  inhaltGeprueft: boolean;      // Bestätigung nach BMF Rn. 35a
  freigabe: { benutzerId: Uuid; am: Zeitpunkt; begruendung: string | null } | null
  ablehnung: { benutzerId: Uuid; am: Zeitpunkt; grund: string } | null
  exportlaufId: Uuid | null
  aufbewahrenBis: Datum
}

// ---------- Übergabe ----------
export interface Exportlauf {
  formatVersion: 1
  id: Uuid
  monat: string;                // "2026-10" = Monat des Belegdatums
  nachtragNr: number;           // 0 = Erstlauf
  erzeugtAm: Zeitpunkt
  benutzerId: Uuid
  belegIds: Uuid[]
  dateien: { name: string; sha256: Sha256; bytes: number }[]
  summeBruttoCent: Cent
  summenJeSteuersatz: { kategorie: string; satz: string; bruttoCent: Cent }[]
  kettenanker: { nr: number; hash: Sha256 }
  /** additiv für das Übergabeprotokoll (R21 Punkt 5): Mandant und Modus zum Zeitpunkt des Exports */
  beraternummer?: number
  mandantennummer?: number
  /** Name der eigenen Firma (Mandant) zum Zeitpunkt des Exports */
  firma?: string
  exportmodus?: Exportmodus
  /** Belege ohne Buchung (Typ 389), Buchung durch die Kanzlei */
  nurBelegIds?: Uuid[]
  /** Hinweise des Exports, z. B. ersetzte Zeichen */
  hinweise?: string[]
}

// ---------- Protokoll ----------
export type Aktion =
  | "eingang" | "eingang-verworfen" | "pruefung" | "dublette-entschieden"
  | "lieferant-zugeordnet" | "kontiert" | "freigegeben" | "freigabe-zurueckgenommen"
  | "abgelehnt" | "ablehnung-aufgehoben" | "exportiert" | "einstellungen-geaendert"
  | "kette-geprueft" | "prueferexport"

export type Akteur =
  | { art: "benutzer"; id: Uuid }
  | { art: "system"; dienst: "imap" | "pruefung" | "export" }

export interface Protokolleintrag {
  nr: number;                   // 1, 2, 3 … lückenlos
  zeitpunkt: Zeitpunkt
  akteur: Akteur
  aktion: Aktion
  belegId: Uuid | null
  daten: Record<string, unknown>; // nur string, Ganzzahl, boolean, null, Array, Objekt
  vorgaengerHash: Sha256;       // 64 × "0" beim ersten Eintrag
  hash: Sha256;                 // R17
}

// ---------- Hilfstypen der Umsetzung ----------

/** SHA-256 über Bytes als 64 Hex-Zeichen; in src/fach von außen hereingereicht (node:crypto bzw. Web Crypto). */

export type Sha256Funktion = (daten: Uint8Array) => Sha256
