# Belegbrücke – Spezifikation Version 0.1

E-Rechnungs-Eingang, GoBD-Archiv und DATEV-Übergabe für Kleinbetriebe.

Stand: 11.11.2026 · Status: Entwurf, fachlich geprüft (Prüfvermerk am Ende), zur Freigabe durch Robin · Bauweise wie [Prozesslotse](../../prozesslotse/README.md)

Kennzeichnung in diesem Dokument: **[geprüft]** = an der genannten Quelle gelesen. **[ungeprüft]** = Kenntnisstand, vor dem Bau an der Primärquelle zu bestätigen (siehe Phase 0).

---

## 1. Ziel und Nutzer

Die Belegbrücke nimmt eingehende E-Rechnungen an, prüft sie nach EN 16931 und XRechnung und erklärt Fehler in Klartext. Sie archiviert das Original unverändert, mit Prüfbericht und einem Protokoll, das eine SHA-256-Hashkette sichert. Einmal im Monat erzeugt sie für die Steuerkanzlei einen DATEV-Buchungsstapel und ein Belegpaket. Nutzer sind Solo-Selbständige und Kleinbetriebe ohne Buchhaltungs-Abo, deren Kanzlei mit DATEV arbeitet; erster Nutzer ist olbricht-digital. Seit 1.1.2025 müssen inländische Unternehmer E-Rechnungen empfangen können (UStAE 14.1 Abs. 5 i. d. F. BMF 15.10.2025) [geprüft].

Leitlinien wie beim Prozesslotsen: geführter Assistent statt leerer Formulare, Fachlogik ohne React und vollständig getestet. Bezeichner und Oberfläche auf Deutsch, Hell- und Dunkelmodus, Druckansicht als PDF. Keine KI, keine Cloud, keine Telemetrie.

---

## 2. Umfang

### 2.1 Version 0.1 (MVP)

| Bereich | Version 0.1 kann |
| --- | --- |
| Eingang | Upload (Ziehen und Ablegen, mehrere Dateien) und ein IMAP-Postfach mit Abruf alle 15 min |
| Formate | XRechnung 3.0 (UBL Invoice, UBL CreditNote, CII; Standard, Extension, CVD), EN 16931 (UBL, CII), ZUGFeRD/Factur-X als PDF mit eingebettetem XML (Profile EN 16931, XRECHNUNG, BASIC, EXTENDED) |
| Keine E-Rechnung | erkennt MINIMUM, BASIC WL, ZUGFeRD 1.0 und PDF ohne XML als „sonstige Rechnung“; Erfassung von Hand ohne OCR |
| Prüfung | XSD und Schematron mit den offiziellen KoSIT- und CEN-Artefakten, ohne Java zur Laufzeit; Annahme-Logik wie der KoSIT-Prüfbericht |
| Klartext | jeder Befund mit deutscher Erklärung, Einordnung Format-, Geschäftsregel- oder Inhaltsfehler (BMF Rn. 6a, 6b, 35a) und Handlungsvorschlag |
| Pflichtangaben | § 14 Abs. 4 UStG bzw. §§ 33, 34a UStDV, Empfänger ist die eigene Firma, Plausibilität (Steuersatz, IBAN, Datum) |
| Ansicht | KoSIT-Visualisierung als HTML in einer Sandbox, PDF-Ansicht bei ZUGFeRD, Anhänge herunterladen |
| Dubletten | drei Stufen: identische Datei, gleiche Rechnung, ähnliche Rechnung |
| Kontierung | Lieferanten mit Kreditorenkonto, Vorschlag aus der Lieferantenhistorie, Aufteilung je Steuersatz, BU-Schlüssel aus den Einstellungen |
| Freigabe | Freigeben oder Ablehnen mit Begründung; Freigabe friert die Belegdaten ein |
| Archiv | Original unverändert (inhaltsadressiert, schreibgeschützt), Prüfbericht je Beleg, Protokoll mit Hashkette, Kettenprüfung, Aufbewahrungsfrist je Beleg |
| Übergabe | monatlich: EXTF-Buchungsstapel, Belegpaket (ZIP), Übergabeprotokoll mit Kettenanker; DUO-Paket nur nach Bestätigung des Formats (Schritt 0.6) |
| Prüfer | Export aller Originale, Daten und Protokolle als ZIP für den Datenzugriff der Betriebsprüfung |
| Betrieb | lokal auf Robins Laptop (Node 24, Start per Skript, Oberfläche im Browser); Anmeldung für 1 bis 3 Benutzer |

**Schnittlinie:** Wird die Zeit knapp, rückt das Postfach (Phase 5) in Version 0.2. Keine andere Phase hängt davon ab; der Upload deckt den Eingang ab.

### 2.2 Ausdrücklich später

- Ausgangsrechnungen erzeugen und prüfen.
- Kontierung per lokaler KI als Rückfall; OCR für Papier und PDF ohne XML.
- Zahlstatus aus Kontoumsätzen (CAMT.053 oder Local Finance AI).
- Direkter Upload über DATEV-Online-APIs; Versand an die Kanzlei per E-Mail.
- Mehrere Mandanten, Rollen (Lesezugang für die Kanzlei), Vier-Augen-Freigabe.
- Löschen nach Fristablauf. Frühester Fall: Belege von 2025 ab 1.1.2034.
- PDF/A-3-Prüfung (z. B. veraPDF), Signaturprüfung, RFC-3161-Zeitstempel für den Kettenanker.
- Fremdwährung, automatische Anzahlungsverrechnung, Automatik für § 13b UStG und EU-Fälle.
- Peppol-Empfang, OAuth2 für Microsoft 365 und Gmail, USt-IdNr.-Bestätigung beim BZSt.
- Docker-Betrieb hinter Caddy auf dem VPS und Windows-Programm mit Tauri (Phase 7, nur nach Freigabe).

### 2.3 Abweichungen von der Ausgangsidee

| Ausgangsidee | Entscheidung | Grund |
| --- | --- | --- |
| Kotlin/Ktor auf der JVM | TypeScript mit Node 24 | gleiche Sprache wie der Prozesslotse; Tauri-Weg ohne JVM; kleineres Abbild. Java nur als Referenz in Tests (Abschnitt 7.1) |
| PostgreSQL | SQLite (`node:sqlite`) plus Dateiablage | eine Datei, kein Dienst, für Server und Windows-Programm gleich |
| Mustangproject im Betrieb | nur Referenz in Tests (ZUGFeRD-Extraktion) | Laufzeit ohne Java |
| lokale KI als Rückfall | später | Regeln aus der Historie zuerst; MVP ohne KI wie der Prozesslotse |
| Zahlstatus aus Local Finance AI | später | eigenes Projekt, Schnittstelle unklar |
| „8 Jahre nach BEG IV“ | bestätigt, plus Regel für den Fristbeginn | § 147 Abs. 3 und 4 AO, § 14b Abs. 1 UStG [geprüft] |
| Abgrenzung zu Lexware, sevDesk u. a. | nicht übernommen | in dieser Recherche nicht geprüft |

---

## 3. Fachliche Grundlagen

Alle Rechtsquellen abgerufen am 10./11.11.2026. Die App liefert technische Befunde, keine Steuerberatung.

### 3.1 Recht und Verwaltung

| Thema | Kernaussage für die App | Quelle, Stand |
| --- | --- | --- |
| E-Rechnung | Rechnung in einem strukturierten elektronischen Format, das elektronische Verarbeitung ermöglicht; Format nach der europäischen Norm oder vereinbart mit verlustfreier Extraktion | § 14 Abs. 1 UStG [geprüft] |
| Pflicht im Inland | E-Rechnung bei Leistungen zwischen inländischen Unternehmern | § 14 Abs. 2 Satz 2 Nr. 1 UStG [geprüft] |
| Pflichtangaben | Nr. 1 bis 10: Namen und Anschriften, StNr oder USt-IdNr, Datum, Nummer, Menge und Art, Leistungszeitpunkt, Entgelt je Steuersatz, Steuersatz und -betrag oder Befreiungshinweis, ggf. „Gutschrift“ | § 14 Abs. 4 Satz 1 UStG [geprüft] |
| Kleinbetrag | bis 250 € Gesamtbetrag reduzierte Angaben; gilt nicht für §§ 3c, 6a, 13b UStG; darf immer sonstige Rechnung sein (Satz 4) | § 33 UStDV [geprüft]; BMF Rn. 22 [geprüft] |
| Kleinunternehmer als Lieferant | eigene Pflichtangaben: ohne Rechnungsnummer, Leistungszeitpunkt und Steuerausweis, dafür Entgelt in einer Summe mit Hinweis auf § 19 UStG; darf immer sonstige Rechnung sein; Fahrausweise ebenso (§ 34 UStDV) | § 34a UStDV [geprüft]; BMF Rn. 22 [geprüft] |
| Übergangszeit | sonstige Rechnung (Papier, anderes Format nur mit Zustimmung) noch erlaubt: für Umsätze 2025 und 2026 bis 31.12.2026; für Umsätze 2027 bis 31.12.2027, wenn der Aussteller im Vorjahr höchstens 800.000 € Gesamtumsatz hatte; EDI bis 31.12.2027 | § 27 Abs. 38 UStG [geprüft] |
| Aufbewahrung Rechnungen | 8 Jahre; Beginn mit Ablauf des Kalenderjahrs der Ausstellung; gilt für alle Rechnungen, deren Frist am 31.12.2024 noch lief | § 14b Abs. 1 UStG, § 27 Abs. 40 UStG [geprüft] |
| Aufbewahrung Buchungsbelege | 8 Jahre (Abs. 1 Nr. 4); Beginn mit Schluss des Kalenderjahrs der Entstehung; kein Ablauf, solange die Festsetzungsfrist offen ist | § 147 Abs. 3 und 4 AO [geprüft] |
| Veränderungsverbot | ursprünglicher Inhalt muss feststellbar bleiben; Daten jederzeit verfügbar und lesbar | § 146 Abs. 4 und 5 AO [geprüft] |
| Formatfehler | Datei verletzt Syntax oder technische Vorgaben → sonstige Rechnung | BMF 15.10.2025, Rn. 6a [geprüft] |
| Geschäftsregelfehler | Verstoß gegen Geschäftsregeln, z. B. fehlendes BT-10 oder falsch berechneter Steuerbetrag | BMF 15.10.2025, Rn. 6b [geprüft] |
| Inhaltsfehler | Verstoß gegen §§ 14, 14a UStG; Geschäftsregelfehler zu anderen Inhalten (z. B. BT-10) sind umsatzsteuerlich unbeachtlich; Validierung ersetzt nicht die eigene Prüfung; auf das technische Ergebnis einer geeigneten Validierung darf man sich bei kaufmännischer Sorgfalt verlassen; den Validierungsbericht aufzubewahren „bietet sich an“ (Empfehlung, keine Pflicht) | BMF 15.10.2025, Rn. 35a [geprüft] |
| Pflichtangaben im XML | alle Pflichtangaben im strukturierten Teil; Verweis auf Anhang genügt nicht; externer Link genügt nie | BMF 15.10.2025, Rn. 35 [geprüft] |
| ZUGFeRD | ab Version 2.0.1 E-Rechnung, ausgenommen MINIMUM und BASIC-WL | UStAE 14.1 Abs. 14 i. d. F. BMF 15.10.2025 [geprüft] |
| Hybrides Format | strukturierter Teil führt; bei Abweichung gilt er; Vorsteuer nur aus dem strukturierten Teil | UStAE 14.4 Abs. 3, 14c.1 Abs. 4a i. d. F. BMF 15.10.2025 [geprüft] |
| Empfang | E-Mail genügt, kein eigenes Postfach nötig | UStAE 14.1 Abs. 5 i. d. F. BMF 15.10.2025 [geprüft] |
| Format der Aufbewahrung | im empfangenen Format; strukturierter Teil unversehrt in ursprünglicher Form; qualifizierte Signatur mit aufbewahren | UStAE 14b.1 Abs. 1 und 6 i. d. F. BMF 15.10.2025 [geprüft] |
| GoBD und E-Rechnung | strukturierter Teil genügt; PDF-Teil nur bei abweichenden steuerrelevanten Angaben; Format wie empfangen; inhaltliche statt bildlicher Übereinstimmung | GoBD Rz. 118, 119, 125, 131 i. d. F. 14.07.2025 (Rz. 185: sofort anzuwenden) [geprüft] |

**Folgerung für die App:** Sie bewahrt die **ganze empfangene Datei** auf (XML oder vollständiges PDF), dazu den Prüfbericht. Das deckt Rz. 131 GoBD, UStAE 14b.1 und eingebettete Signaturen ab. Beim Postfach-Eingang wird zusätzlich die Roh-Mail (.eml) aufbewahrt, sofern Robin zustimmt (offene Frage 7). Nach GoBD Rz. 121 (Fassung 2019) muss eine E-Mail, die nur als Transportmittel dient, nicht aufbewahrt werden **[ungeprüft]**; die Quelle war bei der Prüfung nicht erreichbar.

### 3.2 Formate und Prüfartefakte

| Artefakt | Version, Datum | Lizenz | Quelle |
| --- | --- | --- | --- |
| XRechnung | 3.0.2 | – | KoSIT, über die Artefakte unten |
| KoSIT-Validator (Java, nur Tests) | 1.6.3, 20.08.2026 | Apache-2.0 | github.com/itplr-kosit/validator [geprüft] |
| Validator-Konfiguration XRechnung | v2026-08-31 (XRechnung 3.0.2), 02.09.2026 | Apache-2.0 | github.com/itplr-kosit/validator-configuration-xrechnung [geprüft] |
| darin: CEN-Schematron EN 16931 | 1.3.16 | EUPL-1.2 | laut `scenarios.xml` der Konfiguration [geprüft] |
| darin: XRechnung-Schematron | 2.6.0 | Apache-2.0 | github.com/itplr-kosit/xrechnung-schematron [geprüft] |
| CEN-Artefakte (eigenständig) | 1.3.17, 12.10.2026 | EUPL-1.2 | github.com/ConnectingEurope/eInvoicing-EN16931 [geprüft]; MVP nutzt die Fassung aus der KoSIT-Konfiguration |
| XRechnung-Visualisierung | v2026-10-13 | Apache-2.0 | github.com/itplr-kosit/xrechnung-visualization [geprüft] |
| XRechnung-Testsuite | v2026-08-31, 86 positive Testdateien | Apache-2.0 | github.com/itplr-kosit/xrechnung-testsuite [geprüft] |
| ZUGFeRD | 2.5.2, 04.08.2026 | „kostenfrei verfügbar“, Lizenz der Beispiele nicht angegeben | ferd-net.de [geprüft] |
| Mustang-CLI (Java, nur Tests) | 2.26.0, 25.08.2026 | Apache-2.0 | github.com/ZUGFeRD/mustangproject [geprüft] |

Prüfsummen der geladenen KoSIT-Releases (SHA-256, am 11.11.2026 berechnet):

| Datei | SHA-256 |
| --- | --- |
| `xrechnung-3.0.2-validator-configuration-2026-08-31.zip` | `2530cd107c414511c5d0462ec10f886910395abfca820db82e83d70bf01221a8` |
| `xrechnung-3.0.2-visualization-2026-10-13.zip` | `ecf3913029218822ee4c90a86a3e23689768bf3568a061cf9bc742115e52264e` |
| `xrechnung-3.0.2-testsuite-2026-08-31.zip` | `1e81ef7563e0fa04c0e0b0631318a7e0843a3c0beb57d83ef95ac0c4a095e3d7` |

Aufbau der Konfiguration [geprüft]: `scenarios.xml` mit 11 Szenarien (XRechnung UBL Invoice, Extension, CVD; UBL CreditNote, CVD; CII, Extension, CVD; EN 16931 UBL Invoice, UBL CreditNote, CII). Jedes Szenario nennt ein XSD, zwei bzw. ein Schematron-XSLT, ein Bericht-XSLT und teils `customLevel`-Anpassungen. Dokumente ohne passendes Szenario erhalten den „Default Report“ und werden abgelehnt. Die Schematron-XSLT sind XSLT 2.0 (EN16931-UBL 1,08 MB, EN16931-CII 0,93 MB, XRechnung je etwa 0,18 MB). Die Visualisierung arbeitet zweistufig: UBL/CII → Zwischenmodell `xr:invoice` → HTML mit eingebettetem JavaScript; beide Stufen sind XSLT 2.0. Das Zwischenmodell benennt jedes Element nach dem Business Term und trägt dessen Nummer (z. B. `xr:Invoice_number`, BT-1).

### 3.3 DATEV

Die DATEV-Entwicklerseiten und die DATEV-Wissensplattform ließen sich mit den Werkzeugen dieser Recherche nicht lesen (Inhalt nur per JavaScript). Die Feldliste unten stammt deshalb aus der quelloffenen Bibliothek `ledermann/datev` (MIT), die auf DATEV-Dok.-Nr. 1036228 verweist. **[ungeprüft]**, Abgleich in Schritt 0.6 und Probeimport in Schritt 4.7.

