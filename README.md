# Belegbrücke

E-Rechnungs-Eingang, GoBD-Archiv und DATEV-Übergabe für Kleinbetriebe. Die Belegbrücke nimmt eingehende E-Rechnungen an, prüft sie nach EN 16931 und XRechnung mit den offiziellen KoSIT- und CEN-Artefakten und erklärt Fehler in Klartext. Sie bewahrt das Original unverändert auf, mit Prüfbericht und einem Protokoll, das eine SHA-256-Hashkette sichert, und erzeugt monatlich die Übergabe an die Steuerkanzlei. Läuft lokal, ohne KI, ohne Cloud und ohne Java.

> **In Entwicklung.** Stand und nächste Schritte: [docs/stand.md](docs/stand.md). Annahmen, die noch eine Entscheidung brauchen: [docs/entscheidungen.md](docs/entscheidungen.md). Spezifikation: [docs/spezifikation.md](docs/spezifikation.md).

## Entwickeln

```bash
npm install
npm run vorbereiten   # KoSIT-Artefakte mit Prüfsumme laden, XSLT zu SEF kompilieren
npm run dev           # Oberfläche (Vite) mit Weiterleitung von /api an den Server
npm run server        # Server auf 127.0.0.1:8784
npm test              # Unit-Tests (Vitest)
npm run e2e           # Browsertests (lokal mit Edge, Port 4184)
npm run build         # Typprüfung und Produktions-Build
```

## Rechtliches

Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a). Keine Steuer- oder Rechtsberatung. DATEV, ZUGFeRD und Factur-X werden nur beschreibend genannt.

## Lizenz

Noch nicht festgelegt (offene Frage 9 der Spezifikation). Das Repo ist privat.
