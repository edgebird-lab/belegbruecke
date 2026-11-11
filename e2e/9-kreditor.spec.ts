/**
 * B4 Zuordnen (Prüferfund vom 11.11.2026): Das Kreditorenkonto folgt der Wahl des Lieferanten. Vorher stand
 * bei einem schon bekannten Lieferanten „Vorgeschlagen: 70000; vergeben wird es bei der ersten Freigabe“,
 * und beim Wechsel auf „Neuer Lieferant“ blieb dessen Konto im Feld stehen.
 */
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { aendernd, axeHellUndDunkel, hochladen, vorbereiten } from './hilfen.ts'

const fallbeispiel = (name: string) => readFileSync(`testdaten/fallbeispiel/${name}`)

test('Kreditorenkonto: vorhandener Lieferant mit seinem Konto, neuer Lieferant mit dem nächsten freien', async ({ page, baseURL }) => {
  await vorbereiten(page.request, baseURL!)
  // Ein Lieferant mit Kreditorenkonto (hier von Hand vergeben), dann eine weitere Rechnung von ihm
  const erste = await hochladen(page.request, baseURL!, '03-01.03a-INVOICE_uncefact.xml', fallbeispiel('03-01.03a-INVOICE_uncefact.xml'))
  const e = (await (await page.request.get(`/api/belege/${erste.belegId}`)).json()) as { lieferant: unknown; lieferantenvorschlag: { vorhanden: { id: string; kreditorKonto: number | null } | null; neu: { name: string } }; naechsterKreditor: number }
  if (!e.lieferant) {
    const v = e.lieferantenvorschlag
    const zuordnung = v.vorhanden ? { lieferantId: v.vorhanden.id, ...(v.vorhanden.kreditorKonto ? {} : { kreditorKonto: e.naechsterKreditor }) } : { neu: { name: v.neu.name }, kreditorKonto: e.naechsterKreditor }
    expect((await page.request.put(`/api/belege/${erste.belegId}/lieferant`, { headers: aendernd(baseURL!), data: zuordnung })).ok()).toBe(true)
  }
  const zweite = await hochladen(page.request, baseURL!, '05-01.09a-INVOICE_ubl.xml', fallbeispiel('05-01.09a-INVOICE_ubl.xml'))
  const d = (await (await page.request.get(`/api/belege/${zweite.belegId}`)).json()) as { lieferantenvorschlag: { vorhanden: { name: string; kreditorKonto: number } | null }; naechsterKreditor: number }
  const vorhanden = d.lieferantenvorschlag.vorhanden!
  expect(vorhanden.kreditorKonto).toBeGreaterThanOrEqual(70000)
  expect(d.naechsterKreditor).toBeGreaterThan(vorhanden.kreditorKonto)

  await page.goto(`/#/beleg/${zweite.belegId}/zuordnen`)
  const feld = page.getByRole('textbox', { name: 'Kreditorenkonto' })
  await expect(feld).toHaveValue(String(vorhanden.kreditorKonto))
  await expect(page.getByText(`Kreditorenkonto von ${vorhanden.name}, schon vergeben`)).toBeVisible()
  await page.getByRole('radio', { name: /Neuer Lieferant/ }).check()
  await expect(feld).toHaveValue(String(d.naechsterKreditor))
  await expect(page.getByText(`Vorgeschlagen: ${d.naechsterKreditor} (nächstes freies Konto)`)).toBeVisible()
  await axeHellUndDunkel(page)
  // Zurück zum vorhandenen Lieferanten: wieder dessen Konto
  await page.getByRole('radio', { name: /Vorhandener Lieferant/ }).check()
  await expect(feld).toHaveValue(String(vorhanden.kreditorKonto))
})
