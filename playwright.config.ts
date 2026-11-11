import { defineConfig } from '@playwright/test'

const CI = !!process.env.CI
// Fester Port der Belegbrücke für Vorschau und Browsertests; mehrere Apps laufen parallel auf diesem Rechner
const PORT = Number(process.env.BB_E2E_PORT ?? 4184)

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: CI ? 1 : 0,
  reporter: CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Vorhandenen Browser nutzen statt einen herunterzuladen: lokal Edge, in der CI Chrome
    channel: CI ? 'chrome' : 'msedge',
    locale: 'de-DE',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    // Nie einen fremden Server auf dem Port mitbenutzen: lieber laut scheitern
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
