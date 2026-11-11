import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Prüft die Seite mit axe; Befunde der Stufen serious und critical lassen den Test scheitern. */
async function pruefe(page: Page) {
  const ergebnis = await new AxeBuilder({ page }).analyze()
  const schwer = ergebnis.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(schwer.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([])
}

for (const schema of ['light', 'dark'] as const) {
  test(`Startseite ohne schwere Barrieren (${schema === 'light' ? 'hell' : 'dunkel'})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: schema })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E-Rechnungen')
    await expect(page.getByRole('status')).toContainText('Server läuft')
    await expect(page.getByRole('status')).toContainText('XRechnung 3.0.2')
    await pruefe(page)
  })
}

test('Darstellung lässt sich umschalten', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Darstellung').selectOption('dunkel')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await pruefe(page)
  await page.getByLabel('Darstellung').selectOption('hell')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByLabel('Darstellung').selectOption('system')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
})

test('der Server liefert die Oberfläche mit Sicherheitsheadern und ohne CSP-Verstöße aus', async ({ page }) => {
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
  await expect(page.getByRole('status')).toContainText('Server läuft')
  expect(verstoesse).toEqual([])
})
