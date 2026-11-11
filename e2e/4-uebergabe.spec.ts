/** U-4: Übergabe 04/2016 mit EXTF und ZIP; Übergabeprotokoll mit Kettenanker; U-5 für U1 bis U4. */
import { expect, test } from '@playwright/test'
import { axeHellUndDunkel, freigebenPerApi, kosit, vorbereiten } from './hilfen.ts'

test('U-4: Übergabe 04/2016, Dateien herunterladen, Kettenanker im Übergabeprotokoll', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  // Läuft die Datei allein, fehlt der freigegebene Beleg aus U-2
  await freigebenPerApi(page.request, baseURL!, '01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))

  await page.goto('/#/uebergabe')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Übergabe')
  await expect(page.getByLabel('Monat (Rechnungsdatum)')).toHaveValue('2016-04')
  await expect(page.getByRole('table', { name: /Belege im 04\/2016 je Status/ })).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: /Prüfen: 04\/2016/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Belege dieser Übergabe' })).toContainText('123456XX')
  await expect(page.getByRole('table', { name: /Summen der Buchungen/ })).toContainText('S 7 %')
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Weiter' }).click()

  await expect(page.getByRole('heading', { name: 'Erzeugen', level: 2 })).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Jetzt erzeugen' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Übergabeprotokoll 04/2016')
  const protokoll = page.locator('.protokoll-druck')
  await expect(protokoll).toContainText('Beraternummer 1001, Mandantennummer 1')
  await expect(protokoll).toContainText('Kettenanker')
  await expect(protokoll.locator('dd', { hasText: 'Protokolleintrag Nr.' }).locator('code')).toHaveText(/^[0-9a-f]{64}$/)
  await axeHellUndDunkel(page)

  const [extf] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'EXTF_Buchungsstapel_1001_1_2016-04.csv' }).click()])
  expect(extf.suggestedFilename()).toBe('EXTF_Buchungsstapel_1001_1_2016-04.csv')
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Belege_2016-04.zip' }).click()])
  expect(zip.suggestedFilename()).toBe('Belege_2016-04.zip')

  // Druckansicht: nur das Protokoll
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('.navigation')).toBeHidden()
  await expect(protokoll).toBeVisible()
  await page.emulateMedia({ media: 'screen' })

  // Die Belege sind übergeben
  await page.goto('/#/belege')
  await page.getByLabel('Status').selectOption('exportiert')
  await expect(page.getByRole('table', { name: 'Belege' })).toContainText('123456XX')
})
