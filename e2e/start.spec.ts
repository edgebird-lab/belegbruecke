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
    await expect(page.getByRole('status')).not.toContainText('wird geprüft')
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
