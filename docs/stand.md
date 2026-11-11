# Belegbrücke – Stand der Arbeit

Checkliste aller Schritte aus [Spezifikation, Abschnitt 11](spezifikation.md#11-arbeitsschritte-zum-abhaken). `- [x]` erledigt, `- [ ]` offen, dahinter eine kurze Notiz. Nach jedem Schritt aktualisieren, damit ein Nachfolger hier weitermachen kann. Annahmen stehen in [entscheidungen.md](entscheidungen.md).

Letzte Aktualisierung: 11.11.2026

## Phase 0 – Klärung und Durchstich

- [x] **0.1** Projektgerüst (Vite, React, TypeScript, Vitest, oxlint, Playwright, CI). Gerüst wie beim Prozesslotsen, Ports 4184 (Vorschau, Browsertests) und 8784 (Server). Drei `tsconfig`: Oberfläche (ohne Node-Typen, erzwingt `src/fach` ohne Node-APIs), Server und Prüfung (Node 24 führt TypeScript direkt aus), Werkzeuge.
- [ ] **0.2** Skript `artefakte`
- [ ] **0.3** Referenzlauf mit dem KoSIT-Validator
- [ ] **0.4** SaxonJS-Durchstich (Gate)
- [ ] **0.5** xmllint-wasm-Durchstich
- [ ] **0.6** **(Robin)** DATEV-Formate an der Primärquelle prüfen, Kanzleifragen klären
- [ ] **0.7** ZUGFeRD sichten, Testdateien wählen, EXTENDED-Prüfung entscheiden

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
