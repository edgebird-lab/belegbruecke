# Belegbrücke – Datenmodell

Die Typen stehen vollständig in [`src/fach/typen.ts`](../src/fach/typen.ts) (Spezifikation, Abschnitt 4). Diese Seite erklärt, wie sie gespeichert werden und wie ein Beleg durch die App läuft. Stand: Phasen 0 bis 2.

## Grundregeln

- **Beträge** sind Cent-Ganzzahlen (`Cent`), nie Gleitkommazahlen. Der Betragsparser (`src/fach/betrag.ts`) liest Dezimaltext nach xs:decimal; mehr als 2 Nachkommastellen auf Belegebene ergeben den Befund `BETRAG-FORMAT`.
- **Daten** sind ISO-Kalenderdaten (`2026-11-11`), **Zeitpunkte** ISO in UTC. Jahresgrenzen (Aufbewahrung) rechnen nach Ortszeit Europe/Berlin.
- **IDs** sind UUID v4 in Großbuchstaben; die Beleg-ID dient später als DATEV-Beleg-GUID.
- Gespeicherte JSON-Strukturen tragen `formatVersion: 1`; Erweiterungen nur additiv. Bisher ergänzt: `Rechnungsdaten.steuervertreterUstId` (BT-63, für R8 Nr. 2).

## Ein Beleg von der Datei bis zum Archiv

| Schritt | Modul | Ergebnis |
| --- | --- | --- |
| Annahme (R1) | `src/fach/annahme.ts` | Dateiart nach Inhalt (XML, PDF, JPEG, PNG), Größengrenzen; sonst Protokoll `eingang-verworfen` |
| Identische Datei (R9 Stufe 1) | `src/server/dienste/eingang.ts` | gleicher SHA-256 → kein neuer Beleg, `eingang-verworfen` mit Verweis |
| Ablage (7.5) | `src/server/speicher/ablage.ts` | `originale/<sha[0:2]>/<sha>.<endung>`, schreibgeschützt; Beleg `eingegangen`, Protokoll `eingang` |
| PDF (R5) | `src/pruefung/pdf.ts` | eingebettetes XML (`factur-x.xml`, `xrechnung.xml`, `zugferd-invoice.xml`) oder „PDF ohne E-Rechnung“ |
| Format (R2 bis R4) | `src/fach/zeichensatz.ts`, `formaterkennung.ts` | `Formaterkennung`: Belegart, Syntax, Profil, BT-24, Zeichensatz |
| Prüfung (R6) | `src/pruefung/validierung.ts` | Szenario, XSD, Schematron, Stufen, Annahme wie der KoSIT-Validator |
| Daten (1.5) | `src/pruefung/extraktion.ts`, `src/fach/zwischenmodell.ts` | `Rechnungsdaten` über das KoSIT-Zwischenmodell |
| Pflichtangaben, Plausibilität (R8, R11) | `src/fach/pflichtangaben.ts`, `plausibilitaet.ts` | weitere Befunde, `Pflichtangabenpruefung` |
| Prüfbericht (R6 Punkt 9) | `src/fach/pruefbericht.ts` | `Pruefergebnis` als `berichte/<beleg-id>/<n>.json`, Hash im Protokoll `pruefung`; Ampel |
| Dubletten (R9 Stufen 2, 3) | `src/fach/dubletten.ts` | `Dublettenhinweis[]` im Beleg |
| Aufbewahrung (R15) | `src/fach/aufbewahrung.ts` | `aufbewahrenBis` bei Eingang, erneut bei Freigabe |

Status nach der Prüfung: E-Rechnungen `geprueft`, sonstige Rechnungen bleiben `eingegangen` bis zur Erfassung von Hand (R16, Phase 3). Kontierung, Freigabe und Übergabe folgen in Phase 3 und 4.

## Datenbank

`belegbruecke.sqlite` im Datenordner (`BB_DATEN`, Standard `./daten`), WAL-Modus, Fremdschlüssel an. Schema in [`src/server/speicher/migrationen.ts`](../src/server/speicher/migrationen.ts), Version über `PRAGMA user_version`. Alle Tabellen sind STRICT.

