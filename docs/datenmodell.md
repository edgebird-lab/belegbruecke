# Belegbrücke – Datenmodell

Die Typen stehen vollständig in [`src/fach/typen.ts`](../src/fach/typen.ts) (Spezifikation, Abschnitt 4). Diese Seite erklärt, wie sie gespeichert werden und wie ein Beleg durch die App läuft. Stand: Phasen 0 bis 5.

## Grundregeln

- **Beträge** sind Cent-Ganzzahlen (`Cent`), nie Gleitkommazahlen. Der Betragsparser (`src/fach/betrag.ts`) liest Dezimaltext nach xs:decimal; mehr als 2 Nachkommastellen auf Belegebene ergeben den Befund `BETRAG-FORMAT`. Eingaben in der Oberfläche („1.234,56“) liest `leseBetragEingabe`.
- **Daten** sind ISO-Kalenderdaten (`2026-11-11`), **Zeitpunkte** ISO in UTC. Jahresgrenzen (Aufbewahrung) und der Zeitstempel im EXTF-Kopf rechnen nach Ortszeit Europe/Berlin.
- **IDs** sind UUID v4 in Großbuchstaben; die Beleg-ID dient als DATEV-Beleg-GUID, sobald das DUO-Paket kommt.
- Gespeicherte JSON-Strukturen tragen `formatVersion: 1`; Erweiterungen nur additiv. Bisher ergänzt: `Rechnungsdaten.steuervertreterUstId` (BT-63, für R8 Nr. 2) und im `Exportlauf` die Angaben für das Übergabeprotokoll (`beraternummer`, `mandantennummer`, `exportmodus`, `nurBelegIds`, `hinweise`).

## Ein Beleg von der Datei bis zur Übergabe

| Schritt | Modul | Ergebnis |
| --- | --- | --- |
| Annahme (R1) | `src/fach/annahme.ts` | Dateiart nach Inhalt (XML, PDF, JPEG, PNG), Größengrenzen; sonst Protokoll `eingang-verworfen` |
| Postfach (R23) | `src/server/postfach/` | XML- und PDF-Anhänge einer Mail werden je ein Beleg; Roh-Mail als `.eml`, wenn gewünscht und ein neuer Beleg entsteht |
| Identische Datei (R9 Stufe 1) | `src/server/dienste/eingang.ts` | gleicher SHA-256 → kein neuer Beleg, `eingang-verworfen` mit Verweis |
| Ablage (7.5) | `src/server/speicher/ablage.ts` | `originale/<sha[0:2]>/<sha>.<endung>`, atomar und schreibgeschützt; Beleg `eingegangen`, Protokoll `eingang` |
| PDF (R5) | `src/pruefung/pdf.ts` | eingebettetes XML (`factur-x.xml`, `xrechnung.xml`, `zugferd-invoice.xml`) oder „PDF ohne E-Rechnung“ |
| Format (R2 bis R4) | `src/fach/zeichensatz.ts`, `formaterkennung.ts` | `Formaterkennung`: Belegart, Syntax, Profil, BT-24, Zeichensatz |
| Prüfung (R6) | `src/pruefung/validierung.ts` | Szenario, XSD, Schematron, Stufen, Annahme wie der KoSIT-Validator |
| Daten (1.5) | `src/pruefung/extraktion.ts`, `src/fach/zwischenmodell.ts` | `Rechnungsdaten` über das KoSIT-Zwischenmodell |
| Pflichtangaben, Plausibilität (R8, R11) | `src/fach/pflichtangaben.ts`, `plausibilitaet.ts` | weitere Befunde, `Pflichtangabenpruefung` |
| Prüfbericht (R6 Punkt 9) | `src/fach/pruefbericht.ts` | `Pruefergebnis` als `berichte/<beleg-id>/<n>.json`, Hash im Protokoll `pruefung`; Ampel |
| Dubletten (R9 Stufen 2, 3) | `src/fach/dubletten.ts` | `Dublettenhinweis[]` im Beleg; Entscheidung in B4 |
| Erfassung von Hand (R16) | `src/fach/handerfassung.ts` | bei sonstigen Rechnungen `Handerfassung`, neuer Prüfbericht, Status `geprueft` |
| Zuordnen (R10) | `src/fach/lieferant.ts`, `src/server/dienste/belegschritte.ts` | `Lieferant` mit Schlüssel, Kreditorenkonto vorgeschlagen |
| Kontieren (R12, R13) | `src/fach/kontierung.ts` | `Kontierung` mit Zeilen je Steuersatz, Status `kontiert` |
| Freigabe (R14) | `src/fach/freigabe.ts` | Status `freigegeben`, Kreditorenkonto vergeben, `Kontierungsregel`n fortgeschrieben, Aufbewahrung neu |
| Übergabe (R19 bis R21) | `src/fach/uebergabe.ts`, `src/fach/datev/`, `src/server/dienste/uebergabe.ts` | `Exportlauf` mit EXTF-Datei und Belegpaket unter `exporte/<lauf-id>/`, Status `exportiert` |
| Aufbewahrung (R15) | `src/fach/aufbewahrung.ts` | `aufbewahrenBis` bei Eingang, nach der Erfassung von Hand und bei Freigabe |

