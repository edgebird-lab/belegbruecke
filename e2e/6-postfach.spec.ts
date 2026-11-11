/**
 * Schritt 5.4: Postfach im Assistenten einrichten (Verbindung testen) und Statusanzeige im Eingang;
 * eine Mail an den IMAP-Testserver erscheint als Beleg. Der Testserver läuft im Testprozess über TLS
 * mit dem Zertifikat, dem der Server über BB_IMAP_CA vertraut (playwright.config.ts).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ImapTestserver } from '../src/testhilfen/imap-testserver.ts'
import { baueMail } from '../src/testhilfen/mails.ts'
import { axeHellUndDunkel, kosit, vorbereiten } from './hilfen.ts'

const NEBEN = process.env.BB_E2E_NEBEN!
const PASSWORT = 'Postfach-Testpasswort-42'
let imap: ImapTestserver

test.beforeAll(async () => {
  imap = await ImapTestserver.starte({ benutzer: 'eingang@firma.example', passwort: PASSWORT, key: readFileSync(join(NEBEN, 'key.pem'), 'utf8'), cert: readFileSync(join(NEBEN, 'cert.pem'), 'utf8') })
})
test.afterAll(async () => {
  await imap.stoppe()
})

test('Mail an den Testserver erscheint als Beleg', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  imap.lege(baueMail({ betreff: 'Ihre Rechnung R1234567', messageId: '<e2e-1@lieferant.example>', anhaenge: [{ name: 'R1234567.xml', typ: 'application/xml', inhalt: kosit('standard/01.07a-INVOICE_ubl.xml') }] }))

  // Einstellungen, Eingang: Postfach einrichten und Verbindung testen
  await page.goto('/#/einstellungen/eingang')
  await page.getByRole('radio', { name: /Zusätzlich ein E-Mail-Postfach/ }).check()
  await page.getByLabel(/^IMAP-Server/).fill('127.0.0.1')
  await page.getByLabel('Port (TLS)').fill(String(imap.port))
  await page.getByLabel(/^Benutzer/).fill('eingang@firma.example')
  // ohne erfolgreichen Test lässt sich das Postfach nicht speichern
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Testen Sie die Verbindung' })).toBeVisible()
  await page.getByLabel('Passwort', { exact: true }).fill('falsch-falsch-falsch')
  await page.getByRole('button', { name: 'Verbindung testen' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Anmeldung am Postfach fehlgeschlagen' })).toBeVisible()
  await page.getByLabel('Passwort', { exact: true }).fill(PASSWORT)
  await page.getByRole('button', { name: 'Verbindung testen' }).click()
  await expect(page.getByText(/Verbindung in Ordnung: angemeldet als eingang@firma.example/)).toBeVisible()
  await axeHellUndDunkel(page)
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Einstellungen gespeichert' })).toBeVisible()

  // Eingang: Statusanzeige und Abruf auf Knopfdruck
  await page.goto('/#/eingang')
  const kasten = page.locator('.postfachstatus')
  await expect(kasten).toBeVisible()
  await kasten.getByRole('button', { name: 'Jetzt abrufen' }).click()
  await expect(kasten).toContainText('1 E-Mail, 1 Beleg übernommen')
  await expect(page.getByRole('table', { name: 'Offene Belege' })).toContainText('R1234567')
  await axeHellUndDunkel(page)
  expect(imap.nachrichten('INBOX')).toHaveLength(0)
  expect(imap.nachrichten('Belegbruecke/verarbeitet')).toHaveLength(1)

  // Der Beleg zeigt die Herkunft
  await page.getByRole('table', { name: 'Offene Belege' }).getByRole('link', { name: /B-\d+/ }).first().click()
  await page.getByRole('button', { name: 'Schritt 1: Eingang' }).click()
  await expect(page.getByText(/Postfach: E-Mail von rechnung@lieferant.example/)).toBeVisible()
})
