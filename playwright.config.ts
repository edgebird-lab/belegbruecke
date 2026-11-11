import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'
import { raeumeAlteAuf } from './e2e/aufraeumen.ts'
import { erzeugeTestzertifikat } from './src/testhilfen/tls.ts'

const CI = !!process.env.CI
// Fester Port der Belegbrücke für Vorschau und Browsertests; mehrere Apps laufen parallel auf diesem Rechner
const PORT = Number(process.env.BB_E2E_PORT ?? 4184)
// Jeder Lauf mit frischem Datenordner; Ordner früherer Läufe werden zuerst gelöscht
if (!process.env.BB_E2E_DATEN) raeumeAlteAuf()
const DATEN = process.env.BB_E2E_DATEN ?? mkdtempSync(join(tmpdir(), 'bb-e2e-'))
process.env.BB_E2E_DATEN = DATEN
// Neben dem Datenordner: Testzertifikat für den IMAP-Testserver und Schlüssel für das Postfach-Passwort
const NEBEN = `${DATEN}-neben`
if (!existsSync(join(NEBEN, 'cert.pem'))) {
  mkdirSync(NEBEN, { recursive: true })
  const z = erzeugeTestzertifikat()
  writeFileSync(join(NEBEN, 'cert.pem'), z.cert)
  writeFileSync(join(NEBEN, 'key.pem'), z.key)
}
process.env.BB_E2E_NEBEN = NEBEN

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  // Lange Abläufe durch alle Schritte mit axe hell und dunkel je Schritt
  timeout: 120_000,
  retries: CI ? 1 : 0,
  reporter: CI ? 'github' : 'list',
  globalTeardown: './e2e/aufraeumen.ts',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Vorhandenen Browser nutzen statt einen herunterzuladen: lokal Edge, in der CI Chrome
    channel: CI ? 'chrome' : 'msedge',
    locale: 'de-DE',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Der echte Server liefert die gebaute Oberfläche aus, wie im Betrieb (CSP, Host-Prüfung, API)
    command: 'npm run build && node src/server/start.ts',
    // BB_IMAP_CA nur für den IMAP-Testserver der Browsertests (e2e/6-postfach.spec.ts)
    env: { BB_PORT: String(PORT), BB_DATEN: DATEN, BB_IMAP_CA: join(NEBEN, 'cert.pem'), BB_SCHLUESSEL_DATEI: join(NEBEN, 'belegbruecke.schluessel') },
    url: `http://127.0.0.1:${PORT}/api/status`,
    // Nie einen fremden Server auf dem Port mitbenutzen: lieber laut scheitern
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