Statusübergänge und erlaubte Aktionen stehen in `src/fach/freigabe.ts` (`aktionErlaubt`); Abweichungen von der Tabelle der Spezifikation in [entscheidungen.md](entscheidungen.md#t11-kontierung-freigabe-und-übergabe-phase-4-api-zu-phase-3).

## Datenbank

`belegbruecke.sqlite` im Datenordner (`BB_DATEN`, Standard `./daten`), WAL-Modus, Fremdschlüssel an. Schema in [`src/server/speicher/migrationen.ts`](../src/server/speicher/migrationen.ts), Version über `PRAGMA user_version`. Alle Tabellen sind STRICT.

| Tabelle | Inhalt | Schlüssel- und Suchspalten |
| --- | --- | --- |
| `einstellungen` | eine Zeile, `Einstellungen` als JSON (Postfach-Passwort nur verschlüsselt) | – |
| `benutzer` | bis zu 3 Benutzer mit scrypt-Hash | `anmeldename` (eindeutig, ohne Groß-/Kleinschreibung) |
| `dateien` | jede abgelegte Datei mit SHA-256 | `pfad`, `sha256`, `art` (original, eml, bericht, export) |
| `belege` | `Beleg` als JSON | `laufnummer`, `status`, `original_sha256`, `xml_sha256`, `lieferant_schluessel`, `rechnungsnummer`, `rechnungsdatum`, `brutto_cent`, `monat`, `suche` |
| `lieferanten` | `Lieferant` als JSON | `schluessel`, `kreditor_konto` (beide eindeutig) |
| `kontierungsregeln` | Regeln je Lieferant, Kategorie, Satz | Primärschlüssel aus den drei |
| `sachkonten` | Kontenplan | `nummer` |
| `exportlaeufe` | `Exportlauf` je Monat und Nachtrag | `monat`, `nachtrag_nr` (gemeinsam eindeutig) |
| `protokoll` | GoBD-Protokoll mit Hashkette | `nr`, `hash`; Trigger verhindern UPDATE und DELETE |
| `sicherheitslog` | Anmeldeereignisse, getrennt vom GoBD-Protokoll | `zeitpunkt`; IP nach 7 Tagen gelöscht, Einträge nach 90 Tagen |
| `postfach_gesehen` | Idempotenz des Postfachs | `message_id`, `anhang_sha256` |

## Protokoll (R17)

Jeder Eintrag: `nr` (lückenlos ab 1), `zeitpunkt`, `akteur` (Benutzer oder Systemdienst `imap`, `pruefung`, `export`), `aktion`, `belegId`, `daten`, `vorgaengerHash`, `hash`. Der Hash ist SHA-256 über das kanonische JSON (`src/fach/kanonisch.ts`) aller Felder außer `hash`; der erste Eintrag verweist auf 64 × „0“. Die Testvektoren der Spezifikation sind Tests (T-H1).

| Aktion | Pflichtinhalte von `daten` (R17 Punkt 5) und Zusätze |
| --- | --- |
| `eingang` | Dateiname, Größe, SHA-256, Quelle; Ablagepfad, Laufnummer; bei E-Mail Message-ID, Absender, Hash und Pfad der Roh-Mail |
| `eingang-verworfen` | wie `eingang` plus Grund (`DATEI-TYP`, `DATEI-GROESSE`, `DATEI-LEER`, `identische-datei`) und ggf. den anderen Beleg |
| `pruefung` | Annahme, Szenario, Berichts-Hash; Berichtspfad, Format, Zahl der Befunde, Dubletten; nach einer Erfassung von Hand mit `art: "handerfassung"` und den erfassten Werten |
| `dublette-entschieden` | Ergebnis und die anderen Belege |
| `lieferant-zugeordnet` | Lieferant (ID, Schlüssel, Name, neu oder vorhanden), Kreditorenkonto |
| `kontiert` | Zeilen mit Betrag, Kategorie, Satz, Steuerfall, Sachkonto, BU-Schlüssel, Buchungstext; Gründe für „von Hand prüfen“ |
| `freigegeben` | Kreditorenkonto, Zeilen, Bestätigung „Inhalt geprüft“, Begründung, „Vorsteuerabzug gefährdet“, Aufbewahrung |
| `freigabe-zurueckgenommen`, `abgelehnt`, `ablehnung-aufgehoben` | Grund, vorheriger bzw. neuer Status |
| `exportiert` | je Beleg der Lauf; dazu ein Eintrag des Laufs mit Dateien (Name, SHA-256, Größe), Belegliste und Summe. Dieser Eintrag ist der Kettenanker. |
| `einstellungen-geaendert` | Bereich und Änderungen mit altem und neuem Wert (Passwörter nie, nur „geändert“) |
| `kette-geprueft` | Ergebnis, Zahl der Einträge und Dateien, Fehler, letzter Eintrag |
| `prueferexport` | Zeitraum, Zahl der Belege, Dateiname und SHA-256 des ZIP |

Die Kettenprüfung (`src/server/dienste/kette.ts`) rechnet alle Hashes nach und vergleicht jede Datei unter `originale/` (auch Roh-Mails) und `berichte/` mit dem Hash aus ihrem Eintrag; optional mit Kettenankern aus Übergabeprotokollen.

## Datenordner

| Pfad | Inhalt |
| --- | --- |
| `belegbruecke.sqlite` | Datenbank (WAL) |
| `originale/<sha[0:2]>/<sha>.<endung>` | Originale und Roh-Mails (`.eml`), schreibgeschützt |
| `berichte/<beleg-id>/<n>.json` | Prüfberichte, nie überschrieben |
| `exporte/<exportlauf-id>/` | Übergabedateien (EXTF, Belegpaket), schreibgeschützt; erneuter Download bytegleich |
| `cache/ansicht/<xml-sha256>.html` | HTML-Ansichten, jederzeit neu erzeugbar |
| `sicherung/belegbruecke-<datum>.sqlite` | tägliche Kopie mit `VACUUM INTO` |

Neben dem Datenordner (nicht darin): `<Datenordner>.schluessel` mit dem 32-Byte-Schlüssel für das Postfach-Passwort (`BB_SCHLUESSEL_DATEI`).