| Merkmal | Wert |
| --- | --- |
| Datei | CSV, Trennzeichen `;`, Zeilenende CR LF, Zeichensatz Windows-1252 (UTF-8 ist offene Frage 5) |
| Zeile 1 | Kopfzeile mit 31 Feldern, beginnt mit `"EXTF";700;21;"Buchungsstapel";13` |
| Zeile 2 | Spaltenüberschriften der 125 Buchungsfelder |
| ab Zeile 3 | je Buchung eine Zeile mit 125 Feldern |
| Beträge | Dezimalkomma, ohne Tausenderpunkt, immer positiv; Richtung über Soll/Haben-Kennzeichen |
| Belegdatum | `TTMM`; das Jahr kommt aus dem Wirtschaftsjahr |
| Belegfeld 1 | max. 36 Zeichen, nur `A–Z a–z 0–9 $ & % * + - /`; Schlüssel für offene Posten |
| Beleglink | `BEDI "<GUID>"` für Belege in DATEV Unternehmen online (Belege online) |

XML-Schnittstelle online (Belegbilder für DATEV Unternehmen online): Laut einem Forenhinweis beschreibt DATEV-Dok.-Nr. 1035732 das Format. Kenntnisstand: ZIP mit `document.xml` als Inhaltsverzeichnis und den Belegdateien. **[ungeprüft]**; vor dem Bau Formatbeschreibung und XSD beschaffen (Schritt 0.6).

### 3.4 Berechnungen

Alle Beträge in Cent (Ganzzahl). EN 16931 erlaubt auf Belegebene höchstens 2 Nachkommastellen.

| Größe | Formel | Bezug |
| --- | --- | --- |
| Brutto je Steuerzeile | BT-116 + BT-117 | BG-23 |
| Summe der Buchungszeilen | Σ (BT-116 + BT-117) = BT-109 + BT-110 = BT-112 | BR-CO-13 mit BR-S-08, BR-E-08, BR-AE-08 usw. (ergibt Σ BT-116 = BT-109), BR-CO-14, BR-CO-15 [geprüft im Schematron] |
| Steuerbetrag je Kategorie | BT-117 = BT-116 × BT-119 / 100, auf 2 Stellen gerundet | BR-CO-17 [geprüft im Schematron] |
| Zahlbetrag | BT-115 = BT-112 − BT-113 + BT-114 | Anzeige; Buchung über BT-112 |
| Kleinbetrag | BT-112 ≤ 250,00 € und keine Kategorie AE oder K | § 33 UStDV |
| Aufbewahren bis | 31.12. des Jahres (J + 8), J = spätestes Jahr aus Rechnungs-, Eingangs- und Freigabedatum | § 147 Abs. 3, 4 AO; § 14b Abs. 1 UStG; Regel R15 |

---

## 4. Datenmodell (TypeScript)

Datei `src/fach/typen.ts`. Vollständig für Version 0.1; Erweiterungen später nur additiv. Gespeicherte JSON-Strukturen tragen `formatVersion`.

```ts
// ---------- Grundtypen ----------
/** Betrag in Cent, Ganzzahl. 12,34 € = 1234. Negativ erlaubt. */
export type Cent = number;
/** Kalenderdatum ISO 8601, z. B. "2026-11-11" */
export type Datum = string;
/** Zeitpunkt ISO 8601 in UTC, z. B. "2026-11-11T09:30:00.000Z" */
export type Zeitpunkt = string;
/** SHA-256 als 64 Hex-Zeichen, Kleinbuchstaben */
export type Sha256 = string;
/** UUID v4 in Großbuchstaben, 36 Zeichen. Beleg-IDs dienen zugleich als DATEV-Beleg-GUID. */
export type Uuid = string;

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
  anschrift: Anschrift;
  ustId?: string;               // ohne Leerzeichen, z. B. "DE123456789"
  steuernummer?: string;
  kleinunternehmer: boolean;    // dann Steuerfall "ohne-vorsteuer", außer AE, K, G, L, M (R13)
}

export type Steuerfall = "vorsteuer-19" | "vorsteuer-7" | "ohne-vorsteuer" | "sonderfall";
export type Kontenrahmen = "SKR03" | "SKR04";
export type Exportmodus = "buchungsstapel-und-belege" | "nur-belege";

export interface DatevEinstellungen {
  beraternummer: number;        // 1001 bis 9999999
  mandantennummer: number;      // 1 bis 99999
  wjBeginnMonatTag: string;     // "01-01" = Wirtschaftsjahr ab 1. Januar
  sachkontenlaenge: number;     // 4 bis 8, Standard 4
  kontenrahmen: Kontenrahmen;
  kreditorenVon: number;        // Standard 70000 (Sachkontenlänge + 1 Stellen)
  kreditorenBis: number;        // Standard 99999
  buSchluessel: Record<Steuerfall, string | null>; // Vorbelegung R13
  exportmodus: Exportmodus;
  duoPaket: boolean;            // nur nach Schritt 0.6 einschaltbar
  exportiertVon: string;        // Kopffeld 9, max. 25 Zeichen
  zeichensatz: "windows-1252" | "utf-8";
}

export interface PostfachEinstellungen {
  aktiv: boolean;
  server: string;
  port: number;                 // 993, nur TLS
  benutzer: string;
  passwortVerschluesselt: string; // AES-256-GCM, Base64(iv | tag | daten)
  ordner: string;               // Standard "INBOX"
  zielOrdner: string;           // Standard "Belegbruecke/verarbeitet"
  intervallMinuten: number;     // 5 bis 1440, Standard 15
  nurVonAbsendern: string[];    // leer = alle Absender
  emlAufbewahren: boolean;      // Standard true (offene Frage 7)
}

export interface Aufbewahrungsregel {
  id: "buchungsbeleg";
  jahre: number;                // 8
  rechtsgrundlage: string;      // "§ 147 Abs. 3 AO; § 14b Abs. 1 UStG"
  gueltigAb: Datum;             // "2025-01-01"
}

export interface Einstellungen {
  formatVersion: 1;
  firma: Firma;
  datev: DatevEinstellungen;
  postfach: PostfachEinstellungen;
  aufbewahrung: Aufbewahrungsregel;
  eingerichtetAm: Zeitpunkt | null;
}

export interface Benutzer {
  id: Uuid;
  anmeldename: string;
  name: string;
  passwortHash: string;         // "scrypt$N=131072$r=8$p=1$<salt b64>$<hash b64>"
  aktiv: boolean;
  angelegtAm: Zeitpunkt;
}

// ---------- Eingang und Format ----------
export type Quelle =
  | { art: "upload"; benutzerId: Uuid }
  | {
      art: "imap";
      messageId: string;
      absender: string;
      betreff: string;
      empfangenAm: Zeitpunkt;
      emlSha256: Sha256 | null;   // Roh-Mail, falls aufbewahrt
    };
// Scans von Papierbelegen kommen per Upload (Formaterkennung container "bild").

export interface Originaldatei {
  sha256: Sha256;               // über die empfangenen Bytes
  dateiname: string;            // nur Anzeige, bereinigt
  mimeTyp: "application/xml" | "application/pdf" | "image/jpeg" | "image/png";
  groesseBytes: number;
  speicherpfad: string;         // relativ zum Datenordner, z. B. "originale/0e/0efa…cb.xml"
}

export type Syntax = "ubl-invoice" | "ubl-creditnote" | "cii";
export type Profil =
  | "xrechnung-3.0" | "xrechnung-3.0-extension" | "xrechnung-3.0-cvd"
  | "en16931" | "zugferd-basic" | "zugferd-extended"
  | "zugferd-minimum" | "zugferd-basic-wl" | "unbekannt";
export type Belegart = "e-rechnung" | "sonstige-rechnung";

export interface Formaterkennung {
  belegart: Belegart;
  container: "xml" | "pdf-mit-xml" | "pdf-ohne-xml" | "bild";
  syntax: Syntax | null;
  profil: Profil | null;
  spezifikationsKennung: string | null;  // BT-24 wörtlich
  eingebettetAls: string | null;         // z. B. "factur-x.xml"
  xmlSha256: Sha256 | null;              // XML-Teil, bei XML-Datei = Originalhash
  zeichensatz: string | null;            // erkannter Zeichensatz des XML
  grund: string | null;                  // Klartext, warum keine E-Rechnung
}

// ---------- Prüfung ----------
export type Stufe = "fehler" | "warnung" | "hinweis";
export type Befundquelle =
  | "sicherheit" | "xml" | "xsd" | "szenario" | "en16931" | "xrechnung"
  | "ustg" | "plausibilitaet" | "dublette" | "pdf";
export type Fehlerklasse = "formatfehler" | "geschaeftsregelfehler" | "inhaltsfehler" | "keine";

export interface Befund {
  quelle: Befundquelle;
  regelId: string;              // "BR-CO-17", "BR-DE-15", "XSD", "USTG-14-4-2", "PLAUS-IBAN"
  stufe: Stufe;
  fehlerklasse: Fehlerklasse;
  ustRelevant: boolean | "unklar";
  ort: string | null;           // XPath (Schematron) oder "Zeile:Spalte" (XSD)
  btBezug: string[];            // z. B. ["BT-117", "BT-116"]
  originaltext: string | null;  // Meldung des Regelwerks, unverändert
  klartext: string;             // deutsche Erklärung
  handlung: string;             // was zu tun ist
}

export type Pflichtangabe =
  | "name-anschrift-leistender" | "name-anschrift-empfaenger" | "steuernummer-oder-ustid"
  | "ausstellungsdatum" | "rechnungsnummer" | "menge-und-art" | "leistungszeitpunkt"
  | "entgelt-nach-steuersaetzen" | "steuersatz-und-betrag" | "angabe-gutschrift";

export interface Pflichtangabenpruefung {
  regelwerk: "§ 14 Abs. 4 UStG" | "§ 33 UStDV" | "§ 34a UStDV";
  ergebnisse: {
    angabe: Pflichtangabe;
    status: "erfuellt" | "fehlt" | "pruefen" | "nicht-anwendbar";
    fundstelle: string[];       // BT-Nummern, die geprüft wurden
  }[];
  eigeneFirmaAlsEmpfaenger: "ja" | "nein" | "unklar";
}

export interface Pruefergebnis {
  formatVersion: 1;
  zeitpunkt: Zeitpunkt;
  pruefprogramm: string;        // "belegbruecke 0.1.0"
  artefakte: { konfiguration: string; enSchematron: string; xrSchematron: string };
  szenario: string | null;      // Name aus scenarios.xml oder eigenes Szenario
  wohlgeformt: boolean;
  xsdGueltig: boolean | null;   // null = nicht geprüft
  angenommen: boolean;          // wie KoSIT-Bericht (R6)
  eingeschraenktGeprueft: boolean; // z. B. ZUGFeRD EXTENDED
  befunde: Befund[];
  pflichtangaben: Pflichtangabenpruefung | null;
  dauerMs: number;
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
  mimeTyp: string | null;
  groesseBytes: number | null;
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
  verkaeufer: Partei;
  kaeufer: Partei;
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
  };
  zahlung: { artCode: string | null; iban: string | null }; // BT-81, BT-84
  anhaenge: Anhang[];           // BG-24
}

/** Erfassung von Hand bei sonstigen Rechnungen (R16) */
export interface Handerfassung {
  lieferantName: string;
  lieferantUstId: string | null;
  lieferantSteuernummer: string | null;
  rechnungsnummer: string;
  rechnungsdatum: Datum;
  leistungsdatum: Datum | null;
  steuern: { kategorie: "S" | "E" | "AE"; satz: string; bemessungCent: Cent; steuerCent: Cent }[];
  bruttoCent: Cent;
}

// ---------- Lieferanten und Kontierung ----------
export interface Lieferant {
  id: Uuid;
  schluessel: string;           // R10, z. B. "ustid:DE123456789"
  name: string;
  ustId: string | null;
  steuernummer: string | null;
  anschrift: Anschrift;
  kreditorKonto: number | null; // vergeben bei der ersten Freigabe
  angelegtAm: Zeitpunkt;
}

export interface Sachkonto {
  nummer: number;
  bezeichnung: string;
  automatikkonto: boolean;      // Vorsteuer automatisch, dann kein BU-Schlüssel
  aktiv: boolean;
}

export interface Kontierungszeile {
  bruttoCent: Cent;             // Umsatz der Buchungszeile, immer ≥ 0
  steuerkategorie: string;
  steuersatz: string;
  steuerfall: Steuerfall;
  sachkonto: number | null;
  buSchluessel: string | null;
  buchungstext: string;         // max. 60 Zeichen
}

export interface Kontierung {
  zeilen: Kontierungszeile[];   // leer bei nurBeleg
  nurBeleg: boolean;            // true bei BT-3 = 389: keine Buchungszeile, nur Beleg (R12, R19)
  sollHaben: "H" | "S";         // bezogen auf das Kreditorenkonto (R12 Punkt 6)
  herkunft: "historie" | "manuell";
  historieAnzahl: number;       // Zahl früherer Belege, aus denen der Vorschlag stammt
  manuellPruefen: string[];     // Gründe in Klartext
}

export interface Kontierungsregel {
  lieferantId: Uuid;
  steuerkategorie: string;
  steuersatz: string;
  sachkonto: number;
  buSchluessel: string | null;
  anzahl: number;
  zuletzt: Zeitpunkt;
}

// ---------- Beleg ----------
export type Belegstatus =
  | "eingegangen" | "geprueft" | "kontiert" | "freigegeben" | "exportiert" | "abgelehnt";

export interface Dublettenhinweis {
  stufe: "identische-datei" | "gleiche-rechnung" | "aehnliche-rechnung";
  andererBelegId: Uuid;
  grund: string;
}

export interface Beleg {
  formatVersion: 1;
  id: Uuid;
  laufnummer: number;           // Anzeige "B-00042"
  status: Belegstatus;
  quelle: Quelle;
  eingangAm: Zeitpunkt;
  original: Originaldatei;
  format: Formaterkennung;
  daten: Rechnungsdaten | null; // null, wenn nicht auslesbar
  handerfassung: Handerfassung | null;
  pruefung: Pruefergebnis | null;
  pruefberichtSha256: Sha256 | null;
  dubletten: Dublettenhinweis[];
  dublettenEntscheidung: { ergebnis: "keine-dublette" | "dublette"; benutzerId: Uuid; am: Zeitpunkt } | null;
  lieferantId: Uuid | null;
  kontierung: Kontierung | null;
  inhaltGeprueft: boolean;      // Bestätigung nach BMF Rn. 35a
  freigabe: { benutzerId: Uuid; am: Zeitpunkt; begruendung: string | null } | null;
  ablehnung: { benutzerId: Uuid; am: Zeitpunkt; grund: string } | null;
  exportlaufId: Uuid | null;
  aufbewahrenBis: Datum;
}

// ---------- Übergabe ----------
export interface Exportlauf {
  formatVersion: 1;
  id: Uuid;
  monat: string;                // "2026-10" = Monat des Belegdatums
  nachtragNr: number;           // 0 = Erstlauf
  erzeugtAm: Zeitpunkt;
  benutzerId: Uuid;
  belegIds: Uuid[];
  dateien: { name: string; sha256: Sha256; bytes: number }[];
  summeBruttoCent: Cent;
  summenJeSteuersatz: { kategorie: string; satz: string; bruttoCent: Cent }[];
  kettenanker: { nr: number; hash: Sha256 };
}

// ---------- Protokoll ----------
export type Aktion =
  | "eingang" | "eingang-verworfen" | "pruefung" | "dublette-entschieden"
  | "lieferant-zugeordnet" | "kontiert" | "freigegeben" | "freigabe-zurueckgenommen"
  | "abgelehnt" | "ablehnung-aufgehoben" | "exportiert" | "einstellungen-geaendert"
  | "kette-geprueft" | "prueferexport";

export type Akteur =
  | { art: "benutzer"; id: Uuid }
  | { art: "system"; dienst: "imap" | "pruefung" | "export" };

export interface Protokolleintrag {
  nr: number;                   // 1, 2, 3 … lückenlos
  zeitpunkt: Zeitpunkt;
  akteur: Akteur;
  aktion: Aktion;
  belegId: Uuid | null;
  daten: Record<string, unknown>; // nur string, Ganzzahl, boolean, null, Array, Objekt
  vorgaengerHash: Sha256;       // 64 × "0" beim ersten Eintrag
  hash: Sha256;                 // R17
}
```

Statusübergänge:

| Von | Nach | Auslöser |
| --- | --- | --- |
| eingegangen | geprueft | Prüfung abgeschlossen (automatisch); bei sonstiger Rechnung nach der Handerfassung (R16) |
| geprueft | kontiert | Lieferant (bei `nurBeleg` Geschäftspartner) zugeordnet und alle Zeilen kontiert (bei `nurBeleg` keine Zeilen) |
| kontiert | freigegeben | Freigabe (R14) |
| freigegeben | kontiert | „Freigabe zurücknehmen“, nur vor dem Export |
| freigegeben | exportiert | Übergabe (R21); danach keine Änderung mehr |
| geprueft, kontiert | abgelehnt | Ablehnung mit Grund |
| abgelehnt | geprueft | „Ablehnung aufheben“ |

Jeder Übergang erzeugt einen Protokolleintrag.

---

## 5. Oberfläche und Ablauf

### 5.1 Navigation

Leiste links: **Eingang** (Zähler offene Belege), **Belege**, **Übergabe**, **Archiv**, **Einstellungen**. Beim ersten Start öffnet sich der Einrichtungsassistent. Status nie nur über Farbe: Ampel immer mit Symbol und Text. Ein Schalter „Erklärungen“ blendet Lernhinweise ein, wie der Lernmodus des Prozesslotsen.

### 5.2 Einrichtungsassistent

