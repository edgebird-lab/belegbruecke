import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'
import { raeumeAlteAuf } from './e2e/aufraeumen.ts'

const CI = !!process.env.CI
// Fester Port der Belegbrücke für Vorschau und Browsertests; mehrere Apps laufen parallel auf diesem Rechner
const PORT = Number(process.env.BB_E2E_PORT ?? 4184)
// Jeder Lauf mit frischem Datenordner; Ordner früherer Läufe werden zuerst gelöscht
if (!process.env.BB_E2E_DATEN) raeumeAlteAuf()
const DATEN = process.env.BB_E2E_DATEN ?? mkdtempSync(join(tmpdir(), 'bb-e2e-'))
process.env.BB_E2E_DATEN = DATEN

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
    env: { BB_PORT: String(PORT), BB_DATEN: DATEN },
    url: `http://127.0.0.1:${PORT}/api/status`,
    // Nie einen fremden Server auf dem Port mitbenutzen: lieber laut scheitern
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
