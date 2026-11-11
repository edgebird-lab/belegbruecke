import { expect, test } from '@playwright/test'
import { axe, axeHellUndDunkel, PASSWORT, vorbereiten } from './hilfen.ts'

for (const schema of ['light', 'dark'] as const) {
  test(`Anmeldeseite ohne schwere Barrieren (${schema === 'light' ? 'hell' : 'dunkel'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: schema })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Anmelden|Willkommen/)
    await axe(page)
  })
}

test('Darstellung lässt sich umschalten', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Darstellung').selectOption('dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await axe(page)
  await page.getByLabel('Darstellung').selectOption('hell')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByLabel('Darstellung').selectOption('system')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
})

test('Anmelden mit falschem und richtigem Passwort, Abmelden', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  await page.request.post('/api/abmelden', { headers: { 'x-belegbruecke': '1', origin: baseURL! } })
  await page.goto('/')
  await page.getByLabel('Anmeldename').fill('robin')
  await page.getByLabel('Passwort').fill('falsch-falsch')
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('alert')).toContainText('Anmeldename oder Passwort falsch')
  await page.getByLabel('Passwort').fill(PASSWORT)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')
})

test('abgelaufene Sitzung: zurück zur Anmeldung mit Hinweis, danach dieselbe Seite', async ({ page, baseURL, context }) => {
  // Prüferfund: Nach 8 Stunden ohne Aktivität oder einem Neustart des Servers (Sitzungen liegen nur im
  // Speicher) meldete jede Seite nur „Bitte melden Sie sich an.“, ohne Anmeldung bis zum Neuladen.
  await vorbereiten(page.request, baseURL!)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  // Der Server vergisst die Sitzung, der Browser schickt das alte Cookie weiter
  const alt = await context.cookies()
  await page.request.post('/api/abmelden', { headers: { 'x-belegbruecke': '1', origin: baseURL! } })
  await context.addCookies(alt)
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: /^Belege/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')
  await expect(page.getByText('Ihre Sitzung ist abgelaufen')).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByLabel('Anmeldename').fill('robin')
  await page.getByLabel('Passwort').fill(PASSWORT)
  await page.getByRole('button', { name: 'Anmelden' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Belege')
  // Bewusstes Abmelden zeigt keinen Hinweis auf eine abgelaufene Sitzung
  await page.getByRole('button', { name: 'Abmelden' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anmelden')
  await expect(page.getByText('Ihre Sitzung ist abgelaufen')).toHaveCount(0)
})

test('der Server liefert die Oberfläche mit Sicherheitsheadern und ohne CSP-Verstöße aus', async ({ page, baseURL }) => {
  const verstoesse: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) verstoesse.push(m.text())
  })
  const antwort = await page.goto('/')
  const kopf = antwort!.headers()
  expect(kopf['content-security-policy']).toContain("default-src 'self'")
  expect(kopf['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(kopf['x-content-type-options']).toBe('nosniff')
  expect(kopf['referrer-policy']).toBe('no-referrer')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // auch angemeldet auf allen Seiten
  await vorbereiten(page.request, baseURL!)
  for (const pfad of ['#/eingang', '#/belege', '#/uebergabe', '#/archiv', '#/einstellungen/firma', '#/einstellungen/konten', '#/einstellungen/kanzlei', '#/einstellungen/lieferanten', '#/einstellungen/eingang', '#/einstellungen/benutzer', '#/einstellungen/system']) {
    await page.goto(`/${pfad}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await axeHellUndDunkel(page)
  }
  expect(verstoesse).toEqual([])
})
