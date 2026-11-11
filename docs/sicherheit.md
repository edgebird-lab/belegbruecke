# Belegbrücke – Sicherheitsdurchsicht

Durchsicht nach [Spezifikation, Abschnitt 8](spezifikation.md#8-sicherheit-und-datenschutz), Stand 11.11.2026 (Phasen 0 bis 5). `[x]` umgesetzt und getestet, `[~]` teilweise, `[ ]` offen.

## Maßnahmen

- [x] **Eingaben aus dem Netz:** Dateiart nach Inhalt und Größengrenzen (R1, `src/fach/annahme.ts`, T-F6, T-F7), keine DTD und keine Entities vor jedem Parser (R2, T-F2, T-S6 „Billion Laughs“ in unter 100 ms), Zeitlimits für PDF (20 s) und Prüfung (60 s), Verarbeitung im Worker mit 1 GB Heap (`src/pruefung/pool.ts`, Tests für Zeitlimit und Speicherüberlauf). Grenze: dekomprimierte PDF-Ströme liegen außerhalb des Heaps (docs/entscheidungen.md, T8). E-Mails höchstens 50 MB und 20 Anhänge; nur XML- und PDF-Anhänge werden Belege (R23).
- [x] **Pfade:** Dateinamen aus Uploads und Mails nie als Pfad; Ablage nur nach SHA-256, Berichte nach Beleg-ID (UUID geprüft), Exporte nach Lauf-ID mit geprüftem Dateinamen; `Ablage.absolut` lässt nur Pfade unter `originale/`, `berichte/`, `exporte/`, `cache/` zu (T-S4 in `ablage.test.ts` und `api.test.ts`). Die Ablage legt Dateien mit einem harten Link atomar an; bei gleichzeitigen Uploads derselben Datei gewinnt genau einer.
- [x] **Ansicht:** KoSIT-HTML mit eigener CSP `sandbox allow-scripts allow-downloads; default-src 'none'; …; frame-ancestors 'self'` (T-S8). Die Oberfläche bettet sie im Schritt „Ansehen“ als `iframe sandbox="allow-scripts allow-downloads"` ohne `allow-same-origin` ein (Browsertest U-2 prüft das Attribut); die XSS-Testdatei der KoSIT öffnet keinen Dialog im App-Kontext (T-S5).
- [x] **PDF und Bilder in der Oberfläche:** nur mit `?anzeige=1` und eigener CSP (`default-src 'none'; img-src 'self' data:; frame-ancestors 'self'`), sonst als Download. XML wird nie im Browser geöffnet, weil ein Stylesheet darin Skripte ausführen könnte.
- [x] **PDF im Server:** pdf.js liest nur Anhänge, rendert nichts, führt keine Skripte aus; pdf.js 6 enthält keinen eval-Pfad mehr (`isEvalSupported` entfällt).
- [x] **Externe Links in Rechnungen** (BT-124) werden nie abgerufen, nur als Hinweis gemeldet (PLAUS-ANHANG-EXTERN) und in der Oberfläche als Text gezeigt.
- [x] **Anmeldung:** scrypt N = 2^17, r = 8, p = 1, Salt 16 Byte, maxmem 256 MiB; Prüfung in konstanter Zeit, auch für unbekannte Namen (`src/server/sicherheit/passwort.ts`). Cookie `HttpOnly`, `SameSite=Strict`, `Secure` unter HTTPS; 8 h Leerlauf-Ablauf (`sicherheit.test.ts`). Browsertest: falsches und richtiges Passwort, Abmelden.
- [x] **CSRF:** SameSite plus Pflicht-Kopfzeile `X-Belegbruecke: 1` bei ändernden Anfragen (T-S2); die Oberfläche setzt sie in `src/ui/api.ts`.
- [x] **Ratenbegrenzung:** nach 5 Fehlversuchen je Anmeldename 15 Minuten Sperre, auch für das richtige Passwort (T-S1).
- [x] **Header:** CSP der App, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` auf jeder Antwort, auch auf Fehlerantworten (T-S3); API-Antworten mit `Cache-Control: no-store`. Browsertest ruft alle Seiten der Oberfläche auf und prüft, dass keine CSP-Verstöße auftreten (keine Inline-Skripte, keine Inline-Styles im HTML).
- [x] **Downloads:** `Content-Disposition: attachment` mit ASCII- und UTF-8-Dateinamen, MIME-Typ des Originals; Exportdateien `text/csv; charset=windows-1252` bzw. `application/zip`.
- [x] **Postfach-Passwort:** AES-256-GCM, gespeichert als Base64(iv | tag | daten); der 32-Byte-Schlüssel liegt in einer eigenen Datei außerhalb des Datenordners (`BB_SCHLUESSEL_DATEI`, Standard `<Datenordner>.schluessel` daneben, Rechte 600, `*.schluessel` in `.gitignore`). Nur schreibbar (`PUT /api/postfach/passwort`), nie in einer Antwort, nie im Protokoll (nur „geändert“). T-I3 prüft, dass weder Datenbank noch WAL das Passwort im Klartext enthalten.
- [x] **Netz:** Server lauscht nur auf `127.0.0.1` (`src/server/start.ts`, Test gegen den echten Server). IMAP nur über TLS (implizit, mindestens TLS 1.2, Zertifikat wird geprüft); kein STARTTLS, keine unverschlüsselte Verbindung. Der Port ist frei wählbar (Standard 993), damit der Testserver läuft. `BB_IMAP_CA` fügt einen Vertrauensanker hinzu und ist nur für die Tests gedacht.
- [x] **DNS-Rebinding:** nur `Host` gleich `127.0.0.1:<port>` oder `localhost:<port>`, sonst 421; ändernde Anfragen nur mit passendem `Origin`, sonst 403 (T-S7, auch über echtes HTTP mit gefälschtem Host).
- [x] **Protokolle:** GoBD-Protokoll ohne IP-Adressen und ohne Passwörter; Anmeldeereignisse nur im `sicherheitslog`. Aufräumen: IP nach 7 Tagen, Einträge nach 90 Tagen (beim Start und stündlich geprüft). E-Mail-Eingänge stehen mit Message-ID, Absender und Hash der Roh-Mail im Protokoll.
- [~] **Abhängigkeiten:** Lockfile im Repo; `npm audit` lokal ohne Befund (0 vulnerabilities, 11.11.2026, auch nach imapflow und mailparser). In der CI läuft `npm audit` nicht, weil die Vorgabe für diesen Durchgang die CI auf Lint, Tests und Build beschränkt; Robin entscheidet, ob es dazukommt. Lizenzen: [lizenzen-dritter.md](lizenzen-dritter.md).
- [~] **Sicherung:** tägliche Kopie der Datenbank mit `VACUUM INTO` nach `sicherung/` (beim Start und stündlich geprüft, höchstens eine je Tag). Wiederherstellungstest grün (`src/server/sicherung.test.ts`). Offen: Sicherung des ganzen Datenordners und der Schlüsseldatei außerhalb des Rechners (später restic wie beim VPS-Backup). Ohne Schlüsseldatei lässt sich das Postfach-Passwort nicht mehr entschlüsseln; die App meldet das und verlangt es neu.
- [x] **Integrität:** Hashkette (R17), Schreibschutz der Originale, Trigger gegen UPDATE und DELETE auf `protokoll` (T-H5), Kettenprüfung mit Dateien einschließlich Roh-Mails (T-H1 bis T-H4, T-I1). Kettenanker im Übergabeprotokoll (U-4) und Prüfung gegen eingegebene Anker im Archiv.
- [x] **Betroffenenrechte:** Archivsuche über Name, E-Mail, Rechnungsnummer, Betrag und Zeitraum in der Oberfläche (Schritt 3.8). Löschung erst nach Fristablauf, Funktion später.
- [x] **Keine Weitergabe:** keine Telemetrie, keine externen Dienste, keine Schriften oder Skripte aus CDNs (CSP `default-src 'self'` erzwingt das für die Oberfläche). Das Postfach ist der einzige ausgehende Netzverkehr und nur nach Einrichtung durch den Benutzer aktiv.

## Wiederherstellung (Ablauf)

1. Server beenden.
2. Neuen Datenordner anlegen; `sicherung/belegbruecke-<datum>.sqlite` als `belegbruecke.sqlite` hineinkopieren.
3. `originale/` und `berichte/` aus der Ordnersicherung daneben legen (`cache/` ist nicht nötig, die Ansicht entsteht neu; `exporte/` nur, wenn alte Übergaben erneut heruntergeladen werden sollen). Die Schlüsseldatei neben den Datenordner legen oder das Postfach-Passwort neu eingeben.
4. Server mit `BB_DATEN=<neuer Ordner>` starten und unter „Archiv prüfen“ die Kette prüfen. Belege nach der Sicherung fehlen; ihre Dateien meldet die Prüfung als „Datei ohne Protokolleintrag“.

## Restrisiken

- Ein Administrator mit Dateizugriff kann Protokoll und Dateien vollständig neu schreiben; erkennbar ist das nur über die Kettenanker bei der Kanzlei und getrennte Sicherungen.
- Sitzungen liegen im Speicher; nach einem Neustart meldet man sich neu an.
- Der PDF-Betrachter des Browsers zeigt fremde PDFs; er läuft getrennt von der Seite, die CSP der Antwort verbietet Nachladen. PDF/A, Signaturen und Zeitstempel prüft die App nicht.
- IMAP mit Passwort; OAuth2 (Microsoft 365, Gmail) folgt später. Anbieter ohne App-Passwort lassen sich nur per Upload anbinden.
