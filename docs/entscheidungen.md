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

### T6 DATEV-Formate (Schritt 0.6, Robin)

Nicht erledigt: Die DATEV-Formatbeschreibungen (Dok.-Nr. 1036228 und 1035732) sind nur im Browser mit Anmeldung bzw. JavaScript lesbar und dürfen nicht ins Repo. **Rückfall nach Spezifikation:** Phase 4 wird nach der Sekundärquelle (`ledermann/datev`, Abschnitt 3.3) gebaut, der Export heißt „Vorschau“, bis Robin die Feldliste bestätigt und der Probeimport (4.7) gelaufen ist. Das DUO-Paket bleibt aus.

### T7 ZUGFeRD und Factur-X (Schritt 0.7)

- **Profilkennungen (BT-24)** an der Quelle von Mustang 2.26.0 (`Profiles.java`, Apache-2.0) bestätigt, gleich der Tabelle in R4: MINIMUM `urn:factur-x.eu:1p0:minimum`, BASIC WL `urn:factur-x.eu:1p0:basicwl`, BASIC `urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic`, EN 16931 `urn:cen.eu:en16931:2017`, EXTENDED `urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended`, XRECHNUNG wie XRechnung 3.0. Daneben gibt es EXTENDED-CTC-FR (`…#conformant#urn.cpro.gouv.fr:1p0:extended-ctc-fr`); die Belegbrücke führt es als „unbekannt“, es endet mit `SZENARIO-FEHLT`.
- **Anhangsnamen** bestätigt (`ZUGFeRDExporterFromA3.getFilenameForVersion`): `xrechnung.xml` beim Profil XRECHNUNG, sonst `factur-x.xml` (Factur-X, ZUGFeRD ab 2.1), `zugferd-invoice.xml` (ZUGFeRD 2.0), `ZUGFeRD-invoice.xml` (ZUGFeRD 1.0). Die Suche ohne Groß- und Kleinschreibung aus R5 deckt alle ab; ZUGFeRD 1.0 scheitert danach an der Wurzel `CrossIndustryDocument` und wird „sonstige Rechnung“.
- **Testdateien selbst erzeugt statt aus dem Mustang-Projekt:** Die Beispiel-PDFs im Mustang-Repo stammen teils von FeRD (Lizenz unklar). `scripts/zugferd-testdaten.mjs` erzeugt deshalb 6 lizenzklare PDFs aus der CII-Fassung von 01.01a (Apache-2.0, Änderung im Dateikopf vermerkt): EN 16931, BASIC, EXTENDED, XRECHNUNG (XML byte-gleich mit der KoSIT-Datei), MINIMUM und eine PDF ohne XML. Sie sind keine PDF/A-Dateien, tragen aber wie echte ZUGFeRD-Dateien das XML als eingebettete Datei mit `/AF` und XMP-Metadaten. Mustang liest Anhänge nur aus PDFs mit XMP-Metadaten; ohne XMP meldete es „no-xmlpart“.
- **Referenz** (`scripts/referenz-mustang.mjs`, Snapshot `testdaten/referenz/mustang-2.26.0.json`): Mustang extrahiert aus allen 5 PDFs mit XML genau das eingebettete XML (gleicher SHA-256; Grundlage für T-Z1).
- **EXTENDED-Prüfung:** FeRD liefert eigene XSD und Schematron für EXTENDED (Mustang bündelt sie unter `validator/src/main/resources/schema/ZF_250/EXTENDED`), aber ohne klare Lizenz. Nach R6 Punkt 1 gilt deshalb das eigene Szenario „Factur-X EXTENDED (CII)“ mit CII-XSD D16B, CEN-Schematron und `customLevel` warning für die Regeln, die das CEN-Schematron bei gültigen EXTENDED-Dateien meldet. Grundlage: 10 Mustang-Beispiele (nur lokal in `testdaten/lokal/`, nicht im Repo), davon 9 im Profil EXTENDED und 7 von Mustang als gültig bewertet. Alle 7 sind gültig gegen CII-XSD D16B. Das CEN-Schematron meldet darauf diese 12 Regeln als Fehler: **BR-22, BR-23, BR-26, BR-27, BR-CO-04, BR-CO-10, BR-CO-12, BR-S-08, BR-S-10, CII-DT-021, CII-DT-027, CII-SR-439**. Ursache sind vor allem Unterpositionen (Sub-Invoice-Lines), die die Summenregeln von EN 16931 nicht kennen. Die Liste ist im Code eingefroren und durch einen Test abgesichert.
- **Verarbeitungsfehler:** Bei `Extended_fremdwaehrung.xml` bricht das CEN-Schematron mit einem XPath-Laufzeitfehler ab (XPTY0004, zwei Werte für `normalize-space`). Mustang bewertet die Datei ebenfalls als ungültig, und sie verletzt CII-XSD D16B. Die Belegbrücke behandelt einen solchen Abbruch wie der KoSIT-Validator: Befund `PRUEFUNG-VERARBEITUNG`, nicht angenommen.
- **BASIC:** Die Belegbrücke prüft BASIC gegen EN 16931 (CEN-Schematron), nicht gegen die BASIC-Teilmenge. Mustang bewertet die erzeugte BASIC-Datei als ungültig (`PEPPOL-EN16931-R008`), weil sie mehr enthält als BASIC erlaubt; für die Frage „E-Rechnung nach EN 16931“ ist das ohne Belang. Grenze in der Doku festgehalten.
- **Offen: ZUGFeRD 2.0.** Mustangs Beispiel `ZUGFeRD2_EXTENDED_Warenrechnung.xml` trägt die ZUGFeRD-2.0-Kennung `urn:cen.eu:en16931:2017#conformant#urn:zugferd.de:2p0:extended`. R4 kennt nur die Factur-X-Kennungen; solche Dateien enden als „unbekannt“ mit `SZENARIO-FEHLT`. Nach UStAE 14.1 Abs. 14 ist ZUGFeRD ab Version 2.0.1 eine E-Rechnung. Ob die 2.0-Kennungen ergänzt werden, ist zu entscheiden, sobald die FeRD-Spezifikation 2.0.1 vorliegt.

