/**
 * U-1: Erster Start und Einrichtung E1 bis E5 nur per Tastatur; U-5 für diese Schritte (axe hell und
 * dunkel). Läuft als erste Datei gegen den frischen Server; die anderen Tests richten sich sonst per
 * API ein (e2e/hilfen.ts, vorbereiten).
 */
import { expect, test } from '@playwright/test'
import { axeHellUndDunkel, PASSWORT, perTab, tippe } from './hilfen.ts'

test('U-1: Einrichtung nur per Tastatur, Einstellungen gespeichert', async ({ page }) => {
  await page.goto('/')
  const status = await (await page.request.get('/api/status')).json()
  test.skip(!status.einrichtungNoetig, 'Der Server ist schon eingerichtet (Test läuft nur gegen einen frischen Server).')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Willkommen bei der Belegbrücke')
  await axeHellUndDunkel(page)
  await tippe(page, page.getByLabel('Ihr Name'), 'Robin')
  await tippe(page, page.getByLabel('Anmeldename'), 'robin')
  await tippe(page, page.getByLabel('Passwort', { exact: false }).first(), PASSWORT)
  await tippe(page, page.getByLabel('Passwort wiederholen'), PASSWORT)
  await perTab(page, page.getByRole('button', { name: 'Benutzer anlegen' }))
  await page.keyboard.press('Enter')

  // E1 Firma
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Firma')
  await expect(page.getByRole('navigation', { name: 'Schritte der Einrichtung' })).toBeVisible()
  await axeHellUndDunkel(page)
  await tippe(page, page.getByLabel('Wie heißt Ihre Firma'), '[Buyer name]')
  await tippe(page, page.getByLabel('Straße und Hausnummer'), '[Buyer address line 1]')
  await tippe(page, page.getByLabel('Postleitzahl'), '12345')
  await tippe(page, page.getByLabel(/^Ort/), '[Buyer city]')
  await perTab(page, page.getByRole('button', { name: 'Speichern und weiter' }))
  await page.keyboard.press('Enter')

  // E2 Kanzlei: Testwerte der Spezifikation stehen schon da
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kanzlei')
  await expect(page.getByLabel(/^Beraternummer/)).toHaveValue('1001')
  await axeHellUndDunkel(page)
  await tippe(page, page.getByLabel(/^Mandantennummer/), '1')
  await perTab(page, page.getByRole('button', { name: 'Speichern und weiter' }))
  await page.keyboard.press('Enter')

  // E3 Steuerschlüssel und Konten: BU 9 und 8 vorbelegt; zwei Sachkonten anlegen
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Steuerschlüssel und Konten')
  await expect(page.getByLabel('BU-Schlüssel für Vorsteuer 19 %')).toHaveValue('9')
  await tippe(page, page.getByLabel('Kontonummer'), '4900')
  await tippe(page, page.getByLabel('Bezeichnung', { exact: true }), 'Testaufwand')
  await perTab(page, page.getByRole('button', { name: 'Konto speichern' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('cell', { name: 'Testaufwand', exact: true })).toBeVisible()
  await tippe(page, page.getByLabel('Kontonummer'), '4901')
  await tippe(page, page.getByLabel('Bezeichnung', { exact: true }), 'Testaufwand Automatik')
  await perTab(page, page.getByRole('checkbox', { name: 'Automatikkonto', exact: true }))
  await page.keyboard.press('Space')
  await perTab(page, page.getByRole('button', { name: 'Konto speichern' }))
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Konto 4901 ist Automatikkonto')).toBeChecked()
  await axeHellUndDunkel(page)
  await perTab(page, page.getByRole('button', { name: 'Speichern und weiter' }))
  await page.keyboard.press('Enter')

  // E4 Eingang
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  await axeHellUndDunkel(page)
  await perTab(page, page.getByRole('button', { name: 'Speichern und weiter' }))
  await page.keyboard.press('Enter')

  // E5 Aufbewahrung: ohne Bestätigung geht es nicht weiter
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aufbewahrung')
  await expect(page.getByText('§ 147 Abs. 3 AO; § 14b Abs. 1 UStG')).toBeVisible()
  await axeHellUndDunkel(page)
  await perTab(page, page.getByRole('button', { name: 'Einrichtung abschließen' }))
  await page.keyboard.press('Enter')
  await expect(page.getByRole('alert')).toContainText('Bitte bestätigen Sie')
  await perTab(page, page.getByRole('checkbox', { name: /Hinweise zu Aufbewahrung/ }))
  await page.keyboard.press('Space')
  await perTab(page, page.getByRole('button', { name: 'Einrichtung abschließen' }))
  await page.keyboard.press('Enter')

  // Danach: Eingang mit Navigation
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Eingang')
  await expect(page.getByRole('navigation', { name: 'Hauptnavigation' })).toBeVisible()
  await axeHellUndDunkel(page)

  const e = await (await page.request.get('/api/einstellungen')).json()
  expect(e.firma).toMatchObject({ name: '[Buyer name]', anschrift: { ort: '[Buyer city]', plz: '12345', land: 'DE' }, kleinunternehmer: false })
  expect(e.datev).toMatchObject({ beraternummer: 1001, mandantennummer: 1, buSchluessel: { 'vorsteuer-19': '9', 'vorsteuer-7': '8' } })
  expect(e.eingerichtetAm).not.toBeNull()
  const konten = await (await page.request.get('/api/sachkonten')).json()
  expect(konten.sachkonten).toEqual([
    { nummer: 4900, bezeichnung: 'Testaufwand', automatikkonto: false, aktiv: true },
    { nummer: 4901, bezeichnung: 'Testaufwand Automatik', automatikkonto: true, aktiv: true },
  ])
})