| Tabelle | Inhalt | Schlüssel- und Suchspalten |
| --- | --- | --- |
| `einstellungen` | eine Zeile, `Einstellungen` als JSON | – |
| `benutzer` | bis zu 3 Benutzer mit scrypt-Hash | `anmeldename` (eindeutig, ohne Groß-/Kleinschreibung) |
| `dateien` | jede abgelegte Datei mit SHA-256 | `pfad`, `sha256`, `art` (original, eml, bericht, export) |
| `belege` | `Beleg` als JSON | `laufnummer`, `status`, `original_sha256`, `xml_sha256`, `lieferant_schluessel`, `rechnungsnummer`, `rechnungsdatum`, `brutto_cent`, `monat`, `suche` |
| `lieferanten` | `Lieferant` als JSON (Phase 3) | `schluessel`, `kreditor_konto` |
| `kontierungsregeln` | Regeln je Lieferant, Kategorie, Satz (Phase 4) | Primärschlüssel aus den drei |
| `sachkonten` | Kontenplan (Phase 4) | `nummer` |
| `exportlaeufe` | Übergaben je Monat und Nachtrag (Phase 4) | `monat`, `nachtrag_nr` |
| `protokoll` | GoBD-Protokoll mit Hashkette | `nr`, `hash`; Trigger verhindern UPDATE und DELETE |
| `sicherheitslog` | Anmeldeereignisse, getrennt vom GoBD-Protokoll | `zeitpunkt`; IP nach 7 Tagen gelöscht, Einträge nach 90 Tagen |
| `postfach_gesehen` | Idempotenz des Postfachs (Phase 5) | `message_id`, `anhang_sha256` |

## Protokoll (R17)

Jeder Eintrag: `nr` (lückenlos ab 1), `zeitpunkt`, `akteur` (Benutzer oder Systemdienst), `aktion`, `belegId`, `daten`, `vorgaengerHash`, `hash`. Der Hash ist SHA-256 über das kanonische JSON (`src/fach/kanonisch.ts`) aller Felder außer `hash`; der erste Eintrag verweist auf 64 × „0“. Die Testvektoren der Spezifikation sind Tests (T-H1).

| Aktion | Pflichtinhalte von `daten` (R17 Punkt 5) und Zusätze |
| --- | --- |
| `eingang` | Dateiname, Größe, SHA-256, Quelle; Ablagepfad, Laufnummer |
| `eingang-verworfen` | wie `eingang` plus Grund (`DATEI-TYP`, `DATEI-GROESSE`, `DATEI-LEER`, `identische-datei`) und ggf. den anderen Beleg |
| `pruefung` | Annahme, Szenario, Berichts-Hash; Berichtspfad, Format, Zahl der Befunde, Dubletten |
| `einstellungen-geaendert` | Bereich und Änderungen mit altem und neuem Wert (Passwörter nie) |
| `kette-geprueft` | Ergebnis, Zahl der Einträge und Dateien, Fehler, letzter Eintrag |

Die Kettenprüfung (`src/server/dienste/kette.ts`) rechnet alle Hashes nach und vergleicht jede Datei unter `originale/` und `berichte/` mit dem Hash aus ihrem Eintrag.

## Datenordner

| Pfad | Inhalt |
| --- | --- |
| `belegbruecke.sqlite` | Datenbank (WAL) |
| `originale/<sha[0:2]>/<sha>.<endung>` | Originale, schreibgeschützt |
| `berichte/<beleg-id>/<n>.json` | Prüfberichte, nie überschrieben |
| `cache/ansicht/<xml-sha256>.html` | HTML-Ansichten, jederzeit neu erzeugbar |
| `sicherung/belegbruecke-<datum>.sqlite` | tägliche Kopie mit `VACUUM INTO` |
| `exporte/<exportlauf-id>/` | Übergabedateien (Phase 4) |
