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

### T2 Prüfartefakte per Skript statt im Repo (Schritt 0.2)

- Die KoSIT-Releases (Konfiguration, Visualisierung, Testsuite) liegen nicht im Repo, sondern werden von `scripts/artefakte.mjs` mit fester SHA-256 geladen und unverändert entpackt. Das hält das Repo klein und macht jede Aktualisierung zu einer Zeile in `vendor/artefakte.json`. Die CI lädt sie ebenfalls und hält sie im Cache.
- Validator und Mustang-CLI (Java) lädt das Skript nur mit `--referenz`; die App und die Tests brauchen kein Java.
- Die Release-Archive enthalten keine Lizenzdateien. Die Lizenztexte stammen deshalb aus den Repos zum jeweiligen Release-Stand und liegen, ebenfalls mit Prüfsumme, in `vendor/lizenzen/` im Repo.

### T3 Referenzlauf (Schritt 0.3)

Lauf mit KoSIT-Validator 1.6.3, Java 21.0.10, Konfiguration v2026-08-31 über 86 Testdateien und M1 bis M8 (`npm run referenz`, 9 s). Festgestellt:

- **86 von 86 Testdateien angenommen.** 40 Dateien tragen nur den Hinweis `BR-DE-TMP-32` (Stufe information), darunter `01.01a`.
- **Szenarioauswahl:** Die `match`-Ausdrücke der Konfiguration vergleichen BT-24 exakt; jede Datei passt auf höchstens ein Szenario. Die Reihenfolge („erster Treffer gilt“) ist bei dieser Konfiguration deshalb nicht beobachtbar; die Belegbrücke wertet in Dateireihenfolge aus und nimmt den ersten Treffer.
- **Schematron nach XSD-Fehler:** läuft nicht. M6 hat nur den Schritt `val-xsd` (ungültig) und keine Schematron-Meldungen. Die Belegbrücke macht es genauso (R6 Punkt 7), ein Test friert das ein.
- **Stufen im Bericht:** Die Meldungen tragen die Stufe aus `flag`/`role` (vor `customLevel`), z. B. `BR-CL-23:error` bei M7. `customLevel` wirkt erst in der Bewertung; M7 wird angenommen. Der Snapshot speichert deshalb die Stufe vor `customLevel` und die Bewertung danach.
- **DTD:** M4 scheitert beim Validator schon beim Parsen („DOCTYPE ist nicht zulässig“), wie R2 in der Belegbrücke.
- **Abweichung M7:** Die Spezifikation nennt `unitCode` `XYZ`. `XYZ` steht aber in der Codeliste von BR-CL-23 (UN/ECE Rec. 21), die Mutation hätte nichts ausgelöst. M7 nutzt deshalb `QQQ`.
- **Abweichung T-P1:** `01.01a` hat weder BT-72 noch BG-14; nur die erste von zwei Positionen trägt BG-26. Nach R8 Nr. 6 ist der Leistungszeitpunkt damit „pruefen“ (Warnung), nicht „erfüllt über BG-14“. Der Referenzlauf meldet dazu passend `BR-DE-TMP-32`. Die Regel R8 geht vor; T-P1 erwartet für Nr. 6 „pruefen“.
- **Ampel für 01.01a (U-2):** Hinweise (information) zählen nach der Ampelregel nicht als Warnung; 01.01a ist damit grün.

### T4 SaxonJS statt Java: Gate erfüllt (Schritt 0.4)

`scripts/sef.mjs` kompiliert die 4 Schematron-XSLT (EN 16931 UBL und CII, XRechnung UBL und CII) und die 4 XSLT der Ansicht (UBL-Rechnung, UBL-Gutschrift und CII ins Zwischenmodell, Zwischenmodell nach HTML) mit `xslt3` 2.7.0 zu SEF. Dauer 10 s (3 parallel), zusammen 26 MB SEF.

- **Gate:** Für alle 86 Testdateien und M1, M2, M3, M7, M8 ergibt SaxonJS 2.7.0 dieselbe Szenariowahl und dieselbe Menge aus Regel-ID und Stufe wie der KoSIT-Validator (91 von 91 gleich). Die Szenarien werden dabei mit den unveränderten `match`-Ausdrücken aus `scenarios.xml` über `SaxonJS.XPath.evaluate` gewählt. M4, M5 (nicht wohlgeformt) und M6 (XSD-Fehler, danach keine Schematron-Prüfung) laufen über eigene Schritte. **Entscheidung: SaxonJS bleibt die Prüfung (`SaxonPruefdienst`), der Java-Rückfall wird nicht gebaut.**
- **Messwerte** (Robins Laptop, Node 24.15, ein Prozess, alle 4 Schematron-SEF geladen): Laden der SEF 50 ms, Prüfung je Datei im Mittel 90 ms, höchstens 524 ms (Dateien bis 436 KB), 91 Dateien in 8,2 s. Speicher 462 MB RSS, davon 318 MB Heap. Das Ziel von 3 s je Rechnung bis 100 KB ist weit unterschritten. Die Speichergrenze des Workers bleibt bei 1 GB.
- **Ansicht:** Die SEF sind relokierbar (`-relocate:on`). Beim Ausführen setzt `stylesheetBaseURI` die Basis auf die Original-XSLT in `vendor/visualisierung/xsl/`; so finden `unparsed-text()` (CSS, JavaScript) und `doc()` (`l10n/de.xml`) ihre Dateien, ohne dass etwas kopiert wird. 01.01a (UBL und CII): Zwischenmodell 20 bis 50 ms, HTML 20 bis 55 ms, Ergebnis enthält CSS, JavaScript, deutsche Beschriftungen, „123456XX“ und „336,90“.
- Die erste Stufe der Ansicht liefert das Zwischenmodell `xr:invoice` mit BT-Nummern (`xr:id="BT-1"`); daraus liest die Datenextraktion (Schritt 1.5).

### T5 xmllint-wasm für XSD (Schritt 0.5)

- xmllint-wasm 5.3.0 (libxml2 2.13.8) prüft mit `UBL-Invoice-2.1.xsd` bzw. `CrossIndustryInvoice_100pD16B.xsd`; alle importierten XSD (79 für UBL, 4 für CII) werden in das virtuelle Dateisystem geladen, mit den Unterordnern der Konfiguration. **86 von 86 Testdateien gültig, M1 gültig, M6 ungültig** mit „Element '{…}IssueDat': This element is not expected“ in Zeile 11. Dauer im Mittel 87 ms, höchstens 179 ms je Datei; die Bibliothek startet je Prüfung selbst einen Worker.
- **Spalte:** libxml2 meldet nur die Zeile. Die Belegbrücke ergänzt die Spalte, indem sie in der gemeldeten Zeile den Beginn des genannten Elements sucht (bei M6 Spalte 5). Xerces meldet das Ende des Start-Tags (Spalte 19); beide zeigen auf dasselbe Element. Ohne Treffer bleibt nur die Zeile.
- xmllint liest nur UTF-8. Die Prüfung erhält deshalb den nach R3 dekodierten Text, neu als UTF-8 kodiert und mit angepasster XML-Deklaration; Zeilennummern bleiben gleich. Archiviert wird immer das Original.
