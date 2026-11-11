# Prüfartefakte: Herkunft und Lizenzen

`scripts/artefakte.mjs` lädt die folgenden Dateien aus den offiziellen Releases, prüft ihre SHA-256-Werte (`vendor/artefakte.json`) und entpackt sie **unverändert**. Die Archive selbst liegen nicht im Repo; die Lizenztexte liegen in `vendor/lizenzen/`.

| Artefakt | Version | Lizenz | Lizenztext | Quelle |
| --- | --- | --- | --- | --- |
| KoSIT Validator-Konfiguration XRechnung (Szenarien, Bericht-XSLT, UBL- und CII-XSD) | v2026-08-31 | Apache-2.0 | `konfiguration-LICENSE.txt`, `konfiguration-NOTICE.txt` | github.com/itplr-kosit/validator-configuration-xrechnung |
| darin: CEN-Schematron EN 16931 (UBL, CII) | 1.3.16 | EUPL-1.2 | `en16931-LICENSE.txt` | github.com/ConnectingEurope/eInvoicing-EN16931 |
| darin: XRechnung-Schematron | 2.6.0 | Apache-2.0 | `xrechnung-schematron-LICENSE.txt` | github.com/itplr-kosit/xrechnung-schematron |
| KoSIT XRechnung-Visualisierung | v2026-10-13 | Apache-2.0 (Schriften für die PDF-Ausgabe unter OFL-1.1, von der Belegbrücke nicht genutzt) | `visualisierung-LICENSE.txt` | github.com/itplr-kosit/xrechnung-visualization |
| KoSIT XRechnung-Testsuite (nur Tests) | v2026-08-31 | Apache-2.0 | `testsuite-LICENSE.txt` | github.com/itplr-kosit/xrechnung-testsuite |
| KoSIT-Validator (Java, nur Referenzlauf) | 1.6.3 | Apache-2.0 | `validator-LICENSE.txt`, `validator-NOTICE.txt` | github.com/itplr-kosit/validator |
| Mustang-CLI (Java, nur Referenzlauf) | 2.26.0 | Apache-2.0 | `mustang-LICENSE.txt`, `mustang-NOTICE.txt` | github.com/ZUGFeRD/mustangproject |

**Abgeleitete Dateien:** `scripts/sef.mjs` kompiliert die XSLT-Dateien zu SEF (`vendor/sef/`). Die SEF-Dateien sind abgeleitete Werke und behalten die Lizenz ihrer Quelle (EUPL-1.2 für die CEN-Schematron, sonst Apache-2.0). Sie liegen nicht im Repo und entstehen bei `npm run vorbereiten` neu.

**Meldetexte:** Die Texte der Schematron-Meldungen erscheinen in Prüfberichten unverändert als `originaltext`, mit Verweis auf diese Lizenzen. Die deutschen Erklärungen des Klartext-Katalogs sind eigene Texte.

**Testdaten:** Die Mutationen in `testdaten/mutationen/` sind aus `instances/standard/01.01a-INVOICE_ubl.xml` der Testsuite abgeleitet (Apache-2.0); jede Datei nennt ihre Änderung im Dateikopf (Apache-2.0 § 4 b).
