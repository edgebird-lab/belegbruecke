# Belegbrücke – Hinweise für die Arbeit am Projekt

- Portfolio-Projekt von Robin (Wirtschaftsinformatik, olbricht-digital). Repo `edgebird-lab/belegbruecke` ist **privat**; öffentlich erst nach Robins ausdrücklicher Freigabe. Keine Releases, keine GitHub Pages, nichts bereitstellen, keine Mails versenden.
- Spezifikation: `docs/spezifikation.md`. Fortschritt als Checkliste in `docs/stand.md`, nach jedem Schritt aktualisieren. Annahmen, bis Robin entscheidet: `docs/entscheidungen.md`. Phase 7 (Betrieb) nur nach Robins Freigabe.
- Sprache: Oberfläche, Bezeichner, Doku und Commit-Nachrichten auf Deutsch. Keine KI-Funktionen, keine Cloud, keine Telemetrie; Daten bleiben lokal. Keine Echtdaten: Testrechnungen nur aus den offiziellen Testsuiten oder selbst erzeugt.
- Fachlogik in `src/fach` ohne React und ohne Node-APIs (die Typprüfung der Oberfläche erzwingt das), Prüfung in `src/pruefung` (Node, Worker), Server in `src/server`, Oberfläche in `src/ui`. Node 24 führt die TypeScript-Dateien des Servers direkt aus; relative Importe deshalb immer mit Endung `.ts`.
- Vor jedem Commit: `npm run lint`, `npm test`, `npm run build`, `npm run e2e` (lokal mit Edge).
- Ports: Vorschau und Browsertests 4184 (`strictPort`), Server 8784, nur `127.0.0.1`. Nie 4173 (Prozesslotse); mehrere Apps laufen parallel auf diesem Rechner.
- Prüfartefakte: `npm run vorbereiten` lädt die KoSIT-Releases mit Prüfsumme nach `vendor/` und `testdaten/kosit/` und kompiliert die XSLT zu SEF. Diese Dateien sind nicht im Repo. Java nur für den Referenzlauf (`npm run referenz`), nie zur Laufzeit.
- Postfach (IMAP) nur gegen einen lokalen Testserver in den Tests; keine echten Postfächer, keine Zugangsdaten.