### T8 Prüfdienst, Worker und PDF (Schritte 1.3 bis 1.5)

- **Schnittstelle:** Statt `Pruefdienst.pruefe(xml, format)` (Spezifikation 7.1) arbeitet die Belegbrücke mit `verarbeiteDatei(bytes, dateiart, ausfuehrer)`. Der `Ausfuehrer` hat zwei Aufträge, `pdf` (Anhang lesen, Zeitlimit 20 s) und `xml` (Formaterkennung, Prüfung, Extraktion, Zeitlimit 60 s). Im Server ist das der `Prueferpool` mit 2 Workern und je 1 GB Heap, in Tests derselbe Code im Prozess (`lokalerAusfuehrer`). Die Pflichtangaben (R8) und die Plausibilität (R11) laufen danach im Server, weil sie die Einstellungen der Firma brauchen. Einen Java-Rückfall (`KositDienstPruefdienst`) gibt es nicht, das Gate in 0.4 ist erfüllt.
- **Abbruch:** Zeitlimit, Speicherüberlauf (`ERR_WORKER_OUT_OF_MEMORY`) und Absturz beenden den Worker; ein neuer startet, der Beleg erhält `PRUEFUNG-ZEITLIMIT`, `PRUEFUNG-SPEICHER` bzw. `PRUEFUNG-VERARBEITUNG` und gilt als nicht angenommen.
- **pdf.js 6:** Die Option `isEvalSupported` gibt es nicht mehr, weil pdf.js keinen eval-Pfad mehr enthält. Die Belegbrücke rendert keine Seiten und liest nur Anhänge. Anhänge kommen über `getAttachments()` (Map mit Metadaten) und `getAttachmentContent(id)`.
- **Bekannte Grenze:** `resourceLimits` begrenzt nur den JavaScript-Heap. Dekomprimierte PDF-Ströme liegen in ArrayBuffern außerhalb davon; eine Dekomprimierungsbombe in einem PDF-Anhang begrenzt deshalb nur das Zeitlimit. Bei T-Z5 (21 MB XML) bleibt der Worker unauffällig und arbeitet weiter.
- **Daten auch bei Fehlern:** Die Extraktion läuft immer, wenn Syntax und Wohlgeformtheit es erlauben, auch nach XSD- oder Schematron-Fehlern und bei MINIMUM; R8 braucht die Daten, und bei sonstigen Rechnungen dienen sie als Vorschlag für die Erfassung von Hand.

### T9 Pflichtangaben, Ampel und Plausibilität (Schritt 1.7)