| Schritt | Fragt | Zeigt | Weiter, wenn |
| --- | --- | --- | --- |
| E1 Firma | „Wie heißt Ihre Firma genau so, wie sie auf Rechnungen an Sie steht?“, Varianten, Anschrift, USt-IdNr. oder Steuernummer, Kleinunternehmer ja/nein | Beispiel, wofür die Angaben dienen (Empfängerprüfung) | Name, Ort und Land gesetzt |
| E2 Kanzlei | Beraternummer, Mandantennummer, Wirtschaftsjahr-Beginn, Kontenrahmen, Sachkontenlänge, Kreditoren-Nummernkreis, Exportmodus | Hinweis „Diese Angaben stehen in jedem Schreiben Ihrer Kanzlei“ | Nummern im gültigen Bereich (R19) |
| E3 Steuerschlüssel und Konten | BU-Schlüssel je Steuerfall (Vorbelegung R13), Sachkonten von Hand oder als CSV, Automatikkonten markieren | Warnung „Mit der Kanzlei abstimmen“ | jeder Steuerfall außer „sonderfall“ hat Schlüssel oder ist bewusst leer |
| E4 Eingang | nur Upload oder zusätzlich Postfach; Server, Benutzer, Passwort, Ordner, Intervall, Roh-Mail aufbewahren | Knopf „Verbindung testen“ mit Ergebnis in Klartext | Test erfolgreich oder Postfach aus |
| E5 Aufbewahrung | nichts; Bestätigung | Regel „8 Jahre ab Jahresende“ mit Quelle, Speicherort, Hinweis auf Sicherung, Haftungshinweis (Abschnitt 8, Rechtliches) | Bestätigt |

Jede Änderung der Einstellungen erzeugt einen Protokolleintrag mit altem und neuem Wert (ohne Passwort).

### 5.3 Beleg-Assistent

Öffnet sich je Beleg aus dem Eingang. Schrittleiste oben wie beim Prozesslotsen.

| Schritt | Fragt | Zeigt |
| --- | --- | --- |
| B1 Eingang | – | Quelle, Dateiname, Größe, erkanntes Format („XRechnung 3.0, UBL“), SHA-256 (gekürzt, ausklappbar), Eingangszeit |
| B2 Prüfen | – | Ampel: grün „gültige E-Rechnung“, gelb „gültig mit Hinweisen“, rot „nicht angenommen“, grau „keine E-Rechnung“. Befunde gruppiert nach Formatfehler, Geschäftsregelfehler, Pflichtangaben, Hinweise. Je Befund: Klartext, Regel-ID, BT-Bezug, Originaltext ausklappbar, Handlung. Knöpfe: „Prüfbericht drucken“, „Text für Rückfrage an den Lieferanten kopieren“ |
| B3 Ansehen | – | links KoSIT-Ansicht (iframe in Sandbox), rechts Eckdaten: Lieferant, Nummer, Datum, Leistungszeitpunkt, Brutto, Steuern je Satz, Fälligkeit, IBAN. Bei ZUGFeRD zusätzlich Reiter „PDF“ mit Hinweis „Maßgeblich ist der XML-Teil“. Anhänge mit Download |
| B4 Zuordnen | „Ist das dieselbe Rechnung wie B-00017?“ (nur bei Dublette); „Neuer Lieferant oder vorhandener?“ | Dublettenvergleich nebeneinander; Lieferantenvorschlag nach Schlüssel (R10); vorgeschlagenes Kreditorenkonto |
| B5 Kontieren | „Wofür war diese Ausgabe?“ je Steuerzeile: Sachkonto aus Kontenplan (Suche, zuletzt genutzte zuerst) | Vorschlag mit Herkunft („aus 3 früheren Rechnungen von …“), BU-Schlüssel, Buchungstext, Summenprüfung, Gründe für „manuell prüfen“ |
| B6 Freigeben | Häkchen „Leistung erhalten, Preise und Mengen geprüft“ (BMF Rn. 35a); bei Fehlern Pflichtbegründung | Zusammenfassung, „aufzubewahren bis“, Knöpfe „Freigeben“ und „Ablehnen…“ (Grund Pflicht) |

Bei einer sonstigen Rechnung ersetzt B3 die Handerfassung (R16): PDF oder Bild links, Formular rechts.

Ampelregel für B2: grün = angenommen und kein Befund der Stufe fehler oder warnung. Gelb = angenommen mit Warnungen, auch aus R8 und R11. Rot = nicht angenommen oder Pflichtangabe fehlt. Grau = sonstige Rechnung. Ein Befund mit `ustRelevant` false trägt den Zusatz „umsatzsteuerlich unbeachtlich“.

### 5.4 Übergabe-Assistent

| Schritt | Fragt | Zeigt |
| --- | --- | --- |
| U1 Zeitraum | Monat (Vorschlag: ältester Monat mit freigegebenen, nicht exportierten Belegen) | Anzahl Belege je Status in diesem Monat; Warnung bei offenen Belegen |
| U2 Prüfen | – | Liste der Belege, Summen je Steuersatz, Sperrgründe (R19) mit Sprung zum Beleg |
| U3 Erzeugen | „Jetzt erzeugen?“ | Dateinamen, Größen, SHA-256 |
| U4 Übergeben | – | Downloads, Übergabeprotokoll in der Druckansicht (Mandant, Zeitraum, Summen, Dateien mit Hash, Kettenanker) |

### 5.5 Archiv

Suche nach Lieferant, Rechnungsnummer, Betrag, Zeitraum, Status und Volltext in Name und E-Mail (für Auskunftsersuchen). Belegdetail mit allen Daten, Prüfbericht, Original-Download und Protokoll des Belegs. Knöpfe „Archiv prüfen“ (R18) und „Prüferexport“ (R22).

### 5.6 Gestaltung

Wie Prozesslotse: Hell und Dunkel nach Systemeinstellung, umschaltbar; Druckansicht für Prüfbericht, Übergabeprotokoll und Kettenbericht; jedes Feld beschriftet; vollständig per Tastatur bedienbar. Beträge im Format `1.234,56 €`, Datum `11.11.2026`.

---

## 6. Regeln, Berechnungen und Prüfungen

Alle Regeln liegen als reine Funktionen in `src/fach` oder `src/pruefung` und sind einzeln getestet. Regel-IDs stehen in Befunden und Tests.

### R1 Annahme und Größen

1. Dateiart nach Inhalt, nicht nach Endung. `%PDF-` am Anfang → PDF. Erstes Zeichen nach optionaler BOM und Leerraum ist `<` → XML. Bytes `FF D8 FF` (JPEG) oder `89 50 4E 47` (PNG) → Bild, nur für die Handerfassung. Sonst Ablehnung „Dateityp nicht unterstützt“.
2. Grenzen: XML ≤ 20 MB, PDF ≤ 30 MB, Bild ≤ 10 MB, E-Mail ≤ 50 MB, höchstens 20 Anhänge je E-Mail. Größere Dateien werden abgelehnt.
3. SHA-256 über die empfangenen Bytes, dann Dublettenstufe 1 (R9), dann Ablage (Abschnitt 7.5).

### R2 XML-Schutz

Nach der Dekodierung (R3) und vor jedem Parser: Enthält der Text `<!DOCTYPE` oder `<!ENTITY`, wird die Datei abgelehnt. Befund `SICHERHEIT-DTD`, Stufe fehler, Formatfehler. E-Rechnungen brauchen keine DTD; die Regel verhindert XXE und Entity-Expansion. Zusätzlich lädt kein Parser externe Ressourcen.

### R3 Zeichensatz

Erkennung über BOM (UTF-8, UTF-16 LE/BE) oder `encoding` der XML-Deklaration, sonst UTF-8. Unterstützt: UTF-8, UTF-16, ISO-8859-1, windows-1252. Dekodierung mit `TextDecoder(…, { fatal: true })`. Fehler → Befund `XML-ZEICHENSATZ`, Formatfehler. Hinweis: `TextDecoder` behandelt ISO-8859-1 nach WHATWG wie windows-1252, und `fatal` greift bei diesen Einbyte-Zeichensätzen nie [geprüft in Node 24.15]. Das ist für Rechnungen unkritisch; ein Test darf hier keinen Fehler erwarten.

### R4 Formaterkennung

Wurzelelement und Namensraum bestimmen die Syntax:

| Syntax | Wurzel | Namensraum |
| --- | --- | --- |
| ubl-invoice | `Invoice` | `urn:oasis:names:specification:ubl:schema:xsd:Invoice-2` |
| ubl-creditnote | `CreditNote` | `urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2` |
| cii | `CrossIndustryInvoice` | `urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100` |

BT-24 steht in UBL in `cbc:CustomizationID`, in CII in `rsm:ExchangedDocumentContext/ram:GuidelineSpecifiedDocumentContextParameter/ram:ID` [geprüft in `scenarios.xml`]. Zuordnung, exakter Textvergleich **ohne** Trimmen, denn auch die `match`-Ausdrücke in `scenarios.xml` trimmen nicht [geprüft]. Sonst zeigte die App „XRechnung erkannt“, während die Prüfung kein Szenario findet:

| BT-24 | Profil | Quelle |
| --- | --- | --- |
| `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0` | xrechnung-3.0 | scenarios.xml [geprüft] |
| `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#conformant#urn:xeinkauf.de:kosit:extension:xrechnung_3.0` | xrechnung-3.0-extension | scenarios.xml [geprüft] |
| `urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0#compliant#urn:xeinkauf.de:kosit:xrechnung:cvd_0.9` | xrechnung-3.0-cvd | scenarios.xml [geprüft] |
| `urn:cen.eu:en16931:2017` | en16931 | scenarios.xml [geprüft] |
| `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic` | zugferd-basic | [ungeprüft], Schritt 0.7 |
| `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended` | zugferd-extended | [ungeprüft], Schritt 0.7 |
| `urn:factur-x.eu:1p0:minimum` | zugferd-minimum | [ungeprüft], Schritt 0.7 |
| `urn:factur-x.eu:1p0:basicwl` | zugferd-basic-wl | [ungeprüft], Schritt 0.7 |
| alles andere | unbekannt | – |

Belegart: `e-rechnung`, wenn die Syntax erkannt ist und das Profil nicht MINIMUM oder BASIC WL ist. Bei MINIMUM und BASIC WL: `sonstige-rechnung`, Grund „Profil … ist keine E-Rechnung (UStAE 14.1 Abs. 14)“. Andere Wurzel (z. B. ZUGFeRD 1.0) → `sonstige-rechnung`, Grund „Format wird nicht als E-Rechnung anerkannt“.

### R5 PDF und eingebettetes XML

1. pdf.js `getAttachments()` im Worker, mit Zeitlimit 20 s und derselben Speichergrenze wie R6 Punkt 8. Ein XML-Anhang über 20 MB wird abgelehnt (Grenze aus R1).
2. Gesucht wird, ohne Groß- und Kleinschreibung, in dieser Reihenfolge: `factur-x.xml`, `xrechnung.xml`, `zugferd-invoice.xml` [ungeprüft, Schritt 0.7].
3. Genau ein Treffer → `pdf-mit-xml`; die XML-Bytes laufen durch R2 bis R4 und R6. `xmlSha256` wird gespeichert. Mehrere Treffer → erster nach Reihenfolge plus Hinweis.
4. Kein Treffer → `pdf-ohne-xml`, Belegart `sonstige-rechnung`, weiter mit Handerfassung (R16). Gibt es andere `.xml`-Anhänge, folgt der Hinweis `PDF-XML-ANDERER-NAME`: „Die PDF enthält eine XML-Datei mit unüblichem Namen. Laden Sie sie einzeln hoch, falls sie die Rechnung ist.“
5. PDF nicht lesbar oder verschlüsselt → Befund `PDF-LESEN`, Stufe fehler.
6. Original bleibt immer das ganze PDF (UStAE 14b.1 Abs. 1 Satz 2).

### R6 Prüfpipeline (gleiches Verhalten wie der KoSIT-Validator)

1. **Szenario:** Die `match`-Ausdrücke aus `scenarios.xml` werden in Dateireihenfolge ausgewertet; der erste Treffer gilt [ungeprüft, Referenzverhalten in 0.3 bestätigen]. Danach folgen zwei eigene Szenarien: „Factur-X BASIC (CII)“ und „Factur-X EXTENDED (CII)“, je mit CII-XSD D16B und EN16931-CII-Schematron. EXTENDED setzt `eingeschraenktGeprueft = true`. Kein Treffer → Befund `SZENARIO-FEHLT`, Stufe fehler, Formatfehler.

   EXTENDED ist eine Erweiterung („conformant“) und darf Inhalte haben, die CEN-Regeln anmahnen. Damit gültige EXTENDED-Rechnungen nicht fälschlich abgelehnt werden, gilt: Liefert das FeRD-Paket eigene XSD und Schematron für EXTENDED unter klarer Lizenz, ersetzen sie die CEN-Artefakte (Schritt 0.7). Sonst stehen alle Regeln, die die CEN-Prüfung bei gültigen EXTENDED-Testdateien meldet, Mustang aber nicht, als `customLevel` warning im eigenen Szenario. Die Liste entsteht in Schritt 0.7 und wird als Test eingefroren.
2. **XSD:** xmllint-wasm mit dem XSD des Szenarios; alle importierten XSD werden mitgeladen. Jede Meldung → Befund `XSD`, Stufe fehler, Ort `Zeile:Spalte`.
3. **Schematron:** Für jede Ressource unter `validateWithSchematron` läuft das vorkompilierte SEF mit SaxonJS. Ergebnis ist SVRL; ausgewertet werden `svrl:failed-assert` und `svrl:successful-report`.
4. **Stufe wie `default-report.xsl`** [geprüft]. Die Szenarien nennen `xrechnung-report.xsl`; das importiert `default-report.xsl` und überschreibt nur die Dokumentdaten [geprüft]. Reihenfolge:
   - `@flag` oder `@role` = fatal oder error → error
   - `@flag` oder `@role` = warning oder warn → warning
   - `@flag` oder `@role` = information oder info → information
   - nur `@role` = information oder info → warning
   - sonst → error

   Danach gelten die `customLevel`-Einträge des Szenarios, z. B. `BR-CL-23` → warning, `UBL-CR-646` → error.
5. **Annahme wie `default-report.xsl`** [geprüft]: abgelehnt bei Verarbeitungsfehler, ohne Szenario, bei einem Szenario mit „fallback“ im Namen oder bei mindestens einer Meldung der Stufe error (nach `customLevel`). Sonst angenommen. Die Szenarien lesen das Ergebnis über `acceptMatch` `/rep:report/rep:assessment[1]/rep:accept[1]`.
6. **Abbildung:** error → fehler, warning → warnung, information → hinweis.
7. Ob Schematron nach XSD-Fehlern noch läuft, folgt dem Referenzverhalten; Schritt 0.3 stellt es fest und friert es als Test ein.
8. Die Pipeline läuft in einem Worker-Thread mit Zeitlimit 60 s und Speichergrenze 1 GB (`resourceLimits.maxOldGenerationSizeMb`; Wert in Schritt 0.4 messen und anpassen). Überschreitung → Befund `PRUEFUNG-ZEITLIMIT` bzw. `PRUEFUNG-SPEICHER`, Stufe fehler; der Worker wird neu gestartet.
9. Der Prüfbericht (JSON, `Pruefergebnis`) wird als eigene Datei abgelegt; sein SHA-256 kommt ins Protokoll (BMF Rn. 35a).

### R7 Einordnung und Klartext

| Fehlerklasse | Befunde | Folge in der Oberfläche |
| --- | --- | --- |
| formatfehler (Rn. 6a) | `XML-WOHLGEFORMT`, `XML-ZEICHENSATZ`, `SICHERHEIT-DTD`, `XSD`, `SZENARIO-FEHLT`, Profil MINIMUM/BASIC WL | „Die Datei ist keine E-Rechnung, sondern eine sonstige Rechnung (BMF Rn. 6a). Fordern Sie eine E-Rechnung an. Ausnahmen: Kleinbetrag, Kleinunternehmer, Fahrausweis, Übergangszeit (Abschnitt 3.1).“ |
| geschaeftsregelfehler (Rn. 6b) | Schematron-Meldungen der Stufe fehler | Klartext je Regel; Hinweis, ob umsatzsteuerlich relevant |
| inhaltsfehler (Rn. 35a) | R8 mit Status „fehlt“ | „Pflichtangabe fehlt; Vorsteuerabzug gefährdet.“ |

`ustRelevant` kommt aus dem Klartext-Katalog `src/fach/klartext/katalog.ts`. Feste Einträge aus den Quellen: `BR-DE-15` → false (BMF Rn. 35a nennt BT-10). `BR-CO-14`, `BR-CO-15`, `BR-CO-17` → true (Steuerbetrag, BMF Rn. 6b). Nicht katalogisierte Regeln → "unklar", Originaltext wird angezeigt. Der Katalog umfasst in Version 0.1 mindestens 25 Regeln; Auswahl in Schritt 1.6 nach Häufigkeit in Testläufen.

Beispiel-Eintrag: `BR-CO-17` → Klartext „Der Steuerbetrag für 19 % passt nicht zur Bemessungsgrundlage. Erwartet: Bemessung × Steuersatz, auf Cent gerundet.“ → Handlung „Korrigierte Rechnung anfordern; Vorsteuer nur aus einer richtigen Rechnung.“

### R8 Pflichtangaben (§ 14 Abs. 4 UStG, §§ 33, 34a UStDV)

Läuft auf `Rechnungsdaten` oder `Handerfassung`, auch wenn die Schematron-Prüfung Fehler meldet.

