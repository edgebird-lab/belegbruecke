import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

export const PASSWORT = 'e2e-passwort-123'

/** Kopfzeilen für ändernde Anfragen, wie sie die Oberfläche sendet. */
export function aendernd(baseURL: string) {
  return { 'x-belegbruecke': '1', origin: baseURL }
}

/** Testdatei aus der KoSIT-Testsuite, z. B. "standard/01.01a-INVOICE_ubl.xml". */
export const kosit = (rel: string) => readFileSync(`testdaten/kosit/instances/${rel}`)
export const mutation = (name: string) => readFileSync(`testdaten/mutationen/${name}`)
export const zugferd = (name: string) => readFileSync(`testdaten/zugferd/${name}`)

/** Ersten Benutzer einrichten oder, falls es ihn schon gibt, anmelden; das Cookie bleibt im Kontext. */
export async function anmelden(request: APIRequestContext, baseURL: string) {
  const neu = await request.post('/api/einrichtung/benutzer', { headers: aendernd(baseURL), data: { anmeldename: 'robin', name: 'Robin', passwort: PASSWORT } })
  if (neu.status() === 201) return
  const r = await request.post('/api/anmelden', { headers: aendernd(baseURL), data: { anmeldename: 'robin', passwort: PASSWORT } })
  if (!r.ok()) throw new Error(`Anmeldung fehlgeschlagen: ${r.status()} ${await r.text()}`)
}

/**
 * Stand für die Browsertests herstellen, falls der Einrichtungstest nicht vorher lief: angemeldet,
 * Einrichtung abgeschlossen mit der Beispiel-Firma „[Buyer name]“ (Spezifikation 9.2) und
 * Test-Kontenplan 4900 und 4901 (4901 Automatikkonto).
 */
export async function vorbereiten(request: APIRequestContext, baseURL: string) {
  await anmelden(request, baseURL)
  const e = (await (await request.get('/api/einstellungen')).json()) as Record<string, unknown> & { eingerichtetAm: string | null; passwortGesetzt?: boolean }
  if (!e.eingerichtetAm) {
    delete e.passwortGesetzt
    const r = await request.put('/api/einstellungen', {
      headers: aendernd(baseURL),
      data: { ...e, firma: { name: '[Buyer name]', namensVarianten: [], anschrift: { zeile1: '[Buyer address line 1]', plz: '12345', ort: '[Buyer city]', land: 'DE' }, kleinunternehmer: false }, eingerichtetAm: 'jetzt' },
    })
    if (!r.ok()) throw new Error(`Einstellungen: ${r.status()} ${await r.text()}`)
  }
  const konten = (await (await request.get('/api/sachkonten')).json()) as { sachkonten: { nummer: number }[] }
  if (!konten.sachkonten.some((k) => k.nummer === 4900)) {
    const r = await request.post('/api/sachkonten', { headers: aendernd(baseURL), data: { csv: '4900;Testaufwand;nein\n4901;Testaufwand Automatik;ja\n' } })
    if (!r.ok()) throw new Error(`Kontenplan: ${r.status()} ${await r.text()}`)
  }
}

export async function hochladen(request: APIRequestContext, baseURL: string, name: string, bytes: Buffer, mimeType = 'application/xml') {
  const r = await request.post('/api/belege', { headers: aendernd(baseURL), multipart: { dateien: { name, mimeType, buffer: bytes } } })
  if (r.status() !== 201) throw new Error(`Upload fehlgeschlagen: ${r.status()} ${await r.text()}`)
  return ((await r.json()) as { ergebnisse: { ok: boolean; belegId: string; code?: string }[] }).ergebnisse[0]
}

/** axe ohne Befunde der Stufen serious und critical, in der aktuellen Darstellung. */
export async function axe(page: Page) {
  const ergebnis = await new AxeBuilder({ page }).analyze()
  const schwer = ergebnis.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(schwer.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)).toEqual([])
}

/** U-5: axe hell und dunkel auf der aktuellen Seite. */
export async function axeHellUndDunkel(page: Page) {
  for (const schema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: schema })
    await axe(page)
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

/** Mit der Tabulatortaste bis zum Element gehen (U-1: nur per Tastatur); scheitert, wenn es nicht erreichbar ist. */
export async function perTab(page: Page, ziel: Locator, hoechstens = 80) {
  for (let i = 0; i < hoechstens; i++) {
    if (await ziel.evaluate((el) => el === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  throw new Error(`Per Tabulator nicht erreichbar: ${ziel.toString()}`)
}

/** Feld per Tastatur füllen: hingehen, Inhalt markieren, tippen. */
export async function tippe(page: Page, ziel: Locator, text: string) {
  await perTab(page, ziel)
  await page.keyboard.press('Control+A')
  await page.keyboard.type(text)
}

/** Beleg per API hochladen, zuordnen, auf `konto` kontieren und freigeben (für Tests, die einen freigegebenen Beleg brauchen). */
export async function freigebenPerApi(request: APIRequestContext, baseURL: string, name: string, bytes: Buffer, konto = 4900): Promise<string | null> {
  const e = await hochladen(request, baseURL, name, bytes)
  if (!e.ok) return null
  const h = aendernd(baseURL)
  const d = (await (await request.get(`/api/belege/${e.belegId}`)).json()) as { lieferantenvorschlag: { vorhanden: { id: string } | null; neu: { name: string } } }
  const zuordnung = d.lieferantenvorschlag.vorhanden ? { lieferantId: d.lieferantenvorschlag.vorhanden.id } : { neu: { name: d.lieferantenvorschlag.neu.name } }
  await request.put(`/api/belege/${e.belegId}/lieferant`, { headers: h, data: zuordnung })
  const v = (await (await request.get(`/api/belege/${e.belegId}`)).json()) as { kontierungsvorschlag: { zeilen: unknown[] } }
  await request.put(`/api/belege/${e.belegId}/kontierung`, { headers: h, data: { zeilen: v.kontierungsvorschlag.zeilen.map(() => ({ sachkonto: konto })) } })
  const f = await request.post(`/api/belege/${e.belegId}/freigeben`, { headers: h, data: { inhaltGeprueft: true, begruendung: 'Freigabe im Browsertest vorbereitet' } })
  if (!f.ok()) throw new Error(`Freigabe fehlgeschlagen: ${f.status()} ${await f.text()}`)
  return e.belegId
}
