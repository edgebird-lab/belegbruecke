/** Schritt 3.8: Archivsuche nach „123456XX“, Belegdetail mit Protokoll, „Archiv prüfen“ mit druckbarem Kettenbericht, Prüferexport. */
import { expect, test } from '@playwright/test'
import { axeHellUndDunkel, freigebenPerApi, kosit, vorbereiten } from './hilfen.ts'

test('Suche findet 123456XX, Belegdetail zeigt das Protokoll, Kette ist in Ordnung', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  await freigebenPerApi(page.request, baseURL!, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))

  await page.goto('/#/archiv')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Archiv')
  await axeHellUndDunkel(page)
  await page.getByLabel(/^Suche/).fill('123456XX')
  await page.getByRole('button', { name: 'Suchen' }).click()
  const treffer = page.getByRole('table', { name: 'Suchergebnis' })
  await expect(treffer).toContainText('123456XX')
  await expect(page.getByRole('heading', { name: /Treffer/ })).toBeVisible()
  // auch nach Betrag
  await page.getByLabel(/^Suche/).fill('')
  await page.getByLabel('Betrag').fill('336,90')
  await page.getByRole('button', { name: 'Suchen' }).click()
  await expect(treffer).toContainText('336,90 €')
  await treffer.getByRole('link').first().click()

  await expect(page.getByRole('heading', { name: 'Protokoll des Belegs' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Protokolleinträge' })).toContainText('Eingang')
  await expect(page.getByRole('table', { name: 'Protokolleinträge' })).toContainText('Prüfung')
  await axeHellUndDunkel(page)

  await page.goto('/#/archiv')
  await page.getByRole('button', { name: 'Archiv prüfen' }).click()
  await expect(page.locator('.kettenbericht .hinweis-erfolg')).toContainText('In Ordnung')
  await axeHellUndDunkel(page)
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.kettenbericht-text')).toBeVisible()
  await expect(page.locator('.navigation')).toBeHidden()
  await expect(page.locator('.suchformular')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Prüferexport herunterladen' }).click()])
  expect(download.suggestedFilename()).toMatch(/^Prueferexport_anfang_\d{4}-\d{2}-\d{2}\.zip$/)
})
