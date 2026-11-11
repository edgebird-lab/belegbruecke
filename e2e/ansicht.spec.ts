import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { anmelden, hochladen } from './hilfen.ts'

const XSS = 'vendor/visualisierung/test/instances/additional-supporting-documents-xss_ubl.xml'
const STANDARD = 'testdaten/kosit/instances/standard/01.01a-INVOICE_ubl.xml'

test.describe('Ansicht der E-Rechnung in der Sandbox', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await anmelden(page.request, baseURL!)
  })

  test('T-S8: die Ansicht lädt im iframe der App', async ({ page, baseURL }) => {
    const e = await hochladen(page.request, baseURL!, '01.01a.xml', readFileSync(STANDARD))
    await page.goto('/')
    await page.evaluate((src) => {
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-scripts allow-downloads')
      f.title = 'Ansicht der E-Rechnung'
      f.src = src
      document.body.append(f)
    }, `/api/belege/${e.belegId}/ansicht`)
    const rahmen = page.frameLocator('iframe[title="Ansicht der E-Rechnung"]')
    await expect(rahmen.getByText('123456XX').first()).toBeVisible()
  })

  test('T-S5: Skripte aus der Rechnung öffnen keinen Dialog im Kontext der App', async ({ page, baseURL }) => {
    const e = await hochladen(page.request, baseURL!, 'xss.xml', readFileSync(XSS))
    const dialoge: string[] = []
    page.on('dialog', (d) => {
      dialoge.push(d.message())
      void d.dismiss()
    })
    await page.goto('/')
    await page.evaluate((src) => {
      const f = document.createElement('iframe')
      f.setAttribute('sandbox', 'allow-scripts allow-downloads')
      f.title = 'Ansicht der E-Rechnung'
      f.src = src
      document.body.append(f)
    }, `/api/belege/${e.belegId}/ansicht`)
    const rahmen = page.frameLocator('iframe[title="Ansicht der E-Rechnung"]')
    await expect(rahmen.getByText('SECURITY-TEST-2026-10-08').first()).toBeVisible()
    // Klicks auf die präparierten Anhänge dürfen nichts im App-Kontext auslösen
    for (const link of await rahmen.locator('a').all()) await link.click({ trial: false, timeout: 1000 }).catch(() => undefined)
    await page.waitForTimeout(500)
    expect(dialoge).toEqual([])
    // Das Dokument der Ansicht hat einen undurchsichtigen Ursprung: kein Zugriff auf Cookies oder die App
    const zugriff = await page.evaluate(() => {
      const f = document.querySelector('iframe') as HTMLIFrameElement
      try {
        return String(f.contentWindow?.document.cookie)
      } catch {
        return 'gesperrt'
      }
    })
    expect(zugriff).toBe('gesperrt')
  })

  test('direkt aufgerufen läuft die Ansicht in der Sandbox-CSP', async ({ page, baseURL }) => {
    const e = await hochladen(page.request, baseURL!, 'xss.xml', readFileSync(XSS))
    const dialoge: string[] = []
    page.on('dialog', (d) => {
      dialoge.push(d.message())
      void d.dismiss()
    })
    const antwort = await page.goto(`/api/belege/${e.belegId}/ansicht`)
    expect(antwort!.headers()['content-security-policy']).toMatch(/^sandbox allow-scripts allow-downloads;/)
    await page.waitForTimeout(500)
    expect(dialoge).toEqual([])
  })
})
