# Belegbrücke – Stand der Arbeit

Checkliste aller Schritte aus [Spezifikation, Abschnitt 11](spezifikation.md#11-arbeitsschritte-zum-abhaken). `- [x]` erledigt, `- [ ]` offen, dahinter eine kurze Notiz. Nach jedem Schritt aktualisieren, damit ein Nachfolger hier weitermachen kann. Annahmen stehen in [entscheidungen.md](entscheidungen.md).

Letzte Aktualisierung: 11.11.2026

## Phase 0 – Klärung und Durchstich

- [x] **0.1** Projektgerüst (Vite, React, TypeScript, Vitest, oxlint, Playwright, CI). Gerüst wie beim Prozesslotsen, Ports 4184 (Vorschau, Browsertests) und 8784 (Server). Drei `tsconfig`: Oberfläche (ohne Node-Typen, erzwingt `src/fach` ohne Node-APIs), Server und Prüfung (Node 24 führt TypeScript direkt aus), Werkzeuge.
- [x] **0.2** Skript `artefakte`: `npm run artefakte` lädt Konfiguration, Visualisierung und Testsuite, `--referenz` zusätzlich Validator 1.6.3 und Mustang-CLI 2.26.0. Prüfsummen in `vendor/artefakte.json` (KoSIT-Werte gleich der Spezifikation), Lizenztexte in `vendor/lizenzen/`, Herkunft in `vendor/LIZENZEN.md`. Die Archive enthalten keine Lizenzdateien; die Texte kommen aus den Repos zum Release-Stand.
- [x] **0.3** Referenzlauf mit dem KoSIT-Validator: `npm run referenz` (Java 21, 9 s für 94 Dateien). Snapshot `testdaten/referenz/kosit-1.6.3.json`, **86 von 86 angenommen**. Mutationen M1 bis M8 per `scripts/mutationen.mjs` in `testdaten/mutationen/`. Ergebnisse und Abweichungen (M7 mit `QQQ`, T-P1) in [entscheidungen.md](entscheidungen.md#t3-referenzlauf-schritt-03).
- [x] **0.4** SaxonJS-Durchstich (Gate): **erfüllt**, 91 von 91 vergleichbaren Dateien gleich der Referenz; Ansicht findet CSS, JavaScript und Übersetzungen. `npm run sef` kompiliert 8 XSLT in 10 s. Messwerte in [entscheidungen.md](entscheidungen.md#t4-saxonjs-statt-java-gate-erfüllt-schritt-04). Die Vergleiche werden in 1.4 zu Tests (T-V1).
- [x] **0.5** xmllint-wasm-Durchstich: 86 von 86 gültig, M6 mit erwartetem Fehler (Zeile 11). Spalte ermittelt die Belegbrücke selbst, siehe [T5](entscheidungen.md#t5-xmllint-wasm-für-xsd-schritt-05).
- [ ] **0.6** **(Robin)** DATEV-Formate an der Primärquelle prüfen, Kanzleifragen klären. Offen; Rückfall nach Spezifikation: Phase 4 nach Sekundärquelle, Export „Vorschau“ ([T6](entscheidungen.md#t6-datev-formate-schritt-06-robin)). Annahmen zu den Kanzleifragen in der Tabelle oben in entscheidungen.md.
- [x] **0.7** ZUGFeRD: Profilkennungen und Anhangsnamen an Mustang 2.26.0 bestätigt, 6 lizenzklare Test-PDFs selbst erzeugt (`scripts/zugferd-testdaten.mjs`), Mustang-Referenz `testdaten/referenz/mustang-2.26.0.json`. EXTENDED: eigenes Szenario mit 12 Regeln als `customLevel` warning ([T7](entscheidungen.md#t7-zugferd-und-factur-x-schritt-07)).

## Phase 1 – Fachkern: Eingang und Prüfung

- [x] **1.1** Typen, Cent-Beträge (R24), kanonisches JSON: `src/fach/typen.ts` (Abschnitt 4 wörtlich), `betrag.ts` (xs:decimal, mehr als 2 Stellen als Befund, exakte Steuerrechnung mit BigInt), `kanonisch.ts`, `hashkette.ts` (Eintragshash, Kettenprüfung R18 Punkte 1 bis 3 und 5). T-H1 grün, T-H2 und T-H3 auf Ebene der Einträge ebenfalls. SHA-256 wird in `src/fach` hereingereicht (`Sha256Funktion`).
- [x] **1.2** Annahme, Zeichensatz, XML-Schutz, Formaterkennung (R1 bis R4): `annahme.ts`, `zeichensatz.ts`, `formaterkennung.ts` (namensraumgenau mit fast-xml-parser, läuft auch im Browser), Klartext-Katalog mit den eigenen Regeln, Befund-Fabrik `befunde.ts`. T-F1 bis T-F3 und T-F5 bis T-F7 grün, dazu T-S6 („Billion Laughs“ in unter 100 ms). T-F4 (M3 nicht angenommen) folgt mit der Prüfpipeline in 1.4; die Erkennung „Profil unbekannt“ ist getestet.
- [x] **1.3** ZUGFeRD-Anhänge mit pdf.js im Worker (R5): `src/pruefung/pdf.ts`, Worker-Pool `pool.ts` mit Zeitlimit (PDF 20 s, Prüfung 60 s), Speichergrenze und Ersatz-Worker. T-Z1 bis T-Z6 grün (T-Z1 gegen den Mustang-Hash, T-Z5 im Worker).
- [x] **1.4** Prüfpipeline im Worker (R6): `szenarien.ts`, `xsd.ts`, `schematron.ts`, `stufen.ts`, `validierung.ts`, Ablauf `eingang.ts`. **T-V1 grün:** alle 86 Testdateien und M1 bis M8 gleich dem Referenzlauf (13 s). T-F4, T-V4, T-V5 grün. Abweichungen von 7.1 in [T8](entscheidungen.md#t8-prüfdienst-worker-und-pdf-schritte-13-bis-15).
- [x] **1.5** Datenextraktion über das KoSIT-Zwischenmodell: `src/fach/zwischenmodell.ts` (rein), `src/pruefung/extraktion.ts` (SaxonJS). T-X1 bis T-X4 grün; alle 86 Dateien ohne Befund, Summen stimmen (BR-CO-15).
- [x] **1.6** Klartext-Katalog (R7): 45 Regeln der Regelwerke (`src/fach/klartext/regelwerk.ts`) und 17 eigene, alle in eigenen Worten mit BT-Bezug, USt-Einordnung und Handlung; jede Regel aus Referenzlauf und EXTENDED-Vergleich ist erklärt. `docs/regelkatalog.md` wird mit `node scripts/regelkatalog.mjs` erzeugt, ein Test hält sie aktuell. T-V2 bis T-V5 grün.
- [x] **1.7** Pflichtangaben, Empfängerprüfung, Plausibilität (R8, R11): `pflichtangaben.ts` (§ 14 Abs. 4 UStG, §§ 33, 34a UStDV, Erfassung von Hand), `plausibilitaet.ts` (IBAN Modulo 97), `pruefbericht.ts` (Prüfergebnis und Ampel nach 5.3). T-P1 bis T-P11 grün; T-P1 mit Nr. 6 „pruefen“ statt „erfüllt“ ([T9](entscheidungen.md#t9-pflichtangaben-ampel-und-plausibilität-schritt-17)).
- [x] **1.8** Dubletten und Lieferantenschlüssel (R9, R10): `dubletten.ts` (drei Stufen, Abweichungen in Klartext, Sperre bis zur Entscheidung), `lieferant.ts` (Schlüssel, Vorschlag, Kreditorenkonto mit Prüfung). T-D1 bis T-D4 grün (T-D1 als reine Funktion; „kein neuer Beleg“ folgt mit der API in 2.5), dazu der Partnerschlüssel aus T-K9.

## Phase 2 – Archiv und Server

- [x] **2.1** SQLite-Schema mit Migrationen und Protokoll-Triggern: `src/server/speicher/db.ts` (einziger Zugang, WAL, Transaktionen, `VACUUM INTO`), `migrationen.ts` (11 STRICT-Tabellen, Version über `user_version`). T-H5 grün, Sicherung und Wiederherstellung getestet.
- [x] **2.2** Dateiablage nach SHA-256: `src/server/speicher/ablage.ts`, atomar (Temporärdatei, fsync, umbenennen), danach schreibgeschützt, gleicher Hash ohne zweite Datei, auch bei gleichzeitigem Upload; Berichte nie überschreibbar, Pfade nur innerhalb der Ablage. Tests grün.
- [ ] **2.3** Protokoll mit Hashkette und Kettenprüfung (R17, R18)
- [ ] **2.4** Aufbewahrungsfrist (R15)
- [ ] **2.5** HTTP-API mit Hono und zod für den Upload-Ablauf
- [ ] **2.6** Anmeldung, Sitzung, CSRF, Host- und Origin-Prüfung, Ratenbegrenzung, Sicherheitsheader

## Phase 3 – Oberfläche

- [ ] **3.1** Grundlayout, Navigation, Hell/Dunkel, Schrittleiste. Vorarbeit: Startseite mit Serverstatus und Darstellungswahl, Browsertest mit axe hell und dunkel.
- [ ] **3.2** Einrichtungsassistent E1 bis E5
- [ ] **3.3** Eingang mit Upload und Belegliste
- [ ] **3.4** Prüfen und Ansehen mit Sandbox-iframe
- [ ] **3.5** Zuordnen mit Lieferant und Dublettenvergleich
- [ ] **3.6** Kontieren, Freigeben, Ablehnen
- [ ] **3.7** Handerfassung für sonstige Rechnungen (R16)
- [ ] **3.8** Archivsuche, Belegdetail, „Archiv prüfen“

## Phase 4 – Kontierung und DATEV-Übergabe

- [ ] **4.1** Kontenplan und Kreditorenkonten
- [ ] **4.2** Kontierungsvorschlag (R12, R13)
- [ ] **4.3** EXTF-Buchungsstapel (R19)
- [ ] **4.4** Monatsgruppierung, Nachtrag, Exportsperren (R19, R21)
- [ ] **4.5** Belegpaket, DUO-Paket nur nach Bestätigung (R20)
- [ ] **4.6** Übergabe-Assistent mit Übergabeprotokoll
- [ ] **4.7** **(Robin)** Probeimport bei der Kanzlei

## Phase 5 – Postfach

- [ ] **5.1** Mailverarbeitung mit mailparser an .eml-Dateien
- [ ] **5.2** IMAP-Abruf mit imapflow (R23)
- [ ] **5.3** Passwort verschlüsseln, Verbindungstest, Fehlermeldungen
- [ ] **5.4** Postfach-Schritt im Assistenten und Statusanzeige

## Phase 6 – Qualität und Version 0.1

- [ ] **6.1** Barrierefreiheit und Tastaturbedienung (U-5)
- [ ] **6.2** Sicherheitsdurchsicht und Wiederherstellungstest
- [ ] **6.3** Fallbeispiel „Oktober“ mit 12 Belegen
- [ ] **6.4** README, Datenmodell, Regelkatalog, Lizenzen Dritter, `start.cmd`
- [ ] **6.5** Version 0.1.0 taggen (Repo privat)

## Phase 7 – Betrieb vorbereiten (nur nach Robins Freigabe)

- [ ] **7.1** Dockerfile und `compose.yaml` ohne Bereitstellung
- [ ] **7.2** Server als Node-Einzeldatei (Machbarkeitsprobe)
- [ ] **7.3** Tauri-2-Hülle mit Sidecar
- [ ] **7.4** Installer pro Benutzer
- [ ] **7.5** Entscheidung Weg A oder Weg B
