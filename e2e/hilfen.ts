import type { APIRequestContext } from '@playwright/test'

export const PASSWORT = 'e2e-passwort-123'

/** Kopfzeilen für ändernde Anfragen, wie sie die Oberfläche sendet. */
export function aendernd(baseURL: string) {
  return { 'x-belegbruecke': '1', origin: baseURL }
}

/** Ersten Benutzer einrichten oder, falls es ihn schon gibt, anmelden; das Cookie bleibt im Kontext. */
export async function anmelden(request: APIRequestContext, baseURL: string) {
  const neu = await request.post('/api/einrichtung/benutzer', { headers: aendernd(baseURL), data: { anmeldename: 'robin', name: 'Robin', passwort: PASSWORT } })
  if (neu.status() === 201) return
  const r = await request.post('/api/anmelden', { headers: aendernd(baseURL), data: { anmeldename: 'robin', passwort: PASSWORT } })
  if (!r.ok()) throw new Error(`Anmeldung fehlgeschlagen: ${r.status()} ${await r.text()}`)
}

export async function hochladen(request: APIRequestContext, baseURL: string, name: string, bytes: Buffer) {
  const r = await request.post('/api/belege', { headers: aendernd(baseURL), multipart: { dateien: { name, mimeType: 'application/xml', buffer: bytes } } })
  if (r.status() !== 201) throw new Error(`Upload fehlgeschlagen: ${r.status()} ${await r.text()}`)
  return ((await r.json()) as { ergebnisse: { ok: boolean; belegId: string; code?: string }[] }).ergebnisse[0]
}