| Nr. | Angabe | Erfüllt, wenn | Sonst |
| --- | --- | --- | --- |
| 1 | Name, Anschrift Leistender | BT-27, BT-37, BT-40 gefüllt; bei Land DE zusätzlich BT-35 und BT-38 | fehlt, fehler |
| 1 | Name, Anschrift Empfänger | BT-44, BT-52, BT-55; bei DE zusätzlich BT-50 und BT-53 | fehlt, fehler |
| 2 | StNr oder USt-IdNr | BT-31 oder BT-32 oder Steuervertreter BT-63 gefüllt | fehlt, fehler |
| 3 | Ausstellungsdatum | BT-2 gültiges Datum | fehlt, fehler |
| 4 | Rechnungsnummer | BT-1 nicht leer | fehlt, fehler |
| 5 | Menge und Art | mindestens eine Position mit BT-153 und BT-129 | fehlt, fehler |
| 6 | Leistungszeitpunkt | BT-72 oder BG-14 oder BG-26 in allen Positionen | pruefen, warnung („steht evtl. nur im Bemerkungstext“) |
| 7 | Entgelt nach Steuersätzen | jede BG-23 mit BT-116 | fehlt, fehler |
| 8 | Steuersatz und -betrag oder Befreiung | Kategorie S: BT-119 und BT-117. Kategorie E, AE, K, G, O: BT-120 oder BT-121. Kategorie Z: pruefen | fehlt, fehler |
| 9 | Hinweis § 14b | immer nicht-anwendbar (Eingangsrechnung an Unternehmer) | – |
| 10 | „Gutschrift“ | nur bei BT-3 = 389: „Gutschrift“ in BT-22 → erfüllt | pruefen, hinweis |

**Kleinbetrag (§ 33 UStDV):** BT-112 ≤ 25000 Cent und keine Kategorie AE oder K. Dann gelten nur: Nr. 1 (Leistender), Nr. 3, Nr. 5, Entgelt und Steuerbetrag als Summe mit Steuersatz bzw. Befreiungshinweis. Alle anderen Angaben: `nicht-anwendbar`.

**Kleinunternehmer als Lieferant (§ 34a UStDV):** gilt, wenn kein Kleinbetrag vorliegt, alle Steuerzeilen Kategorie E haben und BT-120 „§ 19“ oder „Kleinunternehmer“ enthält. Die Erkennung ist eine Heuristik; der Befund nennt das. Dann gelten: Nr. 1 (beide Parteien), Nr. 2 (auch Kleinunternehmer-Identifikationsnummer), Nr. 3, Nr. 5, Entgelt in einer Summe mit Hinweis auf § 19 UStG (BT-120) und ggf. Nr. 10. Rechnungsnummer, Leistungszeitpunkt sowie Nr. 7 und 8: `nicht-anwendbar`. Bei einem Kleinbetrag gilt § 33 UStDV (§ 34a Satz 2).

**Eigene Firma als Empfänger:** `ja`, wenn BT-48 = `firma.ustId` oder `normName(BT-44)` einem Namen aus Firma und Varianten gleicht. `normName`: klein, Unicode NFKD ohne Akzente, Rechtsformen entfernt (`gmbh`, `mbh`, `ug`, `haftungsbeschraenkt`, `ag`, `kg`, `ohg`, `gbr`, `ek`, `e k`), dann nur `a–z0–9`. Sonst `nein` mit Warnung `USTG-EMPFAENGER`. Ohne eingerichtete Firma: `unklar`. Bei BT-3 = 389 wird stattdessen der Verkäufer (BT-27, BT-31) mit der Firma verglichen.

### R9 Dubletten

| Stufe | Bedingung | Wirkung |
| --- | --- | --- |
| identische-datei | SHA-256 des Originals bereits im Archiv | kein neuer Beleg; Protokoll `eingang-verworfen` mit Verweis |
| gleiche-rechnung | gleicher Lieferantenschlüssel (R10) und gleiche `normNr(BT-1)` und gleiche Typgruppe; oder gleicher `xmlSha256` | Freigabe gesperrt bis zur Entscheidung in B4 |
| aehnliche-rechnung | gleicher Lieferantenschlüssel, andere Nummer, gleicher BT-112, Rechnungsdatum höchstens 3 Tage auseinander | Hinweis, nicht sperrend |

`normNr`: Großbuchstaben, Leerraum und `- _ / . #` entfernt. Typgruppen: Rechnung (326, 380, 384, 389, 875, 876, 877) und Gutschrift (381). Der Grund nennt Abweichungen, z. B. „Zahlbetrag 336,90 € ↔ 336,91 €“. Abgelehnte Belege zählen mit.

### R10 Lieferantenschlüssel und Kreditorenkonto

1. Schlüssel: `ustid:` + BT-31 ohne Leerraum in Großbuchstaben; sonst `stnr:` + Ziffern aus BT-32; sonst `name:` + `normName(BT-27)` + `|` + BT-38. Bei BT-3 = 389 ist der Verkäufer die eigene Firma; dann bildet der Käufer den Schlüssel (BT-48, sonst `normName(BT-44)` + `|` + BT-53).
2. Gleicher Schlüssel → vorhandener Lieferant wird vorgeschlagen. Sonst „neuer Lieferant“ mit Daten aus dem Beleg.
3. Kreditorenkonto bei der ersten Freigabe: größtes vergebenes Konto + 1, sonst `kreditorenVon`. Bei `nurBeleg` wird keines vergeben. Der Benutzer darf ändern. Prüfung: Ziffernzahl = Sachkontenlänge + 1, innerhalb des Kreises, nicht doppelt.

### R11 Plausibilität

| Regel-ID | Bedingung | Stufe |
| --- | --- | --- |
| PLAUS-STEUERSATZ | Kategorie S mit Satz ≠ 19 und ≠ 7 | warnung („Rn. 35a: falscher Steuersatz fällt bei der Validierung nicht auf“) |
| PLAUS-DATUM | BT-2 mehr als 1 Tag in der Zukunft | warnung |
| PLAUS-FAELLIG | BT-9 vor BT-2 | hinweis |
| PLAUS-WAEHRUNG | BT-5 ≠ EUR | warnung; Export gesperrt (Fremdwährung später) |
| PLAUS-IBAN | BT-84 besteht die Prüfziffernrechnung Modulo 97 nicht | warnung |
| PLAUS-ANHANG-EXTERN | BT-124 gefüllt | hinweis („Link wird nicht geöffnet; Angaben daraus zählen nicht“, BMF Rn. 35) |

### R12 Kontierungsvorschlag

1. Zeilen aus `steuern` (BG-23). Zeilen mit Bemessung 0 und Steuer 0 entfallen. `bruttoCent` = |BT-116 + BT-117|. Bei `nurBeleg` (Punkt 7) entstehen keine Zeilen.
2. Steuerfall je Zeile (R13).
3. Sachkonto: Regel des Lieferanten mit gleicher Kategorie und gleichem Satz → übernehmen, Herkunft „historie“. Sonst irgendeine Regel des Lieferanten (die mit größter `anzahl`) → Sachkonto übernehmen, Hinweis „Steuersatz neu“. Sonst leer, Herkunft „manuell“.
4. `historieAnzahl` = Summe `anzahl` der genutzten Regeln.
5. Buchungstext: Lieferantenname, Leerzeichen, BT-1; auf 60 Zeichen gekürzt, zuerst der Name.
6. Soll/Haben bezogen auf das Kreditorenkonto: "S", wenn genau eine der Bedingungen „Typ 381“ und „BT-112 < 0“ gilt; sonst "H". Also: Rechnung positiv → H, Gutschrift 381 positiv → S, Rechnung negativ → S, Gutschrift 381 negativ → H.
7. `manuellPruefen` erhält je Fall einen Grund:
   - BT-113 ≠ 0: „Anzahlung …“
   - BT-114 ≠ 0: „Rundungsbetrag …“
   - Σ Zeilen ≠ |BT-112|: „Summe weicht ab“
   - Steuerfall „sonderfall“: „Steuerfall von Hand klären“
   - BT-5 ≠ EUR: „Fremdwährung“
   - BT-3 = 389: `nurBeleg = true`, keine Zeilen; Grund „Gutschrift über Ihre Leistung (Erlös). Sie geht nur als Beleg an die Kanzlei.“ Eine Buchung als Aufwand an Kreditor wäre falsch.
   - BT-3 nicht in den Typgruppen aus R9: „Rechnungstyp prüfen“
8. Bei der Freigabe wird je Zeile die Regel (Lieferant, Kategorie, Satz) angelegt oder `anzahl` um 1 erhöht.

### R13 Steuerfall und BU-Schlüssel

| Bedingung | Steuerfall |
| --- | --- |
| `firma.kleinunternehmer` und Kategorie S, Z, E oder O | ohne-vorsteuer |
| Kategorie S, Satz 19 | vorsteuer-19 |
| Kategorie S, Satz 7 | vorsteuer-7 |
| Kategorie E, Z oder O | ohne-vorsteuer |
| alles andere (AE, K, G, L, M, S mit anderem Satz) | sonderfall |

AE, K, G, L und M bleiben auch bei `firma.kleinunternehmer` Sonderfälle. Dort kann trotz Kleinunternehmerregelung eine Steuer geschuldet sein, z. B. nach § 13b UStG **[ungeprüft, mit der Kanzlei bestätigen]**.

BU-Schlüssel: leer, wenn das Sachkonto ein Automatikkonto ist. Sonst `datev.buSchluessel[steuerfall]`. Vorbelegung: vorsteuer-19 → "9", vorsteuer-7 → "8", ohne-vorsteuer → null, sonderfall → null. Die Vorbelegung ist verbreitete DATEV-Praxis, aber **[ungeprüft]**; die Kanzlei bestätigt sie in Schritt 0.6. Sonderfälle brauchen einen Schlüssel von Hand, sonst sperrt der Export.

### R14 Freigabe

Freigabe ist möglich, wenn: Lieferant zugeordnet (bei `nurBeleg` der Geschäftspartner nach R10), keine offene Dublette der Stufe 2, jede Zeile hat ein Sachkonto (entfällt bei `nurBeleg`), Häkchen „Inhalt geprüft“ gesetzt. Bei Befunden der Stufe fehler ist eine Begründung mit mindestens 10 Zeichen Pflicht; ist ein Befund `ustRelevant`, zeigt der Dialog „Vorsteuerabzug gefährdet“. Mit der Freigabe sind Daten und Kontierung eingefroren. Änderung nur über „Freigabe zurücknehmen“ vor dem Export (protokolliert).

### R15 Aufbewahrungsfrist

`aufbewahrenBis` = 31.12. des Jahres (J + `regel.jahre`), J = größtes Jahr aus Rechnungsdatum, Eingangsdatum und Freigabedatum. Eingangs- und Freigabejahr gelten nach Ortszeit Europe/Berlin, nicht nach UTC; sonst fiele ein Eingang in der Neujahrsnacht ins Vorjahr und die Frist wäre ein Jahr zu kurz. Berechnung bei Eingang und erneut bei Freigabe. Die Regel ist bewusst vorsichtig: § 147 Abs. 4 AO knüpft an die Entstehung des Buchungsbelegs, § 14b Abs. 1 UStG an die Ausstellung. Anzeige mit dem Zusatz „frühestens; die Frist läuft nicht ab, solange die Festsetzungsfrist offen ist (§ 147 Abs. 3 AO)“. Version 0.1 löscht nie.

### R16 Handerfassung (sonstige Rechnung)

Pflichtfelder: Lieferant, Rechnungsnummer, Rechnungsdatum, mindestens eine Steuerzeile, Brutto. Prüfung: Σ (Bemessung + Steuer) = Brutto auf den Cent; Steuer = Bemessung × Satz / 100 kaufmännisch gerundet, sonst Warnung. Danach gelten R8 bis R15 wie für E-Rechnungen. Das Original (PDF oder Bild) wird unverändert archiviert; die erfassten Werte stehen im Beleg und im Protokoll.

### R17 Protokoll und Hashkette

1. Jede Aktion aus `Aktion` erzeugt genau einen Eintrag, in derselben Datenbanktransaktion wie die Änderung.
2. `hash` = SHA-256 (hex) über die UTF-8-Bytes von `kanonisch({ nr, zeitpunkt, akteur, aktion, belegId, daten, vorgaengerHash })`.
3. `kanonisch`: Objektschlüssel sortiert nach UTF-16-Codeeinheiten, keine Leerzeichen, Zeichenketten NFC-normalisiert und per `JSON.stringify` maskiert, Zahlen nur als sichere Ganzzahlen, `undefined` verboten.
4. Erster Eintrag: `vorgaengerHash` = 64 × "0".
5. Pflichtinhalte von `daten`: bei `eingang` Dateiname, Größe, SHA-256 und Quelle; bei `pruefung` Annahme, Szenario und Berichts-Hash; bei `exportiert` Dateien mit Hash und Belegliste.
6. Die Tabelle `protokoll` hat Trigger, die UPDATE und DELETE abbrechen.
7. **Testvektor** (Eintrag 1):
   ```text
   {"akteur":{"art":"benutzer","id":"00000000-0000-4000-8000-000000000001"},"aktion":"eingang","belegId":"6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00","daten":{"dateiname":"01.01a-INVOICE_ubl.xml","groesseBytes":6887,"quelle":"upload","sha256":"0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb"},"nr":1,"vorgaengerHash":"0000000000000000000000000000000000000000000000000000000000000000","zeitpunkt":"2026-11-11T09:30:00.000Z"}
   ```
   ergibt `677ce65d9a17299937acfd7d584dd1cb0bc8c45b3d0f9784f12cd48edf32b16a`. Eintrag 2 mit `nr` 2, `zeitpunkt` `2026-11-11T09:30:02.000Z`, `akteur` `{"art":"system","dienst":"pruefung"}`, `aktion` `pruefung`, gleicher `belegId`, `daten` `{"angenommen":true,"szenario":"EN16931 XRechnung (UBL Invoice)"}` und dem Hash von Eintrag 1 als `vorgaengerHash` ergibt `a94b3fe344515aaf7678b69bfda2832508a7640e5b6dba5827ca8b729bd62230`. Mit `groesseBytes` 6888 statt 6887 ergibt Eintrag 1 `ee90ad0152ce4908a8590eda868a0a867ef5d3ac04f9b6f4db0e9984c1f1119c`. Die Testvektoren prüfen nur die Hashfunktion, nicht die Pflichtinhalte aus Punkt 5.
8. **Kettenanker:** Jeder Exportlauf hält Nummer und Hash des letzten Eintrags fest und druckt beide ins Übergabeprotokoll. Damit liegt jeden Monat ein Anker außerhalb des Systems bei der Kanzlei.

### R18 Kettenprüfung

Prüft in dieser Reihenfolge und meldet den ersten Fehler je Art:

1. Nummern lückenlos ab 1 („Lücke nach Nr. 41“).
2. `vorgaengerHash` = `hash` des Vorgängers.
3. Neu berechneter `hash` = gespeicherter `hash` („Eintrag 17 verändert“).
4. SHA-256 jeder Datei unter `originale/` und `berichte/` = Wert aus dem zugehörigen Eintrag („Original von B-00012 verändert“).
5. Optional: Abgleich mit eingegebenen Kettenankern aus Übergabeprotokollen.

Ergebnis als Kettenbericht (Druckansicht) plus Protokolleintrag `kette-geprueft`. Laufzeit-Ziel: 10.000 Einträge und 2.000 Dateien in unter 30 s.

### R19 DATEV-Buchungsstapel (EXTF)

Feldnummern nach Abschnitt 3.3, **[ungeprüft]** bis Schritt 0.6. Texte in doppelten Anführungszeichen, innere Anführungszeichen verdoppelt; Zahlen ohne Anführungszeichen; leere Felder leer.

**Kopfzeile, gefüllte Felder:**

| Nr. | Feld | Wert |
| --- | --- | --- |
| 1 | Kennzeichen | `"EXTF"` |
| 2 | Versionsnummer | `700` |
| 3 | Formatkategorie | `21` |
| 4 | Formatname | `"Buchungsstapel"` |
| 5 | Formatversion | `13` |
| 6 | erzeugt am | `JJJJMMTTHHMMSSmmm`, Ortszeit Europe/Berlin |
| 8 | Herkunft | `"RE"` |
| 9 | exportiert von | `datev.exportiertVon`, max. 25 Zeichen |
| 11 | Beraternummer | `datev.beraternummer` |
| 12 | Mandantennummer | `datev.mandantennummer` |
| 13 | WJ-Beginn | `JJJJMMTT`: letzter WJ-Beginn am oder vor dem Monatsersten |
| 14 | Sachkontenlänge | `datev.sachkontenlaenge` |
| 15, 16 | Datum vom, bis | erster und letzter Tag des Monats |
| 17 | Bezeichnung | `"Belegbrücke MM/JJJJ"`, bei Nachtrag `" N<n>"` angehängt (max. 30 Zeichen) |
| 19 | Buchungstyp | `1` (Finanzbuchführung) |
| 20 | Rechnungslegungszweck | `0` |
| 21 | Festschreibung | `0` (Kanzlei kann noch ändern) |
| 22 | WKZ | `"EUR"` |
| 27 | SKR | `"03"` oder `"04"` |

Alle anderen Kopffelder bleiben leer (Textfelder als `""`). Beispiel für 02/2019:

```text
"EXTF";700;21;"Buchungsstapel";13;20261111093000000;;"RE";"Belegbrücke";"";1001;1;20190101;4;20190201;20190228;"Belegbrücke 02/2019";"";1;0;0;"EUR";;"";;;"03";;;"";""
```

