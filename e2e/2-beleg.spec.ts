/**
 * Beleg-Assistent im Browser: U-2 (01.01a bis zur Freigabe), U-3 (M1 nur mit Begründung), T-D2
 * (gleiche Rechnung als CII), Schritt 3.3 (Upload von 3 Dateien); dazu U-5 (axe hell und dunkel).
 */
import { expect, test, type Page } from '@playwright/test'
import { axeHellUndDunkel, kosit, mutation, vorbereiten } from './hilfen.ts'

test.describe.configure({ mode: 'serial' })

test.beforeEach(async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
})

async function hochladenImBrowser(page: Page, dateien: { name: string; buffer: Buffer }[]) {
  await page.goto('/#/eingang')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  await page.getByLabel('Rechnungsdateien auswählen').setInputFiles(dateien.map((d) => ({ ...d, mimeType: 'application/xml' })))
  await expect(page.getByRole('heading', { name: 'Ergebnis des Uploads' })).toBeVisible()
}

const weiter = (page: Page, name: string | RegExp = 'Weiter') => page.getByRole('button', { name }).click()

test('U-2: 01.01a hochladen, prüfen, ansehen, Lieferant anlegen, 4900 wählen, freigeben', async ({ page }) => {
  await hochladenImBrowser(page, [{ name: '01.01a-INVOICE_ubl.xml', buffer: kosit('standard/01.01a-INVOICE_ubl.xml') }])
  const ergebnis = page.locator('.ergebnisliste li').first()
  await expect(ergebnis).toContainText('XRechnung 3.0, UBL')
  await ergebnis.getByRole('link').click()

  // B2 Prüfen: gelb, weil der Leistungszeitpunkt nur in einer von zwei Positionen steht (docs/entscheidungen.md, T9)
  await expect(page.getByRole('heading', { name: 'Prüfen', level: 2 })).toBeVisible()
  await expect(page.locator('.ampelzeile')).toContainText('Gültig mit Hinweisen')
  await expect(page.getByText('Pflichtangaben nach § 14 Abs. 4 UStG')).toBeVisible()
  await axeHellUndDunkel(page)
  await weiter(page)

  // B3 Ansehen: KoSIT-Ansicht im Sandbox-iframe und Eckdaten
  await expect(page.getByRole('heading', { name: 'Ansehen', level: 2 })).toBeVisible()
  const rahmen = page.locator('iframe[title="Ansicht der E-Rechnung"]')
  await expect(rahmen).toHaveAttribute('sandbox', 'allow-scripts allow-downloads')
  await expect(page.frameLocator('iframe[title="Ansicht der E-Rechnung"]').getByText('123456XX').first()).toBeVisible()
  await expect(page.frameLocator('iframe[title="Ansicht der E-Rechnung"]').getByText('336,90').first()).toBeVisible()
  await expect(page.locator('.ansicht-rechts')).toContainText('336,90 €')
  await axeHellUndDunkel(page)
  await weiter(page)

  // B4 Zuordnen: neuer Lieferant, Kreditor 70000 vorgeschlagen
  await expect(page.getByRole('heading', { name: 'Zuordnen', level: 2 })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Neuer Lieferant/ })).toBeChecked()
  await expect(page.getByLabel(/^Name des Lieferanten/)).toHaveValue('[Seller name]')
  await expect(page.getByRole('textbox', { name: 'Kreditorenkonto' })).toHaveValue('70000')
  await axeHellUndDunkel(page)
  await weiter(page, 'Lieferant zuordnen und weiter')

  // B5 Kontieren: 4900 wählen, BU 8 (Vorsteuer 7 %)
  await expect(page.getByRole('heading', { name: 'Kontieren', level: 2 })).toBeVisible()
  await page.getByLabel('Sachkonto für Zeile 1').selectOption('4900')
  await expect(page.locator('table.kontierung tbody tr').first()).toContainText('8')
  await expect(page.locator('table.kontierung tfoot')).toContainText('gleich dem Bruttobetrag')
  await axeHellUndDunkel(page)
  await weiter(page, 'Kontierung speichern und weiter')

  // B6 Freigeben
  await expect(page.getByRole('heading', { name: 'Freigeben', level: 2 })).toBeVisible()
  await expect(page.getByText('wird bei der Freigabe vergeben: 70000')).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Leistung erhalten' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Leistung erhalten, Preise und Mengen geprüft' }).check()
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(page.locator('.hinweis-erfolg')).toContainText('Freigegeben')
  await expect(page.locator('.seitentitel .statusmarke')).toHaveText('freigegeben')
  await expect(page.getByText('70000', { exact: true })).toBeVisible()
  await axeHellUndDunkel(page)
})

