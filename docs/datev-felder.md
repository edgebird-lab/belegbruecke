# Belegbrücke – Notizen zum DATEV-Format (EXTF Buchungsstapel)

Eigene Notizen der Belegbrücke, keine DATEV-Dokumentation. **Ungeprüft**, bis Robin die Formatbeschreibung (DATEV-Dok.-Nr. 1036228) an der Primärquelle liest (Schritt 0.6) und die Kanzlei einen Probeimport macht (Schritt 4.7). Bis dahin heißt der Export „Vorschau“.

Quelle der Feldliste: quelloffene Bibliothek `ledermann/datev` (MIT), Dateien `lib/datev/base/booking.rb` und `lib/datev/base/header.rb`, Stand Commit 5bf02e0 vom 26.02.2026.

## Datei

- CSV mit `;`, Zeilenende CR LF, Windows-1252 ohne BOM (offene Frage 5: UTF-8?).
- Zeile 1 Kopf mit 31 Feldern, Zeile 2 die 125 Spaltenüberschriften ohne Anführungszeichen, ab Zeile 3 je Buchung eine Zeile.
- Texte in doppelten Anführungszeichen (innere verdoppelt), Zahlen ohne; leere Felder bleiben leer (im Kopf leere Textfelder als `""`, wie im Beispiel der Spezifikation).
- Dateiname `EXTF_Buchungsstapel_<Berater>_<Mandant>_<JJJJ-MM>[_N<n>].csv`.

## Kopfzeile (gefüllte Felder)

| Nr. | Feld | Wert in der Belegbrücke |
| --- | --- | --- |
| 1 | DATEV-Format-KZ | `"EXTF"` |
| 2 | Versionsnummer | `700` |
| 3 | Datenkategorie | `21` (Buchungsstapel) |
| 4 | Formatname | `"Buchungsstapel"` |
| 5 | Formatversion | `13` |
| 6 | Erzeugt am | `JJJJMMTTHHMMSSmmm`, Ortszeit Europe/Berlin |
| 8 | Herkunft | `"RE"` |
| 9 | Exportiert von | Einstellung, höchstens 25 Zeichen |
| 11, 12 | Berater, Mandant | Einstellungen |
| 13 | WJ-Beginn | letzter Beginn des Wirtschaftsjahrs am oder vor dem Monatsersten |
| 14 | Sachkontenlänge | Einstellung |
| 15, 16 | Datum vom, bis | erster und letzter Tag des Monats |
| 17 | Bezeichnung | `"Belegbrücke MM/JJJJ"`, Nachtrag mit ` N<n>` |
| 19, 20, 21 | Buchungstyp, Rechnungslegungszweck, Festschreibung | `1`, `0`, `0` |
| 22 | WKZ | `"EUR"` |
| 27 | SKR | `"03"` oder `"04"` |

## Buchungszeile (gefüllte Felder)

| Nr. | Feld | Wert |
| --- | --- | --- |
| 1 | Umsatz | Brutto der Kontierungszeile, z. B. `688,88` (immer positiv) |
| 2 | Soll/Haben-Kennzeichen | `"H"` (Rechnung) oder `"S"` (Gutschrift oder negativer Betrag), bezogen auf das Kreditorenkonto |
| 3 | WKZ Umsatz | `"EUR"` |
| 7 | Konto | Kreditorenkonto |
| 8 | Gegenkonto | Sachkonto, links mit Nullen auf die Sachkontenlänge |
| 9 | BU-Schlüssel | nach Einstellung, leer bei Automatikkonten |
| 10 | Belegdatum | `TTMM` |
| 11 | Belegfeld 1 | Rechnungsnummer; Zeichen außerhalb `A–Z a–z 0–9 $ & % * + - /` als `-`, höchstens 36 |
| 14 | Buchungstext | Lieferant und Rechnungsnummer, höchstens 60 |
| 20 | Beleglink | `BEDI "<Beleg-ID>"`, nur mit DUO-Paket (vorerst nie) |
| 114 | Festschreibung | `0` |
| 115 | Leistungsdatum | `TTMMJJJJ` aus BT-72, sonst leer |

## Für den Probeimport zu klären

1. Nimmt DATEV die Datei in Windows-1252 an, oder lieber UTF-8?
2. Stimmen BU 9 (Vorsteuer 19 %) und BU 8 (Vorsteuer 7 %), und welche Sachkonten sind Automatikkonten?
3. Werden die Kreditorenkonten ohne Stammdaten angenommen, oder braucht die Kanzlei zusätzlich eine Datei mit den Kreditoren?
4. Passen Belegdatum `TTMM` und Wirtschaftsjahr zur Monatsgruppierung nach Rechnungsdatum (offene Frage 13)?
