/**
 * Umbruch statt seitlichem Verschieben (WCAG 1.4.10, Prüferfund vom 11.11.2026): Bei 1280 Pixel (Laptop)
 * und 320 Pixel (400 % Vergrößerung) bleibt jede Hauptseite so breit wie das Fenster. Breite Tabellen
 * scrollen in ihrem eigenen Rahmen. Vorher schob die Erfassung von Hand schon bei 1280 Pixel die Seite
 * zur Seite (Steuerzeilen als Tabelle neben der PDF), bei 320 Pixel auch Schrittleisten und Tabellen.
 */
import { expect, test, type Page } from '@playwright/test'
import { aendernd, freigebenPerApi, hochladen, kosit, vorbereiten, zugferd } from './hilfen.ts'

async function seitlichVerschoben(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test('keine seitliche Verschiebung der Seite bei 1280 und 320 Pixel Breite', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  const h = aendernd(baseURL!)
  // Ein Beleg mit zwei Steuerzeilen bis zum Kontieren, eine PDF ohne XML zum Erfassen, eine Übergabe
  const offen = await hochladen(page.request, baseURL!, '03.01a-INVOICE_ubl.xml', kosit('standard/03.01a-INVOICE_ubl.xml'))
  const d = (await (await page.request.get(`/api/belege/${offen.belegId}`)).json()) as { beleg: { status: string }; lieferantenvorschlag: { vorhanden: { id: string } | null; neu: { name: string } } }
  if (d.beleg.status === 'geprueft') {
    const zuordnung = d.lieferantenvorschlag.vorhanden ? { lieferantId: d.lieferantenvorschlag.vorhanden.id } : { neu: { name: d.lieferantenvorschlag.neu.name } }
    expect((await page.request.put(`/api/belege/${offen.belegId}/lieferant`, { headers: h, data: zuordnung })).ok()).toBe(true)
  }
  const pdf = await hochladen(page.request, baseURL!, 'Quittung-breite.pdf', zugferd('pdf-ohne-xml.pdf'), 'application/pdf')
  let laeufe = ((await (await page.request.get('/api/uebergaben')).json()) as { laeufe: { id: string }[] }).laeufe
  if (laeufe.length === 0) {
    await freigebenPerApi(page.request, baseURL!, '01.02a-INVOICE_ubl.xml', kosit('standard/01.02a-INVOICE_ubl.xml'))
    const vorschlag = ((await (await page.request.get('/api/uebergaben')).json()) as { vorschlag: string }).vorschlag
    expect((await page.request.post('/api/uebergaben', { headers: h, data: { monat: vorschlag } })).status()).toBe(201)
    laeufe = ((await (await page.request.get('/api/uebergaben')).json()) as { laeufe: { id: string }[] }).laeufe
  }
  const seiten: [string, string][] = [
    ['Eingang', '/#/eingang'],
    ['Belege', '/#/belege'],
    ['Prüfen', `/#/beleg/${offen.belegId}/pruefen`],
    ['Kontieren', `/#/beleg/${offen.belegId}/kontieren`],
    ['Erfassung von Hand', `/#/beleg/${pdf.belegId}/ansehen`],
    ['Übergabe', '/#/uebergabe'],
    ['Übergabeprotokoll', `/#/uebergabe/${laeufe[0].id}`],
    ['Archiv', '/#/archiv'],
    ['Belegdetail', `/#/archiv/${offen.belegId}`],
    ['Kontenplan', '/#/einstellungen/konten'],
    ['Lieferanten', '/#/einstellungen/lieferanten'],
  ]
  for (const breite of [1280, 320]) {
    await page.setViewportSize({ width: breite, height: 900 })
    for (const [name, pfad] of seiten) {
      await page.goto(pfad)
      await expect(page.locator('h1')).toBeVisible()
      // Daten geladen (Eingang fragt den Postfachstatus laufend ab, deshalb nicht auf Netzruhe warten)
      await expect(page.getByText('Wird geladen …')).toHaveCount(0)
      await page.waitForTimeout(300)
      expect(await seitlichVerschoben(page), `${name} bei ${breite} Pixel`).toBeLessThanOrEqual(0)
    }
  }
  // Die Steuerzeilen der Erfassung von Hand sind bei 1280 Pixel ganz sichtbar und mit Beschriftung
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`/#/beleg/${pdf.belegId}/ansehen`)
  const zeile = page.getByRole('group', { name: 'Zeile 1' })
  await expect(zeile.getByText('Kategorie', { exact: true })).toBeVisible()
  for (const element of [zeile.getByLabel('Kategorie Zeile 1'), zeile.getByLabel('Steuer Zeile 1'), zeile.getByRole('button', { name: 'Steuer berechnen (Zeile 1)' })]) {
    const box = (await element.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(1280)
  }
  // Die Kategorie ist nicht mehr abgeschnitten („Nc“ statt „Normal (S)“): Auswahlfeld so breit wie sein Text
  expect(await zeile.getByLabel('Kategorie Zeile 1').evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.clientWidth > 90)).toBe(true)
})
