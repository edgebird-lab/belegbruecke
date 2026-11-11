# Belegbrücke – Sicherheitsdurchsicht

Durchsicht nach [Spezifikation, Abschnitt 8](spezifikation.md#8-sicherheit-und-datenschutz), Stand 11.11.2026 (Phasen 0 bis 2). `[x]` umgesetzt und getestet, `[~]` teilweise, `[ ]` offen mit Phase.

## Maßnahmen

- [x] **Eingaben aus dem Netz:** Dateiart nach Inhalt und Größengrenzen (R1, `src/fach/annahme.ts`, T-F6, T-F7), keine DTD und keine Entities vor jedem Parser (R2, T-F2, T-S6 „Billion Laughs“ in unter 100 ms), Zeitlimits für PDF (20 s) und Prüfung (60 s), Verarbeitung im Worker mit 1 GB Heap (`src/pruefung/pool.ts`, Tests für Zeitlimit und Speicherüberlauf). Grenze: dekomprimierte PDF-Ströme liegen außerhalb des Heaps (docs/entscheidungen.md, T8).
- [x] **Pfade:** Dateinamen aus Uploads nie als Pfad; Ablage nur nach SHA-256, Berichte nach Beleg-ID (UUID geprüft), `Ablage.absolut` lässt nur Pfade unter `originale/`, `berichte/`, `exporte/`, `cache/` zu (T-S4 in `ablage.test.ts` und `api.test.ts`).
- [x] **Ansicht:** KoSIT-HTML mit eigener CSP `sandbox allow-scripts allow-downloads; default-src 'none'; …; frame-ancestors 'self'` (T-S8); im Browser lädt sie im iframe, die XSS-Testdatei der KoSIT öffnet keinen Dialog im App-Kontext, das Dokument hat einen undurchsichtigen Ursprung (T-S5, `e2e/ansicht.spec.ts`). Das iframe der Oberfläche selbst entsteht in Phase 3 (Schritt 3.4) und muss `sandbox="allow-scripts allow-downloads"` ohne `allow-same-origin` setzen.
- [x] **PDF:** pdf.js liest nur Anhänge, rendert nichts, führt keine Skripte aus; pdf.js 6 enthält keinen eval-Pfad mehr (`isEvalSupported` entfällt).
- [x] **Externe Links in Rechnungen** (BT-124) werden nie abgerufen, nur als Hinweis gemeldet (PLAUS-ANHANG-EXTERN).
- [x] **Anmeldung:** scrypt N = 2^17, r = 8, p = 1, Salt 16 Byte, maxmem 256 MiB; Prüfung in konstanter Zeit, auch für unbekannte Namen (`src/server/sicherheit/passwort.ts`). Cookie `HttpOnly`, `SameSite=Strict`, `Secure` unter HTTPS; 8 h Leerlauf-Ablauf (`sicherheit.test.ts`).
- [x] **CSRF:** SameSite plus Pflicht-Kopfzeile `X-Belegbruecke: 1` bei ändernden Anfragen (T-S2).
- [x] **Ratenbegrenzung:** nach 5 Fehlversuchen je Anmeldename 15 Minuten Sperre, auch für das richtige Passwort (T-S1).
- [x] **Header:** CSP der App, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` auf jeder Antwort, auch auf Fehlerantworten (T-S3); API-Antworten mit `Cache-Control: no-store`. Browsertest prüft, dass die Oberfläche keine CSP-Verstöße auslöst.
- [x] **Downloads:** `Content-Disposition: attachment` mit ASCII- und UTF-8-Dateinamen, MIME-Typ des Originals.
- [ ] **Postfach-Passwort:** AES-256-GCM mit Schlüsseldatei außerhalb des Datenordners – Phase 5. Bis dahin speichert die App kein Passwort; `GET /api/einstellungen` gibt das Feld nie heraus, `PUT` kann es nicht setzen.
- [x] **Netz:** Server lauscht nur auf `127.0.0.1` (`src/server/start.ts`, Test gegen den echten Server). IMAP nur mit TLS folgt in Phase 5 (Port fest 993 im Schema).
- [x] **DNS-Rebinding:** nur `Host` gleich `127.0.0.1:<port>` oder `localhost:<port>`, sonst 421; ändernde Anfragen nur mit passendem `Origin`, sonst 403 (T-S7, auch über echtes HTTP mit gefälschtem Host).
- [x] **Protokolle:** GoBD-Protokoll ohne IP-Adressen und ohne Passwörter; Anmeldeereignisse nur im `sicherheitslog` (Test prüft, dass das GoBD-Protokoll keine Anmeldung enthält). Aufräumen: IP nach 7 Tagen, Einträge nach 90 Tagen (beim Start und stündlich geprüft).
- [~] **Abhängigkeiten:** Lockfile im Repo; `npm audit` lokal ohne Befund (0 vulnerabilities, 11.11.2026). In der CI läuft `npm audit` nicht, weil die Vorgabe für diesen Durchgang die CI auf Lint, Tests und Build beschränkt; Robin entscheidet, ob es dazukommt. Lizenzen: [lizenzen-dritter.md](lizenzen-dritter.md).
- [~] **Sicherung:** tägliche Kopie der Datenbank mit `VACUUM INTO` nach `sicherung/` (beim Start und stündlich geprüft, höchstens eine je Tag). Wiederherstellungstest grün (`src/server/sicherung.test.ts`): Datenbank aus der Sicherung plus `originale/` und `berichte/` ergibt dieselben Belege und eine intakte Kette; ohne die Dateien meldet die Kettenprüfung „Original … fehlt“. Offen: Sicherung des ganzen Datenordners außerhalb des Rechners (später restic wie beim VPS-Backup) und der Schlüsseldatei (Phase 5).
- [x] **Integrität:** Hashkette (R17), Schreibschutz der Originale, Trigger gegen UPDATE und DELETE auf `protokoll` (T-H5), Kettenprüfung mit Dateien (T-H1 bis T-H4). Kettenanker im Übergabeprotokoll folgen mit Phase 4.
- [~] **Betroffenenrechte:** Archivsuche über Name, E-Mail und Rechnungsnummer per API (`GET /api/belege?suche=`); Oberfläche in Phase 3. Löschung erst nach Fristablauf, Funktion später.
- [x] **Keine Weitergabe:** keine Telemetrie, keine externen Dienste, keine Schriften oder Skripte aus CDNs (CSP `default-src 'self'` erzwingt das für die Oberfläche).

## Wiederherstellung (Ablauf)

1. Server beenden.
2. Neuen Datenordner anlegen; `sicherung/belegbruecke-<datum>.sqlite` als `belegbruecke.sqlite` hineinkopieren.
3. `originale/` und `berichte/` aus der Ordnersicherung daneben legen (`cache/` ist nicht nötig, die Ansicht entsteht neu).
4. Server mit `BB_DATEN=<neuer Ordner>` starten und unter „Archiv prüfen“ (bzw. `POST /api/archiv/pruefen`) die Kette prüfen. Belege nach der Sicherung fehlen; ihre Dateien meldet die Prüfung als „Datei ohne Protokolleintrag“.

## Restrisiken

- Ein Administrator mit Dateizugriff kann Protokoll und Dateien vollständig neu schreiben; erkennbar ist das nur über die Kettenanker bei der Kanzlei (Phase 4) und getrennte Sicherungen.
- Sitzungen liegen im Speicher; nach einem Neustart meldet man sich neu an.
- Die Oberfläche (Phase 3) muss ohne Inline-Skripte und Inline-Styles auskommen, sonst bricht die CSP.
