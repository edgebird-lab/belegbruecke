import { expect, test } from '@playwright/test'
import { axe, PASSWORT, vorbereiten } from './hilfen.ts'

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
  for (const pfad of ['#/eingang', '#/belege', '#/uebergabe', '#/archiv', '#/einstellungen/firma', '#/einstellungen/konten', '#/einstellungen/lieferanten', '#/einstellungen/system']) {
    await page.goto(`/${pfad}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await axe(page)
  }
  expect(verstoesse).toEqual([])
})