- **01.01a ist gelb, nicht grün (U-2):** R8 Nr. 6 meldet den Leistungszeitpunkt als „pruefen“ mit Warnung, weil nur eine von zwei Positionen BG-26 trägt (siehe T3). Nach der Ampelregel („gelb = angenommen mit Warnungen, auch aus R8“) zeigt 01.01a deshalb „Gültig mit Hinweisen“. Grün ist etwa 03.01a („Gültige XRechnung 3.0 (UBL)“). Der Browsertest U-2 in Phase 3 muss gelb erwarten.
- **Nr. 7 (Entgelt nach Steuersätzen):** Die Extraktion liefert für fehlende Beträge 0; ob BT-116 in einer Zeile fehlt, ist danach nicht mehr erkennbar. R8 prüft deshalb, ob mindestens eine Steueraufschlüsselung (BG-23) vorhanden ist; fehlende Beträge in einer Zeile meldet das Regelwerk selbst (Schematron).
- **Steuervertreter:** `Rechnungsdaten` erhält additiv `steuervertreterUstId` (BT-63), damit Nr. 2 die Bedingung „BT-31 oder BT-32 oder BT-63“ prüfen kann.
- **Kategorien L und M** (Kanaren, Ceuta/Melilla) behandelt Nr. 8 wie S (Steuersatz nötig); Z (Nullsatz) und unbekannte Kategorien sind „pruefen“.
- **Kleinunternehmer (§ 34a UStDV):** Heuristik wie spezifiziert; zusätzlich ein Hinweis `USTDV-34A`, der die Heuristik nennt.
- **R8 nur für E-Rechnungen:** Sonstige Rechnungen (auch MINIMUM mit auslesbaren Daten) erhalten die Pflichtangabenprüfung erst nach der Erfassung von Hand (`pruefePflichtangabenHand`); dort sind nicht erfasste Angaben (Anschriften, Menge und Art) „pruefen“, nicht „fehlt“.
- **Empfängerprüfung:** `normName` entfernt Rechtsformen als ganze Wörter, auch „e. K.“ und „haftungsbeschränkt“ in beiden Schreibweisen (ä wird nach NFKD zu a). Der Handelsname (BT-45) zählt ebenfalls.

### T10 Server, API und Sicherheit (Schritte 2.5 und 2.6)

- **Erster Benutzer:** Die Spezifikation sagt nicht, wie der erste Benutzer entsteht. Annahme: Solange es keinen Benutzer gibt, legt `POST /api/einrichtung/benutzer` den ersten an und meldet ihn an; danach antwortet der Pfad mit 409. Weitere Benutzer (höchstens 3) legt ein angemeldeter Benutzer über `POST /api/benutzer` an. Beides steht als `einstellungen-geaendert` im Protokoll. Passwörter brauchen mindestens 10 Zeichen.
- **Sitzungen im Speicher:** Nach einem Neustart des Servers meldet man sich neu an. Das Cookie enthält ein Zufallstoken (32 Byte), der Server kennt nur dessen SHA-256.
- **Origin:** Ändernde Anfragen brauchen einen passenden `Origin` (fehlt er, gilt das als fremd) und die Kopfzeile `X-Belegbruecke: 1`. Die Prüfung liegt vor der Sitzungsprüfung; „ohne Sitzung“ ergibt deshalb 401 nur mit gültiger Kopfzeile, sonst 403.
- **Anmeldesperre** zählt Fehlversuche je Anmeldename im Speicher (15 Minuten Fenster, 5 Versuche); auch unbekannte Namen rechnen scrypt gegen einen festen Vergleichswert, damit die Antwortzeit nichts verrät. Anmeldeereignisse stehen nur im `sicherheitslog`, nie im GoBD-Protokoll; IP-Adressen werden nach 7 Tagen gelöscht, Einträge nach 90 Tagen.
- **Abgelehnte Dateien** (Typ, Größe, identische Datei) erzeugen keinen Beleg, aber einen Eintrag `eingang-verworfen` mit Grund, Dateiname, Größe und SHA-256.
- **Sonstige Rechnungen** (PDF ohne XML, MINIMUM, Bilder) bleiben nach der Formaterkennung im Status `eingegangen`, bis die Erfassung von Hand (R16, Phase 3) sie prüft. Prüfbericht und Protokolleintrag `pruefung` entstehen trotzdem.
- **Unterbrochene Prüfungen** (Absturz zwischen Eingang und Prüfung) prüft der Server beim Start erneut.
- **Ansicht:** HTML wird beim ersten Abruf im Worker erzeugt und unter `cache/ansicht/<xml-sha256>.html` zwischengespeichert (nicht archivrelevant).
- **Browsertests gegen den echten Server:** Playwright startet `node src/server/start.ts` auf Port 4184 mit frischem Datenordner; so prüfen die Tests CSP, Host-Prüfung und API mit. `npm run preview` bleibt die reine Vorschau mit Weiterleitung von `/api` an Port 8784.
- **CSP der App** wie spezifiziert (`default-src 'self'`); die Oberfläche darf deshalb keine Inline-Styles oder Inline-Skripte verwenden. Phase 3 muss das beachten oder die CSP bewusst erweitern.
- **Kein HTTPS** in Version 0.1 (nur 127.0.0.1); das Cookie erhält `Secure`, sobald der Server unter HTTPS läuft (Phase 7).
- **Entwicklung mit Vite:** Der Proxy von `npm run dev` (Port 5184) und `npm run preview` (4184) tritt gegenüber dem Server als dieser selbst auf (`changeOrigin`, `Origin` auf `http://127.0.0.1:8784` gesetzt), sonst lehnte die Origin-Prüfung jede ändernde Anfrage ab. Das gilt nur für die Entwicklung auf 127.0.0.1; einmal echt geprüft (GET 200, POST über den Proxy 201, fremder Origin direkt 403).