test('U-3: M1 ist rot mit BR-CO-14 in Klartext; Freigabe nur mit Begründung', async ({ page }) => {
  await hochladenImBrowser(page, [{ name: 'M1-steuerbetrag.xml', buffer: mutation('M1-steuerbetrag.xml') }])
  await page.locator('.ergebnisliste li').first().getByRole('link').click()
  await expect(page.locator('.ampelzeile')).toContainText('Nicht angenommen')
  const befund = page.locator('.befund', { hasText: 'BR-CO-14' })
  await expect(befund).toBeVisible()
  await expect(befund).toContainText('Vorsteuerabzug gefährdet')
  await axeHellUndDunkel(page)

  // Gleiche Nummer und gleicher Lieferant wie 01.01a: erst die Dublettenfrage beantworten
  await page.getByRole('button', { name: 'Schritt 4: Zuordnen' }).click()
  await expect(page.getByRole('heading', { name: /Ist das dieselbe Rechnung wie/ })).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Nein, eine andere Rechnung' }).click()
  await expect(page.getByText('Dublettenfrage entschieden: keine Dublette.')).toBeVisible()
  await expect(page.getByRole('radio', { name: /Vorhandener Lieferant/ })).toBeChecked()
  await weiter(page, 'Lieferant zuordnen und weiter')

  // Vorschlag aus der Historie (01.01a auf 4900)
  await expect(page.getByLabel('Sachkonto für Zeile 1')).toHaveValue('4900')
  await expect(page.getByText(/Vorschlag aus 1 früheren Rechnung/)).toBeVisible()
  await weiter(page, 'Kontierung speichern und weiter')

  await expect(page.locator('.hinweis-fehler', { hasText: 'Vorsteuerabzug gefährdet' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Leistung erhalten, Preise und Mengen geprüft' }).check()
  await page.getByLabel(/Begründung für die Freigabe/).fill('kurz')
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'mindestens 10 Zeichen' })).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByLabel(/Begründung für die Freigabe/).fill('Steuerbetrag telefonisch mit dem Lieferanten geklärt')
  await page.getByRole('button', { name: 'Freigeben', exact: true }).click()
  await expect(page.locator('.hinweis-erfolg')).toContainText('Steuerbetrag telefonisch')
})

test('T-D2: 01.01a als CII ist dieselbe Rechnung; Vergleich nebeneinander, Ablehnung als Dublette', async ({ page }) => {
  await hochladenImBrowser(page, [{ name: '01.01a-INVOICE_uncefact.xml', buffer: kosit('standard/01.01a-INVOICE_uncefact.xml') }])
  const ergebnis = page.locator('.ergebnisliste li').first()
  await expect(ergebnis).toContainText('mögliche Dublette')
  await ergebnis.getByRole('link').click()
  await page.getByRole('button', { name: 'Schritt 6: Freigeben' }).click()
  await expect(page.getByText(/Möglicherweise dieselbe Rechnung wie ein anderer Beleg/)).toBeVisible()
  await page.getByRole('button', { name: 'Schritt 4: Zuordnen' }).click()
  const frage = page.locator('.dublettenfrage').first()
  await expect(frage.getByRole('table')).toContainText('XRechnung 3.0, CII')
  await expect(frage.getByRole('table')).toContainText('XRechnung 3.0, UBL')
  await axeHellUndDunkel(page)
  await frage.getByRole('button', { name: 'Ja, dieselbe Rechnung (ablehnen)' }).click()
  await expect(page.locator('.seitentitel .statusmarke')).toHaveText('abgelehnt')
  await expect(page.locator('.hinweis-warnung', { hasText: 'Abgelehnt' })).toContainText('Dublette von')
})

test('3.3: Upload von 3 Dateien zeigt 3 Zeilen mit Status', async ({ page }) => {
  const dateien = ['standard/02.01a-INVOICE_ubl.xml', 'standard/03.01a-INVOICE_ubl.xml', 'standard/01.02a-INVOICE_ubl.xml'].map((rel) => ({ name: rel.split('/')[1], buffer: kosit(rel) }))
  await hochladenImBrowser(page, dateien)
  await expect(page.locator('.ergebnisliste li')).toHaveCount(3)
  const tabelle = page.getByRole('table', { name: 'Offene Belege' })
  for (const nr of ['1234567', '123456789', '123456']) await expect(tabelle.getByRole('cell', { name: nr, exact: true })).toBeVisible()
  await expect(tabelle.getByText('geprüft')).toHaveCount(3)
  await axeHellUndDunkel(page)
  // Die Navigation zählt die offenen Belege
  await expect(page.getByRole('link', { name: /Eingang \d+ offen/ })).toBeVisible()
})
