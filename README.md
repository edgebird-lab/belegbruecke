# Belegbrücke

E-Rechnungs-Eingang, GoBD-Archiv und DATEV-Übergabe für Kleinbetriebe. Die Belegbrücke nimmt eingehende E-Rechnungen an, prüft sie nach EN 16931 und XRechnung mit den offiziellen KoSIT- und CEN-Artefakten und erklärt Fehler in Klartext. Sie bewahrt das Original unverändert auf, mit Prüfbericht und einem Protokoll, das eine SHA-256-Hashkette sichert, und erzeugt monatlich die Übergabe an die Steuerkanzlei. Läuft lokal, ohne KI, ohne Cloud und ohne Java.

> **In Entwicklung.** Fertig sind Fachkern, Prüfung, Archiv und Server (Phasen 0 bis 2); die Oberfläche mit den Assistenten folgt in Phase 3, Kontierung und DATEV-Übergabe in Phase 4. Stand: [docs/stand.md](docs/stand.md). Annahmen, die noch eine Entscheidung brauchen: [docs/entscheidungen.md](docs/entscheidungen.md). Spezifikation: [docs/spezifikation.md](docs/spezifikation.md).

## Was es schon kann

- **Prüfung wie der KoSIT-Validator, ohne Java.** Die offiziellen Schematron-Regeln (CEN EN 16931 1.3.16, XRechnung 2.6.0) laufen als vorkompilierte XSLT in SaxonJS, das XML-Schema mit libxml2 als WebAssembly. Für alle 86 Testdateien der KoSIT-Testsuite und 8 Mutationen ergeben sich dieselben Szenarien, Regel-IDs, Stufen und Annahmen wie beim KoSIT-Validator 1.6.3 (Referenzlauf mit Java, Ergebnis als Test eingefroren).
- **Formate:** XRechnung 3.0 (UBL, CII, Extension, CVD), EN 16931, ZUGFeRD/Factur-X als PDF mit eingebettetem XML (EN 16931, BASIC, EXTENDED, XRECHNUNG). MINIMUM, BASIC WL, ZUGFeRD 1.0 und PDF ohne XML erkennt sie als „sonstige Rechnung“.
- **Klartext:** 61 Regeln der Regelwerke und 35 eigene mit deutscher Erklärung, Handlung und Einordnung nach dem BMF-Schreiben vom 15.10.2025 (Formatfehler, Geschäftsregelfehler, Inhaltsfehler; umsatzsteuerlich relevant oder nicht): [docs/regelkatalog.md](docs/regelkatalog.md).
- **Pflichtangaben** nach § 14 Abs. 4 UStG, Kleinbetrag (§ 33 UStDV), Kleinunternehmer (§ 34a UStDV), Empfängerprüfung gegen die eigene Firma und Plausibilität (Steuersatz, IBAN-Prüfziffer, Datum, Währung).
- **Daten** aus allen drei Syntaxen über das Zwischenmodell der KoSIT-Visualisierung; die HTML-Ansicht der KoSIT läuft in einer Sandbox ohne Zugriff auf die App.
- **Dubletten** in drei Stufen: identische Datei, gleiche Rechnung (auch UBL gegen CII oder PDF gegen XML), ähnliche Rechnung, mit Abweichungen in Klartext.
- **GoBD-Archiv:** Originale inhaltsadressiert und schreibgeschützt, Prüfbericht je Beleg, Protokoll mit SHA-256-Hashkette, Kettenprüfung samt Dateien, Aufbewahrungsfrist nach § 147 AO und § 14b UStG, tägliche Sicherung mit Wiederherstellungstest.
- **Server** auf 127.0.0.1 mit Anmeldung (scrypt), Sperre nach Fehlversuchen, Schutz gegen CSRF und DNS-Rebinding, strenger CSP und Prüfung in Workern mit Zeit- und Speichergrenze.

## Starten

Unter Windows genügt ein Doppelklick auf `start.cmd`: Beim ersten Start installiert es die Abhängigkeiten, lädt die Prüfartefakte und baut die Oberfläche; danach öffnet sich der Browser auf `http://127.0.0.1:8784`. Daten liegen in `daten/` (änderbar mit `BB_DATEN`). Beim ersten Aufruf legt man den ersten Benutzer an (bis zur Oberfläche aus Phase 3 über die API, siehe unten).

## Entwickeln

```bash
npm install
npm run vorbereiten   # KoSIT-Artefakte mit Prüfsumme laden, XSLT zu SEF kompilieren
npm run server        # Server auf 127.0.0.1:8784 (liefert dist/ aus, wenn gebaut)
npm run dev           # Oberfläche (Vite, Port 5184) mit Weiterleitung von /api an den Server
npm test              # Unit-Tests (Vitest)
npm run abdeckung     # Zweigabdeckung der Fachlogik (Schwelle 90 %)
npm run e2e           # Browsertests gegen den echten Server auf Port 4184 (lokal mit Edge)
npm run build         # Typprüfung und Produktions-Build
npm run referenz      # Referenzlauf mit dem KoSIT-Validator (braucht Java 21 und npm run artefakte -- --referenz)
```

