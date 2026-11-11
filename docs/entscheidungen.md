# Belegbrücke – Entscheidungen und Annahmen

Hier steht, was beim Bau entschieden wurde. Einträge mit **Annahme, bis Robin entscheidet** folgen dem Vorschlag der Spezifikation (oder der naheliegendsten Empfehlung) und lassen sich ändern, sobald Robin oder die Kanzlei antwortet. Technische Entscheidungen aus den Durchstichen (Phase 0) stehen unten mit Messwerten.

## Offene Fragen der Spezifikation (Abschnitt 10.2)

| Nr. | Frage | Annahme, bis Robin entscheidet |
| --- | --- | --- |
| 1 | EÜR oder Bilanz; Buchungen mit Kreditoren oder nur Belege? | Exportmodus „Buchungsstapel und Belege“ als Standard, „nur Belege“ wählbar (Spezifikation 4, R21). |
| 2 | Beraternummer, Mandantennummer, Kontenrahmen, Sachkontenlänge, Kreditorenkreis | Vorbelegung mit den Testwerten der Spezifikation (Berater 1001, Mandant 1, WJ ab 1. Januar, SKR03, Sachkontenlänge 4, Kreditoren 70000 bis 99999). Echte Werte trägt Robin im Einrichtungsassistenten ein. |
| 3 | BU 9 und BU 8, Automatikkonten | Vorbelegung BU 9 (Vorsteuer 19 %) und BU 8 (Vorsteuer 7 %) nach R13, in der Oberfläche als „mit der Kanzlei abstimmen“ markiert. Kein Konto ist vorab Automatikkonto. |
| 4 | DATEV Unternehmen online, DUO-Paket in 0.1? | DUO-Paket aus und nicht einschaltbar, bis das Format bestätigt ist (Schritt 0.6). |
| 5 | Zeichensatz EXTF, Quotierung des Beleglinks | Windows-1252 ohne BOM; Beleglink nur bei aktivem DUO-Paket, also vorerst nie. |
| 6 | DATEV-Dokumente 1036228 und 1035732 | Offen (Robin). Bis dahin wird Phase 4 nach der Sekundärquelle gebaut und der Export heißt „Vorschau“. |
| 7 | Roh-Mail (.eml) mit archivieren? | Ja, aber nur Mails mit mindestens einem Beleg (R23, Vorschlag). |
| 8 | Welches Postfach, IMAP mit App-Passwort? | Offen. Bis dahin nur Tests gegen einen lokalen Testserver, keine Zugangsdaten. |
| 9 | Lizenz | Keine Lizenz vergeben, Repo privat. SaxonJS (proprietär, kostenlos) und EUPL-Artefakte sind bei einer späteren Veröffentlichung zu bedenken. |
| 10 | Eine Firma je Installation? | Ja. |
| 11 | Nach 0.1 zuerst Server auf dem VPS oder Windows-Programm? | Offen; Phase 7 beginnt nur nach Robins Freigabe. |
| 12 | Freigabe trotz Geschäftsregelfehler? | Erlaubt mit Pflichtbegründung (mindestens 10 Zeichen), Hinweis „Vorsteuerabzug gefährdet“ bei umsatzsteuerlich relevanten Befunden (R14, Vorschlag). |
| 13 | Gruppierung der Übergabe; späte Rechnungen | Nach Rechnungsdatum (Vorschlag); nach dem Monatsexport eingehende Rechnungen kommen in einen Nachtragsstapel (R21). |
| 14 | Betrieb oder Kontierung für Kunden | Nicht Teil von Version 0.1; vorher Steuerberatungsgesetz klären. |
| 15 | Postfach bei Zeitnot in Version 0.2? | Ja (Schnittlinie, Abschnitt 2.1). |

## Technische Entscheidungen

### T1 Ports und Bauweise (Schritt 0.1)

- Server `127.0.0.1:8784`, Vorschau und Browsertests `4184` mit `strictPort`, Entwicklungsserver `5184`. Der Prozesslotse nutzt 4173; die Ports kollidieren nicht.
- Playwright verwendet einen schon laufenden Server nie mit (`reuseExistingServer: false`): Ist der Port belegt, scheitert der Lauf laut, statt gegen einen fremden oder veralteten Stand zu testen.
- Node 24.15 führt die TypeScript-Dateien des Servers und der Worker direkt aus (Type Stripping, ohne Warnung geprüft). Deshalb `erasableSyntaxOnly` und relative Importe mit Endung `.ts`; kein eigener Build-Schritt für den Server.
- Drei Typprüfungen: `tsconfig.app.json` (Oberfläche und `src/fach`, ohne Node-Typen), `tsconfig.server.json` (`src/server`, `src/pruefung`, `src/fach`, alle Tests) und `tsconfig.node.json` (Konfiguration, Browsertests, Skripte). Benutzt `src/fach` versehentlich eine Node-API, scheitert die Typprüfung der Oberfläche.
- Die CI prüft Lint, Unit-Tests und Build (Vorgabe für diesen Durchgang), Browsertests laufen lokal vor jedem Commit.
