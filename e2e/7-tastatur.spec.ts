/**
 * Schritt 6.1: Beleg-Assistent vollständig per Tastatur, vom Eingang bis zur Freigabe; dazu axe hell
 * und dunkel für den Schritt „Eingang“ des Assistenten (U-5; die übrigen Schritte prüfen 2-beleg und
 * 3-handerfassung).
 */
import { expect, test } from '@playwright/test'
import { axeHellUndDunkel, hochladen, kosit, perTab, vorbereiten } from './hilfen.ts'

test('Beleg vom Eingang bis zur Freigabe nur per Tastatur', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  const e = await hochladen(page.request, baseURL!, '01.15a-INVOICE_ubl.xml', kosit('standard/01.15a-INVOICE_ubl.xml'))
  expect(e.ok).toBe(true)
  const detail = (await (await page.request.get(`/api/belege/${e.belegId}`)).json()) as { zusammenfassung: { belegnummer: string } }

  await page.goto('/#/eingang')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  await perTab(page, page.getByRole('link', { name: detail.zusammenfassung.belegnummer, exact: true }))
  await page.keyboard.press('Enter')

  // B2 Prüfen → über die Schrittleiste zu B1 und zurück
  await expect(page.getByRole('heading', { name: 'Prüfen', level: 2 })).toBeVisible()
  await perTab(page, page.getByRole('button', { name: 'Schritt 1: Eingang' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Eingang', level: 2 })).toBeVisible()
  await axeHellUndDunkel(page)
  await perTab(page, page.getByRole('button', { name: 'Weiter' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Prüfen', level: 2 })).toBeVisible()
  await perTab(page, page.getByRole('button', { name: 'Weiter' }))
  await page.keyboard.press('Enter')

  // B3 Ansehen: die Ansicht im iframe hat eigene Bedienelemente; der Weg führt hindurch
  await expect(page.getByRole('heading', { name: 'Ansehen', level: 2 })).toBeVisible()
  await perTab(page, page.getByRole('button', { name: 'Weiter' }), 250)
  await page.keyboard.press('Enter')

  // B4 Zuordnen: Vorschlag übernehmen
  await expect(page.getByRole('heading', { name: 'Zuordnen', level: 2 })).toBeVisible()
  await perTab(page, page.getByRole('button', { name: /zuordnen und weiter/ }))
  await page.keyboard.press('Enter')

  // B5 Kontieren: Sachkonto per Tastatur wählen (Eintippen der Nummer)
  await expect(page.getByRole('heading', { name: 'Kontieren', level: 2 })).toBeVisible()
  const konto = page.getByLabel('Sachkonto für Zeile 1')
  await perTab(page, konto)
  await page.keyboard.type('4900')
  await expect(konto).toHaveValue('4900')
  await perTab(page, page.getByRole('button', { name: 'Kontierung speichern und weiter' }))
  await page.keyboard.press('Enter')

  // B6 Freigeben: Häkchen mit der Leertaste, Freigabe mit Enter
  await expect(page.getByRole('heading', { name: 'Freigeben', level: 2 })).toBeVisible()
  await perTab(page, page.getByRole('checkbox', { name: 'Leistung erhalten, Preise und Mengen geprüft' }))
  await page.keyboard.press('Space')
  await perTab(page, page.getByRole('button', { name: 'Freigeben', exact: true }))
  await page.keyboard.press('Enter')
  await expect(page.locator('.seitentitel .statusmarke')).toHaveText('freigegeben')
  await axeHellUndDunkel(page)
})