Weitere Skripte: `node scripts/mutationen.mjs` (Mutationen M1 bis M8), `node scripts/zugferd-testdaten.mjs` (Test-PDFs), `node scripts/referenz-mustang.mjs` (Mustang-Referenz, Java), `node scripts/regelkatalog.mjs` und `node scripts/lizenzen.mjs` (Doku).

**API** (JSON unter `/api`, ändernde Anfragen mit `X-Belegbruecke: 1` und passendem `Origin`): `POST /einrichtung/benutzer` (erster Benutzer), `POST /anmelden`, `POST /abmelden`, `GET /sitzung`, `GET`/`PUT /einstellungen`, `POST /belege` (multipart, Feld `dateien`), `GET /belege?status=&monat=&suche=`, `GET /belege/:id`, `GET /belege/:id/original`, `/bericht`, `/ansicht`, `POST /archiv/pruefen`, `GET /status`.

## Aufbau

| Ordner | Inhalt |
| --- | --- |
| `src/fach` | Fachlogik ohne React und ohne Node-APIs: Datenmodell, Beträge, Formaterkennung, Pflichtangaben, Plausibilität, Dubletten, Lieferanten, Aufbewahrung, Hashkette, Klartext-Katalog |
| `src/pruefung` | Prüfung in Node-Workern: Szenarien, XSD (xmllint-wasm), Schematron und Ansicht (SaxonJS), PDF (pdf.js), Worker-Pool |
| `src/server` | Hono-Server: API, Eingangsdienst, Kettenprüfung, SQLite (`node:sqlite`), Dateiablage, Anmeldung und Schutz |
| `src/ui` | React-Oberfläche (bisher Startseite mit Serverstatus) |
| `scripts` | Artefakte laden, SEF kompilieren, Referenzläufe, Testdaten, Doku |
| `vendor` | Liste der Prüfartefakte mit Prüfsummen, Lizenztexte; die Artefakte selbst lädt `npm run vorbereiten` |
| `testdaten` | Mutationen, ZUGFeRD-Test-PDFs, Referenz-Snapshots (KoSIT-Testsuite per Skript) |
| `docs` | [Spezifikation](docs/spezifikation.md), [Stand](docs/stand.md), [Entscheidungen](docs/entscheidungen.md), [Datenmodell](docs/datenmodell.md), [Regelkatalog](docs/regelkatalog.md), [Sicherheit](docs/sicherheit.md), [Lizenzen Dritter](docs/lizenzen-dritter.md) |

**Technik:** TypeScript 7, Node 24 (führt den Server direkt als TypeScript aus), React 19, Vite 8, Hono 4, zod 4, SaxonJS 2.7, xmllint-wasm 5, pdf.js 6, SQLite über `node:sqlite`, Vitest, Playwright mit axe.

## Qualität

- Zweigabdeckung der Fachlogik (`src/fach`) 92,7 %, Anweisungen 98,4 %, als Schwelle in `npm run abdeckung`.
- Unit-Tests für alle Fachregeln mit von Hand nachgerechneten Werten, die Testfälle der Spezifikation (T-F, T-Z, T-V, T-X, T-P, T-D, T-H, T-A, T-S) und die Testvektoren der Hashkette.
- Gleichlauf mit dem KoSIT-Validator für alle 86 Testdateien der KoSIT-Testsuite (`testdaten/referenz/kosit-1.6.3.json`), Extraktion aller 86 Dateien mit stimmigen Summen.
- Browsertests gegen den echten Server mit axe (hell und dunkel), Sicherheitsheadern, CSP und der Ansicht im Sandbox-iframe (XSS-Testdatei der KoSIT).
- Bei jedem Push laufen Lint, Unit-Tests und Build in der CI; die Browsertests lokal vor jedem Commit.

## Grenzen

- Die DATEV-Formate sind noch nicht an der Primärquelle bestätigt; die Übergabe (Phase 4) wird zunächst als „Vorschau“ gebaut.
- ZUGFeRD EXTENDED wird gegen EN 16931 geprüft; 12 Regeln, die bei gültigen EXTENDED-Rechnungen anschlagen, zählen dort nur als Warnung. Die Erweiterungen selbst prüft die App nicht. ZUGFeRD 2.0 mit `urn:zugferd.de:2p0:`-Kennung ist noch nicht zugeordnet.
- PDF/A, Signaturen und Zeitstempel werden nicht geprüft.

## Rechtliches

Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a). Keine Steuer- oder Rechtsberatung. Software allein macht kein Verfahren GoBD-konform; nötig sind Verfahrensdokumentation, Zugriffsregeln und Sicherung. DATEV, ZUGFeRD und Factur-X werden nur beschreibend genannt.

## Lizenz

Noch nicht festgelegt (offene Frage 9 der Spezifikation). Das Repo ist privat. SaxonJS steht unter einer proprietären, kostenlosen Lizenz; Einzelheiten in [docs/lizenzen-dritter.md](docs/lizenzen-dritter.md).