**Buchungszeile, gefüllte Felder (je Kontierungszeile eine Zeile):**

| Nr. | Feld | Wert |
| --- | --- | --- |
| 1 | Umsatz | `bruttoCent` als `1234,56` |
| 2 | Soll/Haben-Kennzeichen | `"H"` oder `"S"` (R12 Punkt 6) |
| 3 | WKZ Umsatz | `"EUR"` |
| 7 | Konto | Kreditorenkonto |
| 8 | Gegenkonto (ohne BU) | Sachkonto, links mit Nullen auf Sachkontenlänge |
| 9 | BU-Schlüssel | R13, leer bei Automatikkonto |
| 10 | Belegdatum | BT-2 als `TTMM` |
| 11 | Belegfeld 1 | `belegfeld1(BT-1)` |
| 14 | Buchungstext | R12 Punkt 5 |
| 20 | Beleglink | `BEDI "<Beleg-ID>"`, nur wenn das DUO-Paket aktiv ist |
| 114 | Festschreibung | `0` |
| 115 | Leistungsdatum | BT-72 als `TTMMJJJJ`, sonst leer |

Alle anderen der 125 Felder bleiben leer.

**Nur Beleg:** Belege mit `nurBeleg` (Typ 389) erzeugen keine Buchungszeile. Sie liegen im Belegpaket, und das Übergabeprotokoll listet sie unter „Nur Beleg, Buchung durch die Kanzlei“. Hat ein Lauf keine einzige Buchungszeile, entsteht keine EXTF-Datei.

**Belegfeld 1:** Jedes Zeichen außerhalb `A–Z a–z 0–9 $ & % * + - /` wird zu `-`; danach auf 36 Zeichen gekürzt. Weicht das Ergebnis von BT-1 ab, steht BT-1 vollständig im Buchungstext.

**Zeichensatz:** Windows-1252 ohne BOM (iconv-lite). Nicht darstellbare Zeichen werden zu `_`; der Export meldet sie als Hinweis.

**Sperren:** Der Export bricht ab und nennt die Belege, wenn Kreditorenkonto oder Sachkonto fehlt. Ebenso bei fehlendem BU-Schlüssel auf einem Nicht-Automatikkonto (außer Steuerfall ohne-vorsteuer) und bei einer anderen Währung als EUR. Nummernprüfung: Beraternummer 1001 bis 9999999, Mandantennummer 1 bis 99999, Sachkontenlänge 4 bis 8.

**Dateiname:** `EXTF_Buchungsstapel_<Berater>_<Mandant>_<JJJJ-MM>[_N<n>].csv`.

### R20 Belegpaket und DUO-Paket

**Belegpaket** `Belege_<JJJJ-MM>[_N<n>].zip` (fflate):

| Pfad | Inhalt |
| --- | --- |
| `originale/<Laufnummer>_<Belegfeld1>.<xml/pdf/jpg/png>` | Original, bytegleich zum Archiv |
| `ansicht/<Laufnummer>_<Belegfeld1>.html` | KoSIT-HTML (nur XML-Rechnungen) |
| `pruefberichte/<Laufnummer>.json` | Prüfbericht |
| `index.csv` | UTF-8 mit BOM, `;`: Laufnummer, Beleg-ID, Lieferant, Rechnungsnummer, Rechnungsdatum, Brutto, Konto, Gegenkonto, SHA-256, Dateiname |

**DUO-Paket** (nur wenn Schritt 0.6 das Format bestätigt): ZIP nach XML-Schnittstelle online mit `document.xml` und den Originalen. Je Beleg ein Dokument mit der Beleg-ID als GUID, damit der Beleglink im Buchungsstapel trifft. Nur Belegbilder, keine Buchungsdaten, damit nichts doppelt gebucht wird. Elemente und Attribute legt Schritt 0.6 fest; Test 4.5 prüft `document.xml` gegen das DATEV-XSD.

### R21 Monatsübergabe und Nachtrag

1. Gruppierung nach Monat des Belegdatums (BT-2 bzw. Handerfassung).
2. Erster Lauf eines Monats: `nachtragNr = 0`. Jeder weitere Lauf für denselben Monat: nächste Nummer, nur neue Belege.
3. Ein Beleg wird genau einmal exportiert. Erneuter Download liefert die gespeicherte Datei bytegleich.
4. Exportmodus „nur-belege“: kein EXTF, nur Belegpaket (und DUO-Paket).
5. Übergabeprotokoll: Mandant, Zeitraum, Anzahl Belege, Summen je Steuersatz, Dateien mit SHA-256, Kettenanker, Belege ohne Buchung (`nurBeleg`), Hinweise des Exports.
6. Gruppiert wird vorerst nach Rechnungsdatum. Ob die Kanzlei spät eingegangene Rechnungen anders zuordnen will, klärt offene Frage 13; davon hängt der Vorsteuer-Zeitraum ab.

### R22 Prüferexport

ZIP mit `originale/`, `pruefberichte/`, `belege.csv` (alle Felder von `Beleg` flach), `protokoll.jsonl`, `kettenbericht.txt` und `LIESMICH.txt` zur Struktur. Zeitraum wählbar. Der Export selbst wird protokolliert.

### R23 Postfach (IMAP)

1. Abruf alle `intervallMinuten` und auf Knopfdruck; nur TLS (Port 993).
2. Nachrichten im `ordner`, die noch nicht im `zielOrdner` liegen. Filter `nurVonAbsendern`, falls gesetzt.
3. Anhänge mit Dateiart XML oder PDF (nach R1) werden je ein Beleg. Bilder werden nicht automatisch übernommen.
4. Idempotenz: Paar (Message-ID, SHA-256 des Anhangs) steht in `postfach_gesehen`; bekannte Paare werden übersprungen.
5. Roh-Mail als `.eml` ablegen, wenn `emlAufbewahren` gilt und die Mail mindestens einen Beleg liefert; ihr Hash steht in der Quelle und im Protokoll. Mails ohne Beleg werden nie gespeichert (Datensparsamkeit).
6. Nach erfolgreicher Übernahme aller Anhänge: Nachricht in den `zielOrdner` verschieben. Bei Fehler bleibt sie liegen; Meldung in der Statusanzeige.
7. Mail ohne passende Anhänge: verschieben nach `zielOrdner/ohne-beleg`, Hinweis in der Statusanzeige.

### R24 Beträge

Parser für Dezimaltext: optionales Vorzeichen, Ziffern, optional Punkt und höchstens 2 Nachkommastellen → Cent. Mehr Stellen auf Belegebene → Befund `BETRAG-FORMAT` (die BR-DEC-Regeln melden es ebenfalls). Mengen und Einzelpreise bleiben Text und dienen nur der Anzeige. Alle Summen in Cent, exakt.

---

## 7. Technik

### 7.1 Entscheidung: TypeScript ohne Java zur Laufzeit

| Baustein | Ohne Java machbar? | Entscheidung |
| --- | --- | --- |
| XSD (UBL 2.1, CII D16B) | ja, libxml2 als WebAssembly (`xmllint-wasm`) | übernehmen |
| Schematron (EN 16931, XRechnung) | ja, die Artefakte liegen als XSLT 2.0 vor; SaxonJS führt XSLT 3.0 aus, nach Kompilierung zu SEF mit `xslt3` | übernehmen, Durchstich 0.4 als Gate |
| Visualisierung | ja, gleiche Technik (XSLT 2.0) | übernehmen |
| ZUGFeRD-XML aus PDF | ja, pdf.js `getAttachments()` | übernehmen |
| Referenz | KoSIT-Validator 1.6.3 und Mustang-CLI 2.26.0 mit Java 21 | nur in Tests und CI |

Begründung: eine Sprache mit dem Prozesslotsen; keine JVM im Docker-Abbild und im Windows-Programm; die Fachlogik ist testbar wie dort. Gate in Schritt 0.4: Für alle 86 Testdateien stimmen Annahme und Menge der (Regel-ID, Stufe) mit der Referenz überein. Scheitert das Gate, gilt der Rückfall: KoSIT-Validator als lokaler Dienst hinter derselben Schnittstelle `Pruefdienst`.

```ts
// src/pruefung/pruefdienst.ts
export interface Pruefdienst {
  pruefe(xml: Uint8Array, format: Formaterkennung): Promise<Pruefergebnis>;
}
// Umsetzungen: SaxonPruefdienst (Standard), KositDienstPruefdienst (Rückfall, Java)
```

Lizenzfolge: SaxonJS steht unter einer proprietären Saxonica-Lizenz [geprüft, LICENSE.txt im npm-Paket]. Nutzung und Weitergabe als Teil einer Anwendung sind kostenlos erlaubt. Bedingungen: Copyright-Hinweis beilegen, kein Reverse Engineering, keine Werbung mit dem Namen, keine Weitergabe auf Seiten, deren Hauptzweck die Verteilung ist. SaxonJS 3 HE ist noch Beta (`saxonjs-he` 3.0.0-beta2, 06/2025); deshalb SaxonJS 2.7.0. Auch `saxonjs-he` steht unter einer Saxonica-Lizenz (Version 2.0, 12/2024) mit denselben Bedingungen, nicht unter einer Open-Source-Lizenz [geprüft, LICENSE.txt im npm-Paket]. Ein späterer Wechsel löst die Lizenzfrage also nicht.

### 7.2 Bibliotheken

Geprüft am 11.11.2026 mit `npm view <paket> version license`; im Prüfvermerk erneut abgefragt, alle Angaben bestätigt.

