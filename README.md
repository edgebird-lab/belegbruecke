# Belegbrücke

E-Rechnungs-Eingang, GoBD-Archiv und DATEV-Übergabe für Kleinbetriebe, als Windows-Programm. Die Belegbrücke nimmt eingehende E-Rechnungen an (Upload oder E-Mail-Postfach), prüft sie nach EN 16931 und XRechnung mit den offiziellen Regeln der KoSIT und des CEN und erklärt Fehler in Klartext. Sie bewahrt das Original unverändert auf, mit Prüfbericht und einem Protokoll, das eine SHA-256-Hashkette sichert, führt durch Zuordnen, Kontieren und Freigeben und erzeugt monatlich die Übergabe an die Steuerkanzlei. Sie läuft auf dem eigenen Rechner, ohne Cloud, ohne KI und ohne Java.

**Version 0.1.0** · Windows 10 und 11 · kostenlos · die Daten bleiben auf dem eigenen Rechner · die DATEV-Übergabe ist noch eine **Vorschau** (siehe [Stand und Grenzen](#stand-und-grenzen))

![Eingang mit offenen Belegen](docs/bilder/eingang.png)

## Herunterladen und installieren

**[Belegbruecke-Setup.exe herunterladen](https://github.com/edgebird-lab/belegbruecke/releases/latest/download/Belegbruecke-Setup.exe)** (rund 26 MB; alle Versionen unter [Releases](https://github.com/edgebird-lab/belegbruecke/releases))

- **Voraussetzung:** Windows 10 oder 11 (64 Bit) mit WebView2. Auf aktuellen Systemen ist WebView2 schon vorhanden; fehlt es, lädt der Installer es von Microsoft nach (dafür einmal Internet).
- **Installation pro Benutzer, ohne Admin-Rechte.** Der Installer legt „Belegbrücke“ im Startmenü und auf dem Desktop an.
- **Nicht signiert:** Installer und Programm tragen keine Code-Signatur. Windows SmartScreen kann deshalb beim ersten Start nachfragen („Der Computer wurde durch Windows geschützt“): „Weitere Informationen“, dann „Trotzdem ausführen“.
- **Erster Start:** Man legt den ersten Benutzer an; danach führt ein Assistent durch Firma, Kanzlei, Steuerschlüssel und Konten, Eingang (auf Wunsch mit Postfach) und Aufbewahrung.

## Was es kann

- **Eingang:** Upload per Ziehen und Ablegen (mehrere Dateien) und IMAP-Postfach mit Abruf in festem Abstand, nur über TLS. XML- und PDF-Anhänge werden Belege; jede Datei bekommt eine Belegnummer und einen Protokolleintrag.
- **Prüfung mit den offiziellen Regeln, ohne Java.** Die Schematron-Regeln der KoSIT und des CEN (EN 16931 1.3.16, XRechnung 2.6.0) laufen als vorkompilierte XSLT in SaxonJS, das XML-Schema mit libxml2 als WebAssembly. Für alle 86 Testdateien der KoSIT-Testsuite und 8 Mutationen ergeben sich dieselben Szenarien, Regel-IDs, Stufen und Annahmen wie beim KoSIT-Validator 1.6.3 (Referenzlauf mit Java, Ergebnis als Test eingefroren).
- **Formate:** XRechnung 3.0 (UBL, CII, Extension, CVD), EN 16931, ZUGFeRD/Factur-X als PDF mit eingebettetem XML (EN 16931, BASIC, EXTENDED, XRECHNUNG). MINIMUM, BASIC WL, ZUGFeRD 1.0, PDF ohne XML und Fotos sind „sonstige Rechnungen“ und werden von Hand erfasst.
- **Klartext:** 61 Regeln der Regelwerke und 36 eigene mit deutscher Erklärung, Handlung und Einordnung nach dem BMF-Schreiben vom 15.10.2025 (Formatfehler, Geschäftsregelfehler, Inhaltsfehler; umsatzsteuerlich relevant oder nicht): [docs/regelkatalog.md](docs/regelkatalog.md). Ein Knopf kopiert eine fertige Rückfrage an den Lieferanten.
- **Pflichtangaben** nach § 14 Abs. 4 UStG, Kleinbetrag (§ 33 UStDV), Kleinunternehmer (§ 34a UStDV), Empfängerprüfung gegen die eigene Firma und Plausibilität (Steuersatz, IBAN-Prüfziffer, Datum, Währung). Ampel immer mit Symbol und Text.
- **Ansicht:** die HTML-Ansicht der KoSIT in einer Sandbox ohne Zugriff auf die App, daneben die Eckdaten; bei ZUGFeRD zusätzlich die PDF.
- **Dubletten** in drei Stufen (identische Datei, gleiche Rechnung auch über Formate hinweg, ähnliche Rechnung) mit Vergleich nebeneinander.
- **Kontierung:** Lieferanten mit Kreditorenkonto, Vorschlag aus der Historie je Lieferant, Kategorie und Steuersatz, BU-Schlüssel je Steuerfall, Soll/Haben auch für Gutschriften, Gründe für „von Hand prüfen“ (Anzahlung, Rundung, § 13b, Fremdwährung).
- **Freigabe** mit Bestätigung nach BMF Rn. 35a, Begründung bei Fehlern, Ablehnen mit Grund; danach sind Daten und Kontierung eingefroren.
- **Übergabe an die Kanzlei (Vorschau):** monatlich nach Rechnungsdatum, Nachträge für spätere Belege, DATEV-Buchungsstapel im EXTF-Format (Windows-1252) und Belegpaket (ZIP mit Originalen, Ansicht, Prüfberichten und `index.csv`), Übergabeprotokoll mit Kettenanker zum Drucken. Sperren nennen den Beleg und den Grund.
- **GoBD-Archiv mit Hashkette:** Originale inhaltsadressiert und schreibgeschützt, Prüfbericht je Beleg, Protokoll mit SHA-256-Hashkette, Kettenprüfung samt Dateien und Kettenanker, Aufbewahrungsfrist nach § 147 AO und § 14b UStG, Suche nach Name, E-Mail, Nummer, Betrag und Zeitraum, Prüferexport für die Betriebsprüfung, tägliche Sicherung mit Wiederherstellungstest.
- **Sicher im Kleinen:** bis 3 Benutzer mit Anmeldung (scrypt), Sperre nach Fehlversuchen, Schutz gegen CSRF und DNS-Rebinding, strenge CSP, Prüfung in Workern mit Zeit- und Speichergrenze; Postfach-Passwort mit AES-256-GCM verschlüsselt.

| Prüfen | Kontieren |
| --- | --- |
| ![Prüfbericht mit Ampel und Befunden in Klartext](docs/bilder/pruefen.png) | ![Kontierung mit Sachkonto je Steuerzeile](docs/bilder/kontieren.png) |
| **Übergabeprotokoll** | **Archiv prüfen** |
| ![Übergabeprotokoll mit Dateien und Kettenanker](docs/bilder/uebergabe.png) | ![Kettenprüfung im Archiv](docs/bilder/archiv.png) |

## Daten bleiben lokal

- Die Belegbrücke läuft vollständig auf dem eigenen Rechner. Das Programm startet seinen Server selbst im Hintergrund, auf einem zufälligen Port von 127.0.0.1 und nur für das eigene Fenster erreichbar, und beendet ihn beim Schließen.
- Keine Cloud, kein Konto, keine Telemetrie, keine KI. Nach außen verbindet sich die Belegbrücke nur mit dem eigenen E-Mail-Postfach, wenn man eins einrichtet.
- Daten liegen in `%LOCALAPPDATA%\de.olbricht-digital.belegbruecke\daten`, der Schlüssel für das Postfach-Passwort daneben in `daten.schluessel`, das Protokoll des Servers in `server.log`. Die tägliche Sicherung liegt im selben Ordner; eine Sicherung auf einem anderen Datenträger ist Sache des Betriebs.
- Die Deinstallation lässt das Archiv immer stehen (Rechnungen sind acht Jahre aufzubewahren); das Häkchen „Lösche die Anwendungsdaten“ entfernt nur Browserdaten und Protokolle des Programms.

## Stand und Grenzen

Version 0.1.0 vom 11.11.2026. Fertig sind Prüfung, Archiv, Oberfläche, Kontierung, Übergabe, Postfach und das Windows-Programm; ein Prüferdurchgang hat die Fachlogik nachgerechnet. Offen ist die Bestätigung des DATEV-Formats: Die Feldliste folgt einer quelloffenen Sekundärquelle und ist weder an der DATEV-Formatbeschreibung geprüft noch von einer Kanzlei importiert. **Bis dahin heißt der Export „Vorschau“; vor dem ersten echten Einsatz bitte mit der eigenen Kanzlei einen Probeimport machen.** Fortschritt im Einzelnen: [docs/stand.md](docs/stand.md); Annahmen: [docs/entscheidungen.md](docs/entscheidungen.md); Spezifikation: [docs/spezifikation.md](docs/spezifikation.md).

- Die DATEV-Formate sind noch nicht an der Primärquelle bestätigt und nicht von einer Kanzlei importiert (siehe oben). Das DUO-Paket (Belege online) ist aus.
- ZUGFeRD EXTENDED wird gegen EN 16931 geprüft; 12 Regeln, die bei gültigen EXTENDED-Rechnungen anschlagen, zählen dort nur als Warnung. ZUGFeRD 2.0 mit `urn:zugferd.de:2p0:`-Kennung ist noch nicht zugeordnet.
- Postfach nur mit Passwort oder App-Passwort über IMAP mit TLS; OAuth2 (Microsoft 365, Gmail) folgt später.
- Fremdwährung, PDF/A, Signaturen und Zeitstempel werden nicht geprüft bzw. nicht übergeben; Löschen nach Fristablauf kommt später.
- Listen laden alle Belege auf einmal (für Kleinbetriebe ausreichend, bei mehreren tausend Belegen langsam). Ein Upload darf zusammen höchstens 120 MB groß sein; größere Mengen in mehreren Schritten hochladen.
- Die Kettenprüfung umfasst wie spezifiziert nur `originale/` und `berichte/`. Exportdateien prüft die Belegbrücke beim erneuten Download gegen ihren Hash und liefert eine veränderte Datei nicht aus.
- Sitzungen liegen nur im Speicher des Servers: Nach einem Neustart oder 8 Stunden ohne Aktivität zeigt die Oberfläche wieder die Anmeldung; nicht gespeicherte Eingaben gehen dabei verloren.
- Das Programm gibt es nur für Windows; die Browser-Fassung aus dem Quelltext (siehe unten) ist für Entwickler gedacht.

## Haftungshinweis

Die Belegbrücke wird kostenlos und ohne Gewähr bereitgestellt. Sie prüft Rechnungen technisch; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a). Sie ist keine Steuer- oder Rechtsberatung. Software allein macht kein Verfahren GoBD-konform; nötig sind Verfahrensdokumentation, Zugriffsregeln und Sicherung. Die DATEV-Übergabe ist eine Vorschau und vor dem Einsatz mit der Kanzlei zu prüfen. DATEV, ZUGFeRD und Factur-X werden nur beschreibend genannt; die Belegbrücke steht in keiner Verbindung zu DATEV, KoSIT, CEN oder Saxonica.

## Fallbeispiel „Oktober“

Zwölf Belege eines Monats vom Eingang bis zur Übergabe; jede Zahl prüft [src/server/fallbeispiel.test.ts](src/server/fallbeispiel.test.ts). Die Rechnungen stammen aus der KoSIT-Testsuite, nur das Rechnungsdatum liegt im Oktober 2026 ([testdaten/fallbeispiel](testdaten/fallbeispiel), erzeugt mit `node scripts/fallbeispiel.mjs`); dazu eine PDF ohne XML, von Hand erfasst. Firma ist „[Buyer name]“ wie in den Testdateien, Kontenplan 4900 und 4901 (Automatikkonto). Alle Daten sind Testdaten.

| Nr. | Rechnung | Brutto | Was passiert |
| --- | --- | ---: | --- |
| 1 | 01.01a UBL, 123456XX | 336,90 € | freigegeben auf 4900, BU 8, Kreditor 70000 |
| 2 | 01.02a UBL | 12,60 € | Kleinbetrag (§ 33 UStDV), 4900, BU 8 |
| 3 | 01.03a CII | 182,20 € | 4900, BU 8 |
| 4 | 01.07a UBL | 45,22 € | Automatikkonto 4901, BU-Schlüssel leer |
| 5 | 01.09a UBL | 7.197,12 € | 4900, BU 9 |
| 6 | 02.01a UBL | 12.829,69 € | neuer Lieferant, Kreditor 70001; Zeile E 0 % mit 0,00 € entfällt |
| 7 | 03.01a UBL | 804,86 € | zwei Steuersätze (688,88 € und 115,98 €), Hinweis Anzahlung 1.030,00 € |
| 8 | 01.04a UBL | 120,00 € | Kategorie O, ohne Vorsteuer, Kreditor 70002 |
| 9 | 01.21a UBL | 233,00 € | § 13b (AE): kontiert, wartet auf den BU-Schlüssel der Kanzlei |
| 10 | 01.20a UBL | 357,00 € | Gutschrift über eigene Leistung (389): nur Beleg, keine Buchung |
| 11 | 01.01a CII | 336,90 € | dieselbe Rechnung wie Nr. 1: als Dublette abgelehnt |
| 12 | PDF ohne XML | 10,70 € | von Hand erfasst (Bäckerei Korn), Kreditor 70003 |

Übergabe 10/2026: 10 Belege, 10 Buchungszeilen, Nr. 9 bleibt offen. Summen der Buchungen: S 19 % 20.760,91 €, S 7 % 658,38 €, O 0 % 120,00 €, zusammen 21.539,29 €. Das Belegpaket enthält 10 Originale, 9 Ansichten, 10 Prüfberichte und `index.csv`; die Kettenprüfung mit dem Kettenanker des Laufs ist in Ordnung.

## Rechte

© 2026 Robin Olbricht – olbricht-digital. Alle Rechte vorbehalten. Die Programme dürfen kostenlos genutzt werden; eine offene Lizenz ist noch nicht gewählt. Fremdbestandteile stehen unter ihren eigenen Lizenzen, siehe [docs/lizenzen-dritter.md](docs/lizenzen-dritter.md).

Im Windows-Programm liegen alle Lizenztexte in `LIZENZEN.txt` und `vendor/lizenzen/` im Programmordner (`%LOCALAPPDATA%\Belegbrücke\belegbruecke-server`). Die Prüfregeln stammen von der KoSIT (Apache-2.0) und vom CEN (EUPL-1.2), SaxonJS steht unter der Saxonica-Lizenz.

## Für Entwickler

### Aus dem Quelltext starten

**Browser-Fassung:** Unter Windows genügt ein Doppelklick auf `start.cmd` (braucht Node 24.15 oder neuer): Beim ersten Start installiert es die Abhängigkeiten, lädt die Prüfartefakte und baut die Oberfläche; danach öffnet sich der Browser auf `http://127.0.0.1:8784`. Daten liegen in `daten/` (änderbar mit `BB_DATEN`), der Schlüssel für das Postfach-Passwort daneben in `daten.schluessel` (`BB_SCHLUESSEL_DATEI`).

**Windows-Programm selbst bauen:** `npx tauri build` (braucht zusätzlich Rust) erzeugt den Installer `Belegbrücke_0.1.0_x64-setup.exe` unter `src-tauri/target/release/bundle/nsis/`. Ein Tag `v*` baut ihn in GitHub Actions (`.github/workflows/release.yml`) und hängt ihn an einen Release-Entwurf, zusätzlich als `Belegbruecke-Setup.exe`.

### Entwickeln

```bash
npm install
npm run vorbereiten   # KoSIT-Artefakte mit Prüfsumme laden, XSLT zu SEF kompilieren
npm run server        # Server auf 127.0.0.1:8784 (liefert dist/ aus, wenn gebaut)
npm run dev           # Oberfläche (Vite, Port 5184) mit Weiterleitung von /api an den Server
npm test              # Unit-Tests (Vitest), darunter der IMAP-Testserver über TLS
npm run abdeckung     # Zweigabdeckung der Fachlogik (Schwelle 90 %)
npm run e2e           # Browsertests gegen den echten Server auf Port 4184 (lokal mit Edge)
npm run build         # Typprüfung und Produktions-Build
npm run referenz      # Referenzlauf mit dem KoSIT-Validator (braucht Java 21 und npm run artefakte -- --referenz)
```

Windows-Programm (Rust und Tauri-CLI):

```bash
npm run programm:server        # Server-Bündel und Node-Laufzeit nach src-tauri/ (nach npm run build)
npm run programm:server-test   # API-Test des Bündels: SaxonJS unverändert, Token, Prüfung und PDF im Worker, Ansicht, Kette
cargo test --manifest-path src-tauri/Cargo.toml
npx tauri build --debug --no-bundle && npm run desktop:test   # Programm im Fenster testen (CDP-Port 9337)
npx tauri build                # Release mit NSIS-Installer (baut vorher Oberfläche und Bündel)
```

Weitere Skripte: `node scripts/mutationen.mjs` (Mutationen M1 bis M8), `node scripts/zugferd-testdaten.mjs` (Test-PDFs), `node scripts/fallbeispiel.mjs` (Fallbeispiel Oktober), `node scripts/readme-bilder.mjs` (Bilder dieser Seite, nach `npm run build`), `node scripts/referenz-mustang.mjs` (Mustang-Referenz, Java), `node scripts/regelkatalog.mjs` und `node scripts/lizenzen.mjs` (Doku).

**API** (JSON unter `/api`, ändernde Anfragen mit `X-Belegbruecke: 1` und passendem `Origin`): Sitzung (`/einrichtung/benutzer`, `/anmelden`, `/abmelden`, `/sitzung`, `/benutzer`), `/einstellungen`, Belege (`POST /belege` als multipart, `GET /belege?status=&monat=&suche=&von=&bis=&betrag=&offen=1`, `GET /belege/:id` mit Vorschlägen, `/original`, `/bericht`, `/ansicht`), Assistentenschritte (`POST /belege/:id/dublette`, `PUT /lieferant`, `PUT /kontierung`, `PUT /handerfassung`, `POST /freigeben`, `/ablehnen`, `/freigabe-zuruecknehmen`, `/ablehnung-aufheben`), Stammdaten (`/lieferanten`, `/sachkonten` mit CSV-Import), Übergabe (`GET /uebergaben`, `/uebergaben/plan?monat=`, `POST /uebergaben`, `/uebergaben/:id/dateien/:name`), Archiv (`POST /archiv/pruefen`, `/archiv/prueferexport`), Postfach (`/postfach/status`, `/postfach/test`, `/postfach/abrufen`, `PUT /postfach/passwort`).

### Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/fach` | Fachlogik ohne React und ohne Node-APIs: Datenmodell, Beträge, Formaterkennung, Pflichtangaben, Plausibilität, Dubletten, Lieferanten, Kontierung, Freigabe, Erfassung von Hand, Übergabe, DATEV (EXTF, Windows-1252, Belegpaket), Aufbewahrung, Hashkette, Klartext-Katalog |
| `src/pruefung` | Prüfung in Node-Workern: Szenarien, XSD (xmllint-wasm), Schematron und Ansicht (SaxonJS), PDF (pdf.js), Worker-Pool |
| `src/server` | Hono-Server: API, Eingang, Assistentenschritte, Übergabe, Prüferexport, Kettenprüfung, Postfach (imapflow, mailparser), SQLite (`node:sqlite`), Dateiablage, Anmeldung und Schutz; Einstieg und Programmtor für das Windows-Programm (`programm.ts`) |
| `src/ui` | React-Oberfläche: Anmeldung, Einrichtung, Eingang, Beleg-Assistent, Übergabe, Archiv, Einstellungen |
| `src-tauri` | Windows-Programm: Tauri-Hülle (Rust) mit Ladeseite, Start des Servers als Sidecar (Job-Objekt, Einmal-Token), Symbol, Installer-Test |
| `src/testhilfen` | Testserver, Test-Kontenplan, Test-Mails, IMAP-Testserver und Testzertifikat (zur Laufzeit erzeugt) |
| `scripts` | Artefakte laden, SEF kompilieren, Referenzläufe, Testdaten, Bilder, Doku; Server-Bündel, API-Test und Desktop-Test des Windows-Programms |
| `testdaten` | Mutationen, ZUGFeRD-Test-PDFs, Fallbeispiel, DATEV-Golden-File, Referenz-Snapshots (KoSIT-Testsuite per Skript); nur Testdaten, keine echten Rechnungen |
| `docs` | [Spezifikation](docs/spezifikation.md), [Stand](docs/stand.md), [Entscheidungen](docs/entscheidungen.md), [Datenmodell](docs/datenmodell.md), [Regelkatalog](docs/regelkatalog.md), [DATEV-Feldnotizen](docs/datev-felder.md), [Sicherheit](docs/sicherheit.md), [Lizenzen Dritter](docs/lizenzen-dritter.md) |

**Technik:** TypeScript 7, Node 24 (führt den Server direkt als TypeScript aus), React 19, Vite 8, Hono 4, zod 4, SaxonJS 2.7, xmllint-wasm 5, pdf.js 6, fflate, imapflow, mailparser, SQLite über `node:sqlite`, Vitest, Playwright mit axe; für das Windows-Programm Tauri 2 (Rust, WebView2) und rolldown.

### Qualität

- 291 Unit-Tests (Vitest) für alle Fachregeln mit von Hand nachgerechneten Werten, die Testfälle der Spezifikation (T-F, T-Z, T-V, T-X, T-P, T-D, T-K, T-E, T-I, T-H, T-A, T-S), die Testvektoren der Hashkette, das Fallbeispiel und gleichzeitige Anfragen (Doppelklick, zweites Fenster: nichts wird still überschrieben oder doppelt protokolliert); Zweigabdeckung der Fachlogik 94,7 % (Schwelle 90 % in `npm run abdeckung`).
- Gleichlauf mit dem KoSIT-Validator für alle 86 Testdateien der KoSIT-Testsuite (`testdaten/referenz/kosit-1.6.3.json`); EXTF-Ausgabe bytegleich mit einer Golden File (`testdaten/datev/EXTF_03.01a.csv`).
- 21 Browsertests gegen den echten Server: Einrichtung nur per Tastatur, Beleg bis zur Freigabe, Dublette, Erfassung von Hand, Übergabe, Archiv, Postfach gegen einen IMAP-Testserver, Kreditorenkonto im Schritt „Zuordnen“, abgelaufene Sitzung; jeder Schritt mit axe hell und dunkel ohne schwere Befunde; elf Hauptseiten bei 1280 und 320 Pixel ohne seitliches Verschieben (WCAG 1.4.10); Sicherheitsheader und CSP ohne Verstöße.
- Windows-Programm: 8 Rust-Tests (`cargo test`: Bereit-Zeile, Navigation nur zum eigenen Server, Pfade, Protokoll ohne Token, Job-Objekt), Unit-Tests für Programmtor und Einstieg, API-Test des Server-Bündels (`npm run programm:server-test`: SaxonJS unverändert, Einmal-Token, XRechnung und ZUGFeRD-PDF im Worker, Ansicht, Kette, Ende mit stdin) und ein Desktop-Test gegen das echte Programm mit 37 Prüfungen (`npm run desktop:test`: Einrichtung, Upload aus der KoSIT-Testsuite, Ansicht, Archiv, Download, Schließen, zweiter Start, `taskkill /F`, keine CSP-Meldung).
- Bei jedem Push auf `main` laufen Lint, Unit-Tests und Build in GitHub Actions (`.github/workflows/ci.yml`); die Browsertests laufen lokal vor jedem Commit. Ändert sich das Programm, baut `.github/workflows/windows.yml` Programm und Installer unter Windows, installiert still, testet den installierten Server und deinstalliert (die Daten bleiben).
