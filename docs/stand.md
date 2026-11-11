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

- [ ] **1.1** Typen, Cent-Beträge (R24), kanonisches JSON
- [ ] **1.2** Annahme, Zeichensatz, XML-Schutz, Formaterkennung (R1 bis R4)
- [ ] **1.3** ZUGFeRD-Anhänge mit pdf.js im Worker (R5)
- [ ] **1.4** Prüfpipeline im Worker (R6)
- [ ] **1.5** Datenextraktion über das KoSIT-Zwischenmodell
- [ ] **1.6** Klartext-Katalog (R7)
- [ ] **1.7** Pflichtangaben, Empfängerprüfung, Plausibilität (R8, R11)
- [ ] **1.8** Dubletten und Lieferantenschlüssel (R9, R10)

## Phase 2 – Archiv und Server

- [ ] **2.1** SQLite-Schema mit Migrationen und Protokoll-Triggern
- [ ] **2.2** Dateiablage nach SHA-256
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