| Zweck | Paket | Version | Lizenz |
| --- | --- | --- | --- |
| Oberfläche | `react`, `react-dom` | 19.3.1 | MIT |
| Typen | `@types/node` (Linie 24), `@types/react`, `@types/react-dom` | 24.19.2, 19.3.0, 19.3.0 | MIT |
| Build | `vite` | 8.3.7 | MIT |
| Build | `@vitejs/plugin-react` | 6.3.0 | MIT |
| Sprache | `typescript` | 7.0.2 | Apache-2.0 |
| HTTP-API | `hono` | 4.13.17 | MIT |
| HTTP-Server | `@hono/node-server` | 2.1.6 | MIT |
| Eingaben prüfen | `zod` | 4.6.7 | MIT |
| XSD | `xmllint-wasm` | 5.3.0 | MIT |
| XSLT, Schematron, Ansicht | `saxon-js` | 2.7.0 | Saxonica-Lizenz v1.0 (proprietär, kostenlos) |
| SEF-Kompilierung (nur Build) | `xslt3` | 2.7.0 | Saxonica-Lizenz v1.0 |
| XML lesen (Zwischenmodell) | `fast-xml-parser` | 5.12.0 | MIT |
| PDF lesen und anzeigen | `pdfjs-dist` | 6.5.438 | Apache-2.0 |
| IMAP | `imapflow` | 2.11.0 | MIT |
| E-Mail zerlegen | `mailparser` | 3.14.3 | MIT |
| ZIP | `fflate` | 0.8.3 | MIT |
| Windows-1252 | `iconv-lite` | 0.7.3 | MIT |
| Datenbank | `node:sqlite` in Node 24.15.0 (SQLite 3.51.3) | eingebaut | MIT; Stabilität 1.2 „Release candidate“ seit 24.15.0 [geprüft] |
| Rückfall Datenbank | `better-sqlite3` | 13.0.3 | MIT |
| Unit-Tests | `vitest` | 5.1.0 | MIT |
| Browsertests | `@playwright/test` | 1.65.0 | Apache-2.0 |
| Barrierefreiheit | `@axe-core/playwright` | 4.14.0 | MPL-2.0 |
| Lint | `oxlint` | 1.93.0 | MIT |
| Später | `@tauri-apps/cli`, `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |

Bewusst nicht genutzt: `saxonjs-he` (Beta), `jszip` (größer, Doppellizenz), ORM wie `kysely` oder `drizzle-orm` (wenige Tabellen, SQL direkt), `decimal.js` (Cent-Ganzzahlen reichen). Kryptografie (SHA-256, scrypt, AES-256-GCM, UUID) kommt aus `node:crypto`.

**Datenextraktion:** Die erste Stufe der KoSIT-Visualisierung (`ubl-invoice-xr.xsl`, `ubl-creditnote-xr.xsl`, `cii-xr.xsl`) bildet alle drei Syntaxen auf ein Zwischenmodell mit BT-Bezug ab. Die App liest nur dieses Zwischenmodell (fast-xml-parser) und füllt `Rechnungsdaten`. Damit gibt es eine Abbildung statt drei.

**Laufzeit-Ressourcen der Ansicht:** `xrechnung-html.xsl` lädt CSS und JavaScript per `unparsed-text()`, die Übersetzungen (`l10n/de.xml`) lädt `functions.xsl` per `doc()` [geprüft im Quelltext]. Die SEF-Dateien müssen diese Dateien relativ zu ihrer Basis-URI finden; Schritt 0.4 klärt, wie (Ablage nebeneinander oder Basis-URI beim Kompilieren). Im Browser (Weg B) müssen die Dateien vorab geladen werden.

### 7.3 Prüfartefakte im Projekt

- Skript `scripts/artefakte.mjs` lädt die Releases aus Abschnitt 3.2 per GitHub, prüft die SHA-256-Werte und entpackt nach `vendor/`. Prüfsummen stehen in `vendor/artefakte.json`.
- Skript `scripts/sef.mjs` kompiliert alle benötigten XSLT mit `xslt3 -xsl:… -export:….sef.json -nogo` nach `vendor/sef/`. Die SEF-Dateien sind abgeleitete Werke und behalten die Lizenz ihrer Quelle (EUPL-1.2 bzw. Apache-2.0).
- Lizenztexte und Herkunft in `vendor/LIZENZEN.md`; die Artefakte bleiben unverändert.
- Aktualisierung: neue Release-Version eintragen, Skripte laufen lassen, Referenzlauf (Schritt 0.3) wiederholen, Snapshot vergleichen.

### 7.4 Ordnerstruktur

```text
belegbruecke/
  docs/                 spezifikation.md, entscheidungen.md, datev-felder.md, regelkatalog.md, datenmodell.md
  scripts/              artefakte.mjs, sef.mjs, referenz.mjs (Java), readme-bilder.mjs
  vendor/               KoSIT-Konfiguration, Visualisierung, sef/, artefakte.json, LIZENZEN.md
  src/
    fach/               typen, betrag, kanonisch, formaterkennung, pflichtangaben, plausibilitaet,
                        dubletten, lieferant, kontierung, aufbewahrung, hashkette, status,
                        datev/extf, datev/belegpaket, datev/duo, klartext/katalog   (ohne Node-APIs, ohne React)
    pruefung/           pruefdienst, szenarien, xsd, schematron, visualisierung, extraktion, pdf, worker
    server/             start, api/*, speicher/* (sqlite, ablage, migrationen), postfach/*, sicherheit/*
    ui/                 App, schritte/* (Einrichtung, Beleg, Uebergabe), archiv/*, gemeinsam/*
    testhilfen/         Mutationen, Beispiel-Einstellungen, Test-Kontenplan
  testdaten/            kosit/ (per Skript), mutationen/, zugferd/, eml/, datev/ (Golden Files), referenz/
  e2e/                  Playwright mit axe
  .github/workflows/ci.yml
```

npm-Skripte wie beim Prozesslotsen (`dev`, `build`, `test`, `e2e`, `lint`) plus `artefakte`, `sef`, `referenz`. CI: Lint, Unit-Tests, Build, Browsertests; zusätzlich ein Job mit Java 21 für den Referenzvergleich.

### 7.5 Speicherung

Datenordner `BB_DATEN` (Standard `./daten`):

| Pfad | Inhalt |
| --- | --- |
| `belegbruecke.sqlite` | Metadaten, WAL-Modus |
| `originale/<sha[0:2]>/<sha>.<ext>` | Originale und Roh-Mails; einmal schreiben, dann schreibgeschützt |
| `berichte/<beleg-id>/<n>.json` | Prüfberichte |
| `exporte/<exportlauf-id>/` | erzeugte Übergabedateien |
| `cache/ansicht/` | erzeugte HTML-Ansichten, jederzeit neu erzeugbar, nicht archivrelevant |
| `sicherung/` | tägliche Kopie der Datenbank mit `VACUUM INTO` |

Ablage atomar: in Temporärdatei schreiben, `fsync`, umbenennen, Schreibschutz setzen. Gleicher Hash → keine zweite Datei.

Tabellen (STRICT): `einstellungen`, `benutzer`, `dateien`, `belege`, `lieferanten`, `kontierungsregeln`, `sachkonten`, `exportlaeufe`, `protokoll`, `sicherheitslog`, `postfach_gesehen`. Komplexe Strukturen als JSON-Spalte, Such- und Schlüsselfelder als eigene Spalten.

```sql
CREATE TABLE protokoll (
  nr INTEGER PRIMARY KEY, zeitpunkt TEXT NOT NULL, json TEXT NOT NULL,
  vorgaenger_hash TEXT NOT NULL, hash TEXT NOT NULL UNIQUE
) STRICT;
CREATE TRIGGER protokoll_kein_update BEFORE UPDATE ON protokoll
  BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;
CREATE TRIGGER protokoll_kein_delete BEFORE DELETE ON protokoll
  BEGIN SELECT RAISE(ABORT, 'Protokoll ist unveränderbar'); END;
```

Datenbankzugriff nur über `src/server/speicher/db.ts`, damit `better-sqlite3` als Rückfall ohne weitere Änderungen passt.

### 7.6 API (Hono, JSON, unter `/api`)

| Methode, Pfad | Zweck |
| --- | --- |
| `POST /anmelden`, `POST /abmelden` | Sitzung |
| `GET`, `PUT /einstellungen` | Einstellungen (Passwort nur schreibbar) |
| `POST /belege` | Upload, multipart, mehrere Dateien |
| `GET /belege?status=&monat=&suche=` | Liste |
| `GET /belege/:id` | Beleg mit Prüfergebnis |
| `GET /belege/:id/original`, `/ansicht`, `/bericht` | Datei, HTML-Ansicht (eigene CSP), Bericht |
| `POST /belege/:id/dublette`, `PUT /lieferant`, `PUT /kontierung`, `PUT /handerfassung` | Assistentenschritte |
| `POST /belege/:id/freigeben`, `/ablehnen`, `/freigabe-zuruecknehmen`, `/ablehnung-aufheben` | Status |
| `GET`, `PUT /lieferanten/:id`; `GET`, `PUT`, `POST /sachkonten` (CSV-Import) | Stammdaten |
| `POST /uebergaben`; `GET /uebergaben/:id/dateien/:name` | Übergabe |
| `POST /archiv/pruefen`, `POST /archiv/prueferexport` | Archiv |
| `GET /postfach/status`, `POST /postfach/test`, `POST /postfach/abrufen` | Postfach |

Alle Eingaben mit zod geprüft; Fehlerantworten mit deutschem Text und Code.

### 7.7 Prozesse

Ein Node-Prozess: HTTP-Server, Postfach-Zeitgeber und ein Pool mit 2 Worker-Threads für Prüfung und PDF. In der Entwicklung liefert Vite die Oberfläche und leitet `/api` an den Server weiter. Im Betrieb liefert der Server die gebaute Oberfläche selbst aus.

### 7.8 Später: Windows-Programm und Server (Phase 7)

- **Server:** Docker-Abbild mit Node 24, Datenordner als Volume, hinter Caddy auf dem VPS. Erst nach Robins Freigabe.
- **Windows-Programm, Weg A (Standard):** Tauri 2 startet den Server als Sidecar. Tauri verlangt dafür `bundle.externalBin`, einen Dateinamen mit Target-Triple, das Shell-Plugin und die Berechtigung `shell:allow-spawn` mit `"sidecar": true` [geprüft]. Tauri nennt eine eigene Anleitung „Node.js as a sidecar“. Der Server bindet an `127.0.0.1` mit zufälligem Port und Einmal-Token. Daten unter `%APPDATA%`. NSIS-Installer pro Benutzer wie beim Prozesslotsen. Offen ist, ob eine Node-Einzeldatei (SEA) die Worker-Threads, das WASM von xmllint-wasm, den pdf.js-Worker und die Ressourcen der Ansicht mitnimmt. Schritt 7.2 ist deshalb eine Machbarkeitsprobe; Rückfall: Node-Laufzeit und Dateien neben die EXE legen. Ohne Zertifikat zeigt Windows SmartScreen eine Warnung.
- **Weg B:** Fachlogik und Prüfung im WebView (SaxonJS, xmllint-wasm und pdf.js laufen auch im Browser), Speicher und IMAP in Rust. Kleiner, aber mehr Arbeit.
- Entscheidung nach Messung von Installergröße und Startzeit (Schritt 7.5).

---

## 8. Sicherheit und Datenschutz

**Daten:** Rechnungen enthalten personenbezogene Daten: Ansprechpartner, E-Mail, Telefon, IBAN, Einzelunternehmer als Lieferanten. Aufbewahrung folgt gesetzlichen Pflichten (§ 147 AO, § 14b UStG). Einordnung als Rechtsgrundlage: rechtliche Verpflichtung im Sinne der DSGVO; das ist keine Rechtsberatung.

| Maßnahme | Umsetzung |
| --- | --- |
| Eingaben aus dem Netz | R1 (Art, Größe), R2 (keine DTD), Zeitlimits für PDF und Prüfung, Verarbeitung im Worker |
| Pfade | Dateinamen aus Uploads und Mails nie als Pfad; Ablage nur nach SHA-256 |
| Ansicht | KoSIT-HTML in `iframe sandbox="allow-scripts allow-downloads"` ohne `allow-same-origin`; Antwort-Header `Content-Security-Policy: sandbox allow-scripts allow-downloads; default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'`. Dieser Header ersetzt für `/ansicht` die App-weite CSP; mit deren `frame-ancestors 'none'` lüde der iframe nicht |
| PDF | pdf.js ohne Skriptausführung, `isEvalSupported: false` |
| Externe Links in Rechnungen | werden nie abgerufen (BT-124) |
| Anmeldung | scrypt (N = 131072 = 2^17, r = 8, p = 1, Salt 16 Byte, `maxmem` 256 MiB; das sind die OWASP-Mindestwerte [geprüft], Speicherbedarf 128 MiB je Anmeldung); Sitzungs-Cookie `HttpOnly`, `SameSite=Strict`, `Secure` unter HTTPS; 8 h Leerlauf-Ablauf |
| CSRF | SameSite plus Pflicht-Kopfzeile `X-Belegbruecke: 1` bei ändernden Anfragen |
| Ratenbegrenzung | nach 5 Fehlversuchen je Anmeldename 15 min Sperre |
| Header | CSP für die App (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` |
| Downloads | `Content-Disposition: attachment`, korrekter MIME-Typ |
| Postfach-Passwort | AES-256-GCM; 32-Byte-Schlüssel in Datei `BB_SCHLUESSEL_DATEI` außerhalb des Datenordners, Rechte nur für den Dienst; nie im Protokoll |
| Netz | Server lauscht in Version 0.1 nur auf `127.0.0.1`; IMAP nur mit TLS |
| DNS-Rebinding | Server beantwortet nur Anfragen mit `Host` gleich `127.0.0.1:<port>` oder `localhost:<port>`, sonst 421; ändernde Anfragen zusätzlich nur mit passendem `Origin`. Sonst könnte eine fremde Webseite über einen umgebogenen DNS-Namen den lokalen Server ansprechen |
| Protokolle | GoBD-Protokoll ohne IP-Adressen und ohne Passwörter. Anmeldeereignisse getrennt im `sicherheitslog`: IP 7 Tage, übrige Einträge 90 Tage |
| Abhängigkeiten | Lockfile, `npm audit` in der CI, keine Pakete ohne geprüfte Lizenz |
| Sicherung | `VACUUM INTO` täglich; Datenordner und Schlüsseldatei getrennt sichern (später restic wie beim VPS-Backup) |
| Integrität | Hashkette, Schreibschutz der Originale, Trigger auf `protokoll`, Kettenanker bei der Kanzlei |
| Betroffenenrechte | Auskunft über die Archivsuche (Name, E-Mail); Löschung erst nach Fristablauf, Funktion kommt später |
| Keine Weitergabe | keine Telemetrie, keine externen Dienste, keine Schriften oder Skripte aus CDNs |

GoBD-Hinweis: Software allein macht kein Verfahren GoBD-konform. Nötig sind Verfahrensdokumentation, Zugriffsregeln und Sicherung. Die Hashkette erkennt Änderungen, verhindert sie aber nicht. Die Verfahrensdokumentation kann später der Prozesslotse mit der Erweiterung „Compliance-Doku“ erzeugen.

**Rechtliches:**

- Keine Steuer- oder Rechtsberatung. README und Oberfläche (Einrichtung E5, Prüfbericht) sagen: „Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF Rn. 35a).“ Jeder Befund nennt seine Quelle.
- Normtexte: Der Text der EN 16931 ist urheberrechtlich geschützt. Der Klartext-Katalog entsteht in eigenen Worten; übernommen werden nur BT-Nummern, Regel-IDs und kurze Begriffe. Die Meldetexte der Schematron-Dateien stehen unter EUPL-1.2 bzw. Apache-2.0 und dürfen mit Lizenzhinweis als `originaltext` erscheinen.
- DATEV-Dokumentation und FeRD-Spezifikation bleiben lokal und kommen nicht ins Repo. `docs/datev-felder.md` enthält nur eigene Feldnotizen.
- Fremde Produktnamen (DATEV, ZUGFeRD, Factur-X) nur beschreibend nennen, keine Logos.
- Bietet olbricht-digital das Kontieren später als Dienstleistung für Kunden an, ist vorher zu klären, was das Steuerberatungsgesetz erlaubt (offene Frage 14). Das ist hier nicht geprüft.

---

## 9. Tests

### 9.1 Testdaten

| Satz | Herkunft | Lizenz | Ins Repo? |
| --- | --- | --- | --- |
| KoSIT-Testsuite v2026-08-31: 86 positive Dateien (66 Standard, 6 Extension, 12 technisch CIUS, 2 CVD; 45 UBL, 41 CII) | github.com/itplr-kosit/xrechnung-testsuite | Apache-2.0 | nein, per Skript mit Prüfsumme |
| Testinstanzen der Visualisierung, u. a. `additional-supporting-documents-xss_ubl.xml`, `maxRechnung_creditnote.xml` | github.com/itplr-kosit/xrechnung-visualization | Apache-2.0 | nein, per Skript |
| Mutationen M1 bis M8 | abgeleitet aus KoSIT 01.01a; Änderung im Dateikopf vermerkt (Apache-2.0 § 4) | Apache-2.0 | ja |
| ZUGFeRD-PDFs (6 Dateien: EN 16931, BASIC, EXTENDED, XRECHNUNG, MINIMUM, PDF ohne XML) | Mustang-Projekt, Auswahl in Schritt 0.7 | Apache-2.0 | ja, nach Prüfung der Herkunft |
| ZUGFeRD-Korpus | github.com/ZUGFeRD/corpus | Repo Apache-2.0, Einzeldateien teils fremder Herkunft | nur Einzeldateien mit klarer Herkunft |
| FeRD-Infopaket 2.5.2 | ferd-net.de | Lizenz der Beispiele nicht angegeben | nein, nur lokal |
| E-Mails (.eml) | selbst erzeugt, ohne echte Personendaten | eigene | ja |
| Fallbeispiel „Oktober“, 12 Belege | abgeleitet aus KoSIT-Dateien, Datum und Beträge angepasst | Apache-2.0 | ja |
| Golden Files DATEV | selbst erzeugt, nach Probeimport bestätigt | eigene | ja |

Mutationen (Basis `standard/01.01a-INVOICE_ubl.xml`, SHA-256 `0efafa05…986cb`, 6.887 Byte):

| ID | Änderung | Erwartung |
| --- | --- | --- |
| M1 | Dokument-Steuerbetrag `cac:TaxTotal/cbc:TaxAmount` 22.04 → 22.05 | abgelehnt; BR-CO-14 und BR-CO-15 (Referenzlauf bestätigt die Menge) |
| M2 | `cbc:BuyerReference` entfernt | abgelehnt; BR-DE-15; `ustRelevant` false |
| M3 | `cbc:CustomizationID` = `urn:beispiel:unbekannt` | Profil unbekannt; SZENARIO-FEHLT; abgelehnt |
| M4 | DOCTYPE mit externer Entity auf `file:///C:/Windows/win.ini` | SICHERHEIT-DTD vor dem Parsen |
| M5 | nach 1.000 Byte abgeschnitten | XML-WOHLGEFORMT, Formatfehler |
| M6 | `cbc:IssueDate` → `cbc:IssueDat` | XSD-Fehler, Formatfehler, abgelehnt |
| M7 | `unitCode` der ersten Position → `XYZ` | BR-CL-23 als warnung (customLevel), angenommen, falls sonst fehlerfrei |
| M8 | Steuersatz 7 → 16, Beträge stimmig nachgerechnet | angenommen; PLAUS-STEUERSATZ warnung |

### 9.2 Testfälle

Unit-Tests (Vitest) mit erwarteten Ergebnissen:

| ID | Eingabe | Erwartung |
| --- | --- | --- |
| T-F1 | alle 86 KoSIT-Dateien | Syntax aus Dateiname (`_ubl` → UBL Invoice, `_uncefact` → CII); Profil aus Ordner (standard/cius → xrechnung-3.0, extension → -extension, cvd → -cvd) |
| T-F2 | M4 | abgelehnt in < 100 ms, kein Dateizugriff |
| T-F3 | M5 | XML-WOHLGEFORMT, Fehlerklasse formatfehler |
| T-F4 | M3 | SZENARIO-FEHLT, `angenommen` false |
| T-F5 | 01.01a als ISO-8859-1 mit „Müller“ im Verkäufernamen | korrekt dekodiert, Name „Müller“, Ergebnis wie Original |
| T-F6 | PDF-Datei mit Endung `.xml` | als PDF erkannt |
| T-F7 | 25 MB XML | abgelehnt „zu groß“ |
| T-Z1 | ZUGFeRD-PDF Profil EN 16931 | `pdf-mit-xml`, `factur-x.xml`, `xmlSha256` = Hash der von Mustang-CLI extrahierten Datei |
| T-Z2 | ZUGFeRD MINIMUM | `sonstige-rechnung`, Grund nennt UStAE 14.1 Abs. 14 |
| T-Z3 | PDF ohne Anhang | `pdf-ohne-xml`, Handerfassung |
| T-Z4 | beschädigtes PDF | PDF-LESEN, kein Absturz, Zeitlimit eingehalten |
| T-Z5 | PDF mit eingebettetem XML über 20 MB (per Skript erzeugt) | abgelehnt „zu groß“, Worker bleibt unter der Speichergrenze |
| T-Z6 | PDF mit XML-Anhang `rechnung.xml` | `pdf-ohne-xml`, Hinweis `PDF-XML-ANDERER-NAME` |
| T-V1 | 86 KoSIT-Dateien und M1 bis M8 | `angenommen` und Menge (Regel-ID, Stufe) gleich dem Referenz-Snapshot |
| T-V2 | M1 | Geschäftsregelfehler, `ustRelevant` true, Klartext aus Katalog |
| T-V3 | M2 | BR-DE-15, `ustRelevant` false |
| T-V4 | M6 | Befund XSD mit Zeile und Spalte |
| T-V5 | M7 | Stufe warnung statt fehler |
| T-X1 | 01.01a UBL | BT-1 „123456XX“, BT-2 2016-04-04, BT-3 380, Brutto 33690, Steuern [S, 7, 31486, 2204], `verkaeufer.ustId` „DE123456789“ |
| T-X2 | 01.01a CII | BT-1, BT-2, BT-112, BG-23 und BT-31 wie T-X1 |
| T-X3 | 03.01a UBL | Steuern [S, 19, 57889, 10999] und [S, 7, 10839, 759]; Brutto 80486; vorausbezahlt 103000; Zahlbetrag −22514 |
| T-X4 | 02.01a UBL | Steuern [S, 19, 1078125, 204844] und [E, 0, 0, 0]; Brutto 1282969; USt-IdNr „ATU123456789“; StNr „123/456/789“ |
| T-P1 | 01.01a | Nr. 1 bis 8 erfüllt (Leistungszeitpunkt über BG-14), Nr. 9 und 10 nicht anwendbar |
| T-P2 | ohne BT-72, BG-14, BG-26 | Leistungszeitpunkt „pruefen“, warnung |
| T-P3 | Verkäufer ohne BT-31, BT-32, BT-63 | „fehlt“, fehler, inhaltsfehler |
| T-P4 | Brutto 25000, Kategorie S | Regelwerk § 33 UStDV; Rechnungsnummer und Empfänger „nicht-anwendbar“ |
| T-P5 | Brutto 25001 | Regelwerk § 14 Abs. 4 UStG |
| T-P6 | Brutto 23300, Kategorie AE (wie 01.21a) | § 14 Abs. 4 UStG (kein Kleinbetrag) |
| T-P7 | Käufer „Olbricht Digital“, Firma „olbricht-digital“ / Käufer „[Buyer name]“ | „ja“ / „nein“ mit Warnung |
| T-P8 | 01.20a (Typ 389) | Nr. 10 „pruefen“; Vergleich auf Verkäuferseite |
| T-P9 | M8 | PLAUS-STEUERSATZ |
| T-P10 | IBAN `DE89370400440532013000` / `…3001` | gültig / PLAUS-IBAN |
| T-P11 | nur Kategorie E, BT-120 „Kleinunternehmer gemäß § 19 UStG“, Brutto 30000 | Regelwerk § 34a UStDV; Rechnungsnummer, Leistungszeitpunkt und Nr. 8 `nicht-anwendbar` |
| T-D1 | 01.01a UBL zweimal | identische-datei, kein neuer Beleg, `eingang-verworfen` |
| T-D2 | 01.01a UBL, dann CII | gleiche-rechnung (ustid:DE123456789, 123456XX), Freigabe gesperrt |
| T-D3 | 01.01a, dann 01.17a | gleiche-rechnung, Grund „Zahlbetrag 336,90 € ↔ 336,91 €“ |
| T-D4 | gleicher Lieferant, andere Nummer, gleiches Datum und Brutto | aehnliche-rechnung, nicht sperrend |
| T-H1 | Testvektor R17 | Hashes `677ce65d…b16a` und `a94b3fe3…2230` |
| T-H2 | Eintrag 1 mit 6888 Byte nachträglich geändert | Kettenprüfung „Eintrag 1 verändert“ |
| T-H3 | Eintrag 2 von 3 gelöscht (Trigger umgangen, Testdatenbank) | „Lücke nach Nr. 1“ |
| T-H4 | ein Byte im Original geändert | „Original von B-00001 verändert“ |
| T-H5 | `UPDATE protokoll …` | Abbruch durch Trigger |
| T-A1 | Rechnung 15.03.2026, Eingang 16.03.2026, Freigabe 20.03.2026 | 31.12.2034 |
| T-A2 | Rechnung 30.12.2025, Eingang 05.01.2026 | 31.12.2034 |
| T-A3 | 01.01a (04.04.2016), Eingang 11.11.2026 | 31.12.2034 |
| T-A4 | wie T-A1, Regel 10 Jahre | 31.12.2036 |
| T-A5 | Rechnung 30.12.2026, Eingang `2026-12-31T23:30:00.000Z` (Ortszeit 01.01.2027, 00:30 Uhr) | 31.12.2035 |

Test-Kontenplan für T-K und T-E: 4900 „Testaufwand“ (kein Automatikkonto), 4901 „Testaufwand Automatik“ (Automatikkonto); BU vorsteuer-19 „9“, vorsteuer-7 „8“; Kreditoren 70000 bis 99999; Berater 1001, Mandant 1, WJ ab 01-01, SKR03. Beispiel-Firma für U-2 bis U-4: „[Buyer name]“ wie in den KoSIT-Dateien, kein Kleinunternehmer; sonst meldet die Empfängerprüfung eine Warnung.

| ID | Eingabe | Erwartung |
| --- | --- | --- |
| T-K1 | 02.01a, Lieferant neu | 1 Zeile 12.829,69 € (S 19 %), Sachkonto leer, Herkunft manuell; E-Zeile entfällt |
| T-K2 | 03.01a | Zeilen 688,88 € (19 %) und 115,98 € (7 %), Summe 804,86 € = BT-112; „Anzahlung 1.030,00 €“ in `manuellPruefen` |
| T-K3 | 01.21a | 1 Zeile 233,00 €, sonderfall, BU null; Export gesperrt mit Grund „BU-Schlüssel fehlt“ |
| T-K4 | Lieferant mit 3 freigegebenen Belegen (4900, S 19 %) | Vorschlag 4900, BU „9“, Herkunft historie, `historieAnzahl` 3 |
| T-K5 | wie T-K4 mit 4901 | BU leer |
| T-K6 | 01.17a | „Rundungsbetrag 0,01 €“ in `manuellPruefen` |
| T-K7 | Firma Kleinunternehmer, 03.01a (S 19 % und 7 %) | beide Zeilen ohne-vorsteuer, BU leer |
| T-K8 | Firma Kleinunternehmer, 01.21a (AE) | sonderfall, Export gesperrt wie T-K3 |
| T-K9 | 01.20a (Typ 389) | `nurBeleg` true, keine Zeilen, Partnerschlüssel `ustid:DE987654321`, kein Kreditorenkonto |
| T-E1 | 03.01a, Kreditor 70001, erzeugt am 11.11.2026 09:30:00.000 | bytegleich mit `testdaten/datev/EXTF_03.01a.csv`. Kopfzeile wie Beispiel R19. Zeile 1: `688,88`, `"H"`, 70001, 4900, `"9"`, `2802`, `"123456789"`. Zeile 2: `115,98`, BU `"8"` |
| T-E2 | Lieferant „Müller & Söhne“ | Bytes 0xFC und 0xF6, CR LF, kein BOM |
| T-E3 | BT-1 „RE_2026.001“ | Belegfeld 1 „RE-2026-001“, Original im Buchungstext |
| T-E4 | Typ 381 / Typ 380 mit BT-112 < 0 / Typ 381 mit BT-112 < 0 | Soll/Haben `"S"` / `"S"` / `"H"` |
| T-E5 | Oktober mit einem Beleg ohne Sachkonto | Export gesperrt, Meldung nennt den Beleg |
| T-E6 | Erstlauf 10/2026, danach neuer Oktober-Beleg | Datei `…_2026-10_N1.csv`, Bezeichnung „Belegbrücke 10/2026 N1“, nur der neue Beleg |
| T-E7 | Belegpaket | je Beleg Original (Hash gleich Archiv), Ansicht, Prüfbericht; `index.csv` mit allen Belegen |
| T-E8 | Übergabe 01/2021 nur mit 01.20a (Typ 389) | keine EXTF-Datei, Belegpaket mit dem Original, Übergabeprotokoll nennt den Beleg unter „Nur Beleg“ |
| T-I1 | .eml mit XRechnung; .eml mit ZUGFeRD; .eml mit PDF und XML derselben Rechnung | 1 + 1 + 2 Belege; die letzten zwei als gleiche-rechnung |
| T-I2 | dieselben Mails erneut | 0 neue Belege |
| T-I3 | falsches Passwort | Klartext „Anmeldung am Postfach fehlgeschlagen“, Dienst läuft weiter; Passwort nicht im Klartext in der Datenbankdatei |
| T-I4 | GreenMail (Java) mit 3 Mails | 3 verarbeitet, alle im Zielordner |
| T-S1 | 6 Fehlanmeldungen in 15 min | Sperre 15 min |
| T-S2 | POST ohne Sitzung / ohne `X-Belegbruecke` | 401 / 403 |
| T-S3 | beliebige Antwort | CSP, `nosniff`, `no-referrer` gesetzt |
| T-S4 | Upload-Dateiname `../../x.xml` | Ablage nur nach Hash, kein Pfad außerhalb |
| T-S5 | Ansicht von `additional-supporting-documents-xss_ubl.xml` | kein Dialog im App-Kontext; iframe ohne `allow-same-origin` |
| T-S6 | „Billion Laughs“ | SICHERHEIT-DTD in < 100 ms |
| T-S7 | Anfrage mit `Host: belegbruecke.example` / POST mit fremdem `Origin` | 421 / 403 |
| T-S8 | `GET /api/belege/:id/ansicht` | eigene CSP mit `sandbox` und `frame-ancestors 'self'`; Ansicht lädt im iframe |

Browsertests (Playwright mit axe; lokal Edge, in der CI Chrome):

| ID | Ablauf | Erwartung |
| --- | --- | --- |
| U-1 | Einrichtung nur per Tastatur | alle Schritte erreichbar, Einstellungen gespeichert |
| U-2 | 01.01a hochladen, prüfen, ansehen, Lieferant anlegen, 4900 wählen, freigeben | Ampel „Gültige XRechnung 3.0 (UBL)“, grün, sofern der Referenz-Snapshot für 01.01a keine Warnung enthält, sonst gelb; Ansicht zeigt 123456XX und 336,90 €; Kreditor 70000 vorgeschlagen; Status freigegeben |
| U-3 | M1 hochladen und freigeben wollen | Ampel rot, BR-CO-14 in Klartext; Freigabe nur mit Begründung |
| U-4 | Übergabe 04/2016 | EXTF und ZIP heruntergeladen; Übergabeprotokoll zeigt Kettenanker |
| U-5 | alle Schritte hell und dunkel | axe ohne Befunde der Stufen serious und critical |

### 9.3 Qualitätsziele

- Fachlogik in `src/fach` mit Zweigabdeckung ≥ 90 %.
- Prüfdauer je Rechnung bis 100 KB nach dem Aufwärmen ≤ 3 s auf Robins Laptop (Zielwert, in Schritt 0.4 gemessen und ggf. angepasst).
- Jede Zahl im README-Fallbeispiel ist durch einen Test abgesichert, wie beim Prozesslotsen.

---

## 10. Risiken und offene Fragen

### 10.1 Risiken

| Risiko | Gegenmaßnahme |
| --- | --- |
| SaxonJS führt die offiziellen XSLT nicht identisch oder zu langsam aus | Gate in 0.4; Rückfall KoSIT-Validator als Dienst hinter `Pruefdienst` (Java im Abbild, im Windows-Programm größerer Installer) |
| SaxonJS ist proprietär; Bedingungen könnten sich ändern | Version festschreiben; vor einer Veröffentlichung Lizenzlage klären (offene Frage 9) |
| DATEV-Formate nur aus Sekundärquelle | Schritt 0.6 und Probeimport 4.7; bis dahin Export als „Vorschau“ gekennzeichnet |
| Befunde werden als Steuerberatung verstanden | Texte nennen Quelle und „technischer Befund“; BMF Rn. 35a: Validierung ersetzt nicht die eigene Prüfung |
| Regelwerke ändern sich (KoSIT mehrmals jährlich; CEN 1.3.17 schon erschienen) | Aktualisierungsskript, Referenzlauf, Artefaktversion im Prüfbericht |
| Hashkette kann von einem Administrator komplett neu geschrieben werden | monatlicher Kettenanker bei der Kanzlei, getrennte Sicherung, Verfahrensdokumentation |
| Datenverlust durch eine einzige Datenbank | tägliche Sicherung, Wiederherstellungstest vor Version 0.1 |
| Postfach verlangt OAuth2 (Microsoft 365, Gmail) | Version 0.1 nur Passwort oder App-Passwort; sonst Upload |
| Lizenzen von ZUGFeRD-Beispielen unklar | nur lizenzklare Dateien ins Repo |
| Sonstige Rechnungen bleiben häufig | Handerfassung ohne OCR; OCR später |
| `node:sqlite` ist noch „Release candidate“ | Zugriff gekapselt; Rückfall `better-sqlite3` |
| Kreditorenbuchungen passen nicht zur EÜR-Praxis der Kanzlei | Exportmodus „nur-belege“ |
| Gültige ZUGFeRD-EXTENDED-Rechnungen werden wegen CEN-Regeln abgelehnt | Schritt 0.7: FeRD-Artefakte oder `customLevel`-Liste aus dem Mustang-Vergleich (R6 Punkt 1) |
| Node-Einzeldatei (SEA) nimmt Worker, WASM, pdf.js und Ansichts-Ressourcen nicht mit | Schritt 7.2 als Machbarkeitsprobe; Rückfall Node-Laufzeit neben der EXE oder Weg B |
| Rechnung geht nach dem Monatsexport ein; Vorsteuer-Zeitraum unklar | Nachtragsstapel; Regel mit der Kanzlei klären (offene Frage 13) |
| Lokaler Server wird von einer Webseite angesprochen (DNS-Rebinding) | Host- und Origin-Prüfung (Abschnitt 8, T-S7) |

### 10.2 Offene Fragen für Robin

1. Ermittelt olbricht-digital den Gewinn per EÜR oder Bilanz? Will die Kanzlei Buchungen mit Kreditoren oder nur Belege?
2. Welche Beraternummer, Mandantennummer, welcher Kontenrahmen (SKR03 oder SKR04), welche Sachkontenlänge und welcher Kreditorenkreis gelten?
3. Bestätigt die Kanzlei BU 9 (Vorsteuer 19 %) und BU 8 (Vorsteuer 7 %)? Welche Sachkonten sind Automatikkonten?
4. Nutzt die Kanzlei DATEV Unternehmen online (Belege online)? Soll das DUO-Paket schon in Version 0.1 kommen?
5. Welcher Zeichensatz für die EXTF-Datei (Windows-1252 oder UTF-8), und wie wird der Beleglink quotiert? Klärt der Probeimport.
6. Kannst du die DATEV-Dokumente 1036228 (DATEV-Format) und 1035732 (XML-Schnittstelle online) samt XSD im Browser öffnen und lokal ablegen? Sie kommen nicht ins Repo (Urheberrecht DATEV).
7. Soll die ganze E-Mail (.eml) mit archiviert werden? Vorschlag: ja, aber nur Mails mit Beleg (R23). Nach GoBD Rz. 121 ist eine E-Mail als reines Transportmittel wohl nicht aufbewahrungspflichtig [ungeprüft]; sie kann aber Begleitinformationen enthalten.
8. Welches Postfach soll die App abrufen, und erlaubt der Anbieter IMAP mit App-Passwort?
9. Unter welcher Lizenz soll die Belegbrücke später erscheinen, angesichts SaxonJS (proprietär) und EUPL-Artefakten?
10. Reicht in Version 0.1 eine Firma je Installation?
11. Was kommt nach Version 0.1 zuerst: Server auf dem VPS oder Windows-Programm?
12. Freigabe trotz Geschäftsregelfehler mit Pflichtbegründung (Vorschlag) oder ganz gesperrt?
13. Nach welchem Datum soll die Übergabe gruppieren: Rechnungsdatum (Vorschlag) oder Eingangsdatum? Wie bucht die Kanzlei Rechnungen, die erst nach dem Monatsexport eingehen?
14. Soll olbricht-digital die Belegbrücke später für Kunden betreiben oder deren Belege kontieren? Dann vorher klären, was das Steuerberatungsgesetz erlaubt.
15. Einverstanden, dass das Postfach bei Zeitnot in Version 0.2 rückt (Schnittlinie, Abschnitt 2.1)?

---

## 11. Arbeitsschritte zum Abhaken

Jeder Schritt dauert etwa einen halben bis einen Arbeitstag und endet mit einem prüfbaren Ergebnis. Vor jedem Commit: `npm run lint`, `npm test`, `npm run build`; bei Oberflächenänderungen zusätzlich `npm run e2e`.

Schritte mit **(Robin)** brauchen Robin oder die Kanzlei; alle anderen kann ein Agent allein erledigen. Phase 1 bis 3 hängen nicht von ihnen ab.

### Phase 0 – Klärung und Durchstich (≈ 4,5 Arbeitstage)

- [ ] **0.1** Projektgerüst wie beim Prozesslotsen anlegen (Vite, React, TypeScript, Vitest, oxlint, Playwright, CI). *Ergebnis:* Lint, Test und Build laufen in der CI grün.
- [ ] **0.2** Skript `artefakte` lädt KoSIT-Konfiguration, Visualisierung, Testsuite, Validator 1.6.3 und Mustang-CLI 2.26.0 und prüft SHA-256. *Ergebnis:* `vendor/artefakte.json` mit Prüfsummen, Lizenztexte abgelegt.
- [ ] **0.3** Referenzlauf mit dem KoSIT-Validator (Java 21) über alle 86 Testdateien und M1 bis M8. *Ergebnis:* Snapshot `testdaten/referenz/kosit-1.6.3.json`, 86 von 86 angenommen.
- [ ] **0.4** SaxonJS-Durchstich: 4 Schematron- und 4 Visualisierungs-XSLT (3 ins Zwischenmodell, 1 nach HTML) zu SEF kompilieren und auf alle Testdateien anwenden. *Ergebnis:* Gate erfüllt (gleiche Regel-IDs wie Referenz), Ansicht findet CSS, JavaScript und Übersetzungen, Messwerte (Zeit, Speicher) und Entscheidung in `docs/entscheidungen.md`.
- [ ] **0.5** xmllint-wasm-Durchstich für UBL- und CII-XSD mit allen Imports. *Ergebnis:* 86 von 86 gültig, M6 liefert den erwarteten XSD-Fehler.
- [ ] **0.6** **(Robin)** DATEV-Formate an der Primärquelle prüfen und Kanzleifragen klären (offene Fragen 1 bis 6 und 13). *Ergebnis:* `docs/datev-felder.md` mit bestätigter Feldliste und Entscheidung zum DUO-Paket. Bleibt der Schritt offen, wird Phase 4 nach der Sekundärquelle gebaut und der Export heißt „Vorschau“.
- [ ] **0.7** ZUGFeRD-Infopaket 2.5.2 und Mustang-Testdateien sichten; prüfen, ob FeRD eigene XSD und Schematron für BASIC und EXTENDED unter klarer Lizenz liefert. *Ergebnis:* Profilkennungen und Anhangsnamen bestätigt, 6 lizenzklare Testdateien gewählt, Entscheidung zur EXTENDED-Prüfung samt `customLevel`-Liste aus dem Mustang-Vergleich (R6 Punkt 1).

### Phase 1 – Fachkern: Eingang und Prüfung (≈ 6,5 Arbeitstage)

- [ ] **1.1** Typen, Cent-Beträge (R24) und kanonisches JSON umsetzen. *Ergebnis:* Betragsparser-Tests und T-H1 grün.
- [ ] **1.2** Annahme, Zeichensatz, XML-Schutz und Formaterkennung umsetzen (R1 bis R4). *Ergebnis:* T-F1 bis T-F7 grün.
- [ ] **1.3** ZUGFeRD-Anhänge mit pdf.js im Worker auslesen (R5). *Ergebnis:* T-Z1 bis T-Z6 grün.
- [ ] **1.4** Prüfpipeline mit Szenarien, XSD, Schematron, customLevel und Annahme im Worker bauen (R6). *Ergebnis:* T-V1 grün (Gleichheit mit Referenz).
- [ ] **1.5** Datenextraktion über das KoSIT-Zwischenmodell bauen. *Ergebnis:* T-X1 bis T-X4 grün.
- [ ] **1.6** Klartext-Katalog mit mindestens 25 Regeln und BMF-Einordnung anlegen (R7). *Ergebnis:* T-V2 bis T-V5 grün, `docs/regelkatalog.md` erzeugt.
- [ ] **1.7** Pflichtangaben (§ 14 UStG, §§ 33 und 34a UStDV), Empfängerprüfung und Plausibilität umsetzen (R8, R11). *Ergebnis:* T-P1 bis T-P11 grün.
- [ ] **1.8** Dubletten und Lieferantenschlüssel umsetzen (R9, R10). *Ergebnis:* T-D1 bis T-D4 grün.

### Phase 2 – Archiv und Server (≈ 4,5 Arbeitstage)

- [ ] **2.1** SQLite-Schema mit Migrationen und Protokoll-Triggern anlegen. *Ergebnis:* T-H5 grün.
- [ ] **2.2** Dateiablage nach SHA-256, atomar und schreibgeschützt. *Ergebnis:* Test für Ablage und doppelte Datei grün.
- [ ] **2.3** Protokoll mit Hashkette und Kettenprüfung umsetzen (R17, R18). *Ergebnis:* T-H1 bis T-H4 grün.
- [ ] **2.4** Aufbewahrungsfrist berechnen (R15). *Ergebnis:* T-A1 bis T-A5 grün.
- [ ] **2.5** HTTP-API mit Hono und zod für den Upload-Ablauf bauen. *Ergebnis:* API-Test lädt 01.01a hoch und erhält „angenommen“.
- [ ] **2.6** Anmeldung, Sitzung, CSRF-Schutz, Host- und Origin-Prüfung, Ratenbegrenzung und Sicherheitsheader umsetzen. *Ergebnis:* T-S1 bis T-S4 und T-S7 grün.

### Phase 3 – Oberfläche (≈ 6 Arbeitstage)

- [ ] **3.1** Grundlayout, Navigation, Hell/Dunkel und Schrittleiste bauen. *Ergebnis:* Browsertest „App lädt“ grün, axe ohne schwere Befunde.
- [ ] **3.2** Einrichtungsassistent E1 bis E5 bauen. *Ergebnis:* U-1 grün.
- [ ] **3.3** Eingang mit Upload und Belegliste bauen. *Ergebnis:* Upload von 3 Dateien zeigt 3 Zeilen mit Status.
- [ ] **3.4** Schritte Prüfen und Ansehen mit Sandbox-iframe bauen. *Ergebnis:* U-2 bis „Ansehen“ grün, T-S5 und T-S8 grün.
- [ ] **3.5** Schritt Zuordnen mit Lieferant und Dublettenvergleich bauen. *Ergebnis:* Browsertest für T-D2 grün.
- [ ] **3.6** Schritte Kontieren und Freigeben/Ablehnen bauen. *Ergebnis:* U-2 und U-3 grün.
- [ ] **3.7** Handerfassung für sonstige Rechnungen bauen (R16). *Ergebnis:* Browsertest PDF ohne XML bis zur Freigabe grün.
- [ ] **3.8** Archivsuche, Belegdetail mit Protokoll und „Archiv prüfen“ bauen. *Ergebnis:* Suche nach „123456XX“ findet den Beleg, Kettenbericht druckbar.

### Phase 4 – Kontierung und DATEV-Übergabe (≈ 5 Arbeitstage)

- [ ] **4.1** Kontenplan (von Hand und per CSV) und Vergabe der Kreditorenkonten bauen. *Ergebnis:* Import von 20 Konten und Kreditor-Test grün.
- [ ] **4.2** Kontierungsvorschlag aus der Historie umsetzen, mit Soll/Haben-Regel und `nurBeleg` (R12, R13). *Ergebnis:* T-K1 bis T-K9 grün.
- [ ] **4.3** EXTF-Buchungsstapel erzeugen (R19). *Ergebnis:* T-E1 bis T-E4 grün.
- [ ] **4.4** Monatsgruppierung, Nachtrag, Exportsperren und Belege ohne Buchung umsetzen (R19, R21). *Ergebnis:* T-E5, T-E6 und T-E8 grün.
- [ ] **4.5** Belegpaket und, falls bestätigt, DUO-Paket erzeugen (R20). *Ergebnis:* T-E7 grün; `document.xml` gültig gegen das DATEV-XSD.
- [ ] **4.6** Übergabe-Assistent mit Übergabeprotokoll in der Druckansicht bauen. *Ergebnis:* U-4 grün.
- [ ] **4.7** **(Robin)** Probeimport bei der Kanzlei mit Testdaten durchführen. *Ergebnis:* Rückmeldung der Kanzlei dokumentiert, Abweichungen behoben, Golden Files bestätigt.

### Phase 5 – Postfach (≈ 3 Arbeitstage)

- [ ] **5.1** Mailverarbeitung mit mailparser an .eml-Dateien bauen (Anhänge, Idempotenz). *Ergebnis:* T-I1 und T-I2 grün.
- [ ] **5.2** IMAP-Abruf mit imapflow, Intervall und Verschieben bauen (R23). *Ergebnis:* T-I4 mit GreenMail grün.
- [ ] **5.3** Passwort verschlüsseln, Verbindungstest und Fehlermeldungen umsetzen. *Ergebnis:* T-I3 grün.
- [ ] **5.4** Postfach-Schritt im Assistenten und Statusanzeige bauen. *Ergebnis:* Browsertest: Mail an GreenMail erscheint als Beleg.

### Phase 6 – Qualität und Version 0.1 (≈ 3 Arbeitstage)

- [ ] **6.1** Barrierefreiheit und Tastaturbedienung in allen Schritten prüfen. *Ergebnis:* U-5 grün.
- [ ] **6.2** Sicherheitsdurchsicht nach Abschnitt 8 und Wiederherstellungstest der Sicherung. *Ergebnis:* Checkliste abgehakt, `npm audit` ohne hohe Befunde, Wiederherstellung erfolgreich.
- [ ] **6.3** Fallbeispiel „Oktober“ mit 12 Belegen durchspielen und Zahlen per Test absichern. *Ergebnis:* `fallbeispiel.test.ts` grün.
- [ ] **6.4** README mit Haftungshinweis, `docs/datenmodell.md`, `docs/regelkatalog.md`, Lizenzen Dritter und ein Startskript `start.cmd` (Server starten, Browser öffnen) schreiben. *Ergebnis:* Doku vollständig, Bilder per Skript erzeugt, `start.cmd` startet die App auf Robins Laptop.
- [ ] **6.5** Version 0.1.0 taggen (Repo privat) und den Arbeitsplan aktualisieren. *Ergebnis:* Tag `v0.1.0`, CI grün.

### Phase 7 – Betrieb vorbereiten, nur nach Robins Freigabe (≈ 4 Arbeitstage)

- [ ] **7.1** Dockerfile und `compose.yaml` ohne Bereitstellung schreiben. *Ergebnis:* lokaler Containerlauf besteht die Browsertests.
- [ ] **7.2** Server als Node-Einzeldatei für Windows bündeln (Machbarkeitsprobe, Abschnitt 7.8). *Ergebnis:* `belegbruecke-server.exe` startet und besteht den API-Test einschließlich Prüfung und PDF; sonst ist der Rückfall in `docs/entscheidungen.md` begründet.
- [ ] **7.3** Tauri-2-Hülle mit Sidecar, zufälligem Port und Einmal-Token bauen. *Ergebnis:* Fenster zeigt die Oberfläche, Upload funktioniert.
- [ ] **7.4** Installer pro Benutzer mit Datenordner in `%APPDATA%` bauen. *Ergebnis:* Installation ohne Adminrechte in der CI geprüft (wie beim Prozesslotsen, nie auf Robins Rechner); Größe und Startzeit gemessen.
- [ ] **7.5** Zwischen Sidecar (Weg A) und WebView-Logik (Weg B) entscheiden. *Ergebnis:* Eintrag in `docs/entscheidungen.md`.

**Aufwand gesamt:** Version 0.1 (Phasen 0 bis 6) ≈ 32,5 Arbeitstage; Phase 7 ≈ 4 Arbeitstage zusätzlich. Ohne Phase 5 (Schnittlinie, Abschnitt 2.1) ≈ 29,5 Arbeitstage.

---

## 12. Quellen

Nur Seiten, die für diese Spezifikation tatsächlich geöffnet wurden (10./11.11.2026).

1. § 147 AO – Ordnungsvorschriften für die Aufbewahrung von Unterlagen: https://www.gesetze-im-internet.de/ao_1977/__147.html
2. § 146 AO – Ordnungsvorschriften für die Buchführung und für Aufzeichnungen: https://www.gesetze-im-internet.de/ao_1977/__146.html
3. § 14 UStG – Ausstellung von Rechnungen: https://www.gesetze-im-internet.de/ustg_1980/__14.html
4. § 14b UStG – Aufbewahrung von Rechnungen: https://www.gesetze-im-internet.de/ustg_1980/__14b.html
5. § 33 UStDV – Rechnungen über Kleinbeträge: https://www.gesetze-im-internet.de/ustdv_1980/__33.html
6. BMF-Schreiben vom 15.10.2025, Einführung der obligatorischen E-Rechnung, Anpassung UStAE: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-10-15-einfuehrung-obligatorische-e-rechnung.pdf?__blob=publicationFile&v=5
7. BMF-Schreiben vom 14.07.2025, GoBD, 2. Änderung: https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2025-07-14-GoBD-2-aenderung.pdf?__blob=publicationFile&v=3
8. KoSIT-Validator (Releases, Lizenz): https://github.com/itplr-kosit/validator
9. KoSIT Validator-Konfiguration XRechnung (Release v2026-08-31, `scenarios.xml`, `default-report.xsl`): https://github.com/itplr-kosit/validator-configuration-xrechnung
10. KoSIT XRechnung-Visualisierung (Release v2026-10-13): https://github.com/itplr-kosit/xrechnung-visualization
11. KoSIT XRechnung-Testsuite (Release v2026-08-31, `test-overview.md`): https://github.com/itplr-kosit/xrechnung-testsuite
12. KoSIT XRechnung-Schematron (Release v2.6.0): https://github.com/itplr-kosit/xrechnung-schematron
13. CEN-Validierungsartefakte EN 16931 (Release 1.3.17, EUPL-1.2): https://github.com/ConnectingEurope/eInvoicing-EN16931
14. Mustangproject (Release 2.26.0): https://github.com/ZUGFeRD/mustangproject
15. ZUGFeRD-Korpus: https://github.com/ZUGFeRD/corpus
16. FeRD, ZUGFeRD (Version 2.5.2): https://www.ferd-net.de/standards/zugferd
17. ledermann/datev, Sekundärquelle für das DATEV-Format: https://github.com/ledermann/datev
18. Tauri 2, Sidecar: https://v2.tauri.app/develop/sidecar/
19. Node.js 24, Modul `node:sqlite`: https://nodejs.org/docs/latest-v24.x/api/sqlite.html
20. npm-Paket saxon-js 2.7.0 mit LICENSE.txt: https://www.npmjs.com/package/saxon-js
21. § 27 UStG – Allgemeine Übergangsvorschriften (Abs. 38 und 40), ergänzt im Prüfvermerk: https://www.gesetze-im-internet.de/ustg_1980/__27.html
22. § 34a UStDV – Rechnungen von Kleinunternehmern, ergänzt im Prüfvermerk: https://www.gesetze-im-internet.de/ustdv_1980/__34a.html
23. OWASP Password Storage Cheat Sheet (scrypt-Mindestwerte), ergänzt im Prüfvermerk: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
24. npm-Paket saxonjs-he 3.0.0-beta2 mit LICENSE.txt, ergänzt im Prüfvermerk: https://www.npmjs.com/package/saxonjs-he

Nicht lesbar (nur mit JavaScript), deshalb keine Quelle: DATEV-Entwicklerportal (Formatbeschreibung Buchungsstapel) und DATEV-Wissensplattform, Dok.-Nr. 1003221.

Bei der Prüfung nicht erreichbar (HTTP 503 bzw. 404): GoBD-Gesamtfassung vom 28.11.2019 beim BMF und im Amtlichen AO-Handbuch. GoBD Rz. 121 bleibt deshalb ungeprüft.

---

## Prüfvermerk (2026-11-10)

Fachliche und technische Prüfung am 11.11.2026; die Überschrift folgt der Vorgabe des Auftrags. Geprüft wurde an den Primärquellen aus Abschnitt 12, an den KoSIT-Releases und an Robins Rechner (Node 24.15.0, npm 11.12.1).

### Bestätigt

- Rechtsangaben: §§ 14, 14b UStG, § 33 UStDV, § 147 Abs. 3 und 4 AO, BMF 15.10.2025 Rn. 6a, 6b, 22, 35, 35a, UStAE 14.1 Abs. 5 und 14, 14.4 Abs. 3, 14b.1 Abs. 1 und 6, GoBD Rz. 118, 119, 125, 131, 185.
- KoSIT-Konfiguration: 11 Szenarien, BT-24-Werte, `customLevel`, Stufen- und Annahmelogik, CEN 1.3.16, XRechnung-Schematron 2.6.0, Validator 1.6.3. Die SHA-256-Werte der drei Releases stimmen.
- Testsuite: 86 Dateien (66 Standard, 6 Extension, 12 CIUS, 2 CVD; 45 UBL, 41 CII), keine CreditNote. Damit trägt T-F1.
- Erwartungswerte an den Dateien nachgerechnet: T-X1, T-X3, T-X4, T-K1 bis T-K3, T-K6, T-D3, T-E1 (Belegfeld „123456789“, Belegdatum 2802) und T-P6.
- Hash-Testvektoren aus R17: alle drei Werte unabhängig nachgerechnet.
- Alle Paketversionen und Lizenzen aus 7.2 per `npm view` bestätigt.
- `node:sqlite` mit SQLite 3.51.3: STRICT-Tabelle, Abbruch-Trigger und `VACUUM INTO` laufen, ohne Warnung.

### Geändert

1. Zitierfehler behoben: Der Bildteil hybrider Rechnungen steht in UStAE 14c.1 Abs. 4a, nicht in 14b.1.
2. Rn. 35a genauer: Den Validierungsbericht aufzubewahren ist eine Empfehlung. Auf das technische Ergebnis darf man sich bei Sorgfalt verlassen.
3. Abschnitt 3.1 ergänzt: Kleinunternehmer-Rechnungen (§ 34a UStDV), Übergangszeit bis 2027 (§ 27 Abs. 38 UStG), Anwendungsregel der 8 Jahre (§ 27 Abs. 40 UStG).
4. R8 prüft Kleinunternehmer-Rechnungen nach § 34a UStDV (Heuristik, Datenmodell, T-P11). Vorher hätte die App dort fehlende Pflichtangaben gemeldet.
5. R7: Formatfehler-Text folgt Rn. 6a („sonstige Rechnung“) und nennt die Ausnahmen.
6. R4 vergleicht BT-24 ohne Trimmen, wie `scenarios.xml`.
7. R6: Behandlung von ZUGFeRD EXTENDED festgelegt, damit gültige Rechnungen nicht an CEN-Regeln scheitern. Report-Kette erklärt, Speichergrenze für Worker ergänzt.
8. R5: Größengrenze für eingebettetes XML und Hinweis auf XML-Anhänge mit anderem Namen (T-Z5, T-Z6).
9. Typ 389 (Gutschrift über eigene Leistung) wird `nurBeleg`: keine Buchung als Aufwand, Partnerschlüssel aus dem Käufer, kein Kreditorenkonto (R10, R12, R14, R19, T-K9, T-E8).
10. Soll/Haben folgt jetzt einer Entweder-oder-Regel; vorher war eine negative Gutschrift falsch (T-E4).
11. Kleinunternehmer: AE, K, G, L, M bleiben Sonderfälle statt „ohne Vorsteuer“ (R13, T-K7, T-K8).
12. R15 rechnet das Jahr nach Ortszeit; sonst wäre die Frist bei Eingang in der Neujahrsnacht ein Jahr zu kurz (T-A5).
13. R23 speichert `.eml` nur bei Mails mit Beleg.
14. Sicherheit: scrypt auf die OWASP-Mindestwerte (N = 2^17) angehoben. Host- und Origin-Prüfung gegen DNS-Rebinding ergänzt (T-S7). Die Ansicht erhält `frame-ancestors 'self'`, sonst lädt der iframe nicht (T-S8).
15. Rechtliches ergänzt: Haftungshinweis, Normtexte nur in eigenen Worten, DATEV- und FeRD-Dokumente nicht ins Repo, Marken nur beschreibend.
16. Technik: Laufzeit-Ressourcen der Ansicht, Risiko der Node-Einzeldatei, Lizenz von SaxonJS 3, Typpakete.
17. Oberfläche: Ampelregel festgelegt; U-2 mit Beispiel-Firma „[Buyer name]“ und Ampel nach Referenz-Snapshot.
18. Plan: 0.4 nennt 4 statt 5 Visualisierungs-XSLT. 0.6 und 4.7 sind als **(Robin)** markiert, mit Rückfall. 0.7 ist erweitert, 6.4 bringt ein Startskript. 7.2 ist eine Machbarkeitsprobe, 7.4 prüft den Installer in der CI. Dazu kommt die Schnittlinie für das Postfach. Aufwand jetzt ≈ 32,5 statt 31,5 Arbeitstage.
19. Offene Fragen 13 (Gruppierung, späte Rechnungen), 14 (Steuerberatungsgesetz) und 15 (Schnittlinie) neu; 6 und 7 präzisiert.

### Offen

- DATEV: Feldliste, BU-Schlüssel 8 und 9, Quotierung des Beleglinks und DUO-Format bleiben ungeprüft (Schritte 0.6 und 4.7).
- ZUGFeRD: Profilkennungen, Anhangsnamen und FeRD-Artefakte für EXTENDED (Schritt 0.7).
- Gleichlauf von SaxonJS mit dem KoSIT-Validator (Gate 0.4) und Reihenfolge der Szenarioauswahl (Schritt 0.3).
- GoBD Rz. 121 (E-Mail als Transportmittel) war nicht erreichbar.
- Steuerschuld von Kleinunternehmern bei § 13b UStG und Grenzen des Steuerberatungsgesetzes: nicht an der Quelle gelesen.
- Ob die Node-Einzeldatei für das Windows-Programm trägt (Schritt 7.2).
- Der MVP bleibt groß. Die Schnittlinie (Postfach in 0.2) ist der erste Hebel, falls die Zeit knapp wird.
