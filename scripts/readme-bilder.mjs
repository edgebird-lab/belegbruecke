// Bilder für die README (Schritt 6.4): startet den Server mit einem frischen Datenordner auf Port 4184
// (Port der Browsertests, nie 4173), legt Testbelege aus der KoSIT-Testsuite an und fotografiert die
// wichtigsten Seiten mit Edge (lokal) bzw. Chrome (CI=1) nach docs/bilder/.
//
//   npm run build && node scripts/readme-bilder.mjs
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const PORT = 4184
const BASIS = `http://127.0.0.1:${PORT}`
const ZIEL = new URL('../docs/bilder/', import.meta.url)
const daten = mkdtempSync(join(tmpdir(), 'bb-bilder-'))
const kosit = (rel) => readFileSync(new URL(`../testdaten/kosit/instances/${rel}`, import.meta.url))

const server = spawn(process.execPath, ['src/server/start.ts'], { env: { ...process.env, BB_PORT: String(PORT), BB_DATEN: join(daten, 'daten'), BB_SCHLUESSEL_DATEI: join(daten, 'schluessel') }, stdio: 'inherit' })
const ende = async () => {
  server.kill()
  await new Promise((ok) => setTimeout(ok, 500))
  for (const e of readdirSync(daten, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
  rmSync(daten, { recursive: true, force: true })
}

try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${BASIS}/api/status`)).ok) break
    } catch {
      // Server startet noch
    }
    if (i > 120) throw new Error('Server startet nicht')
    await new Promise((ok) => setTimeout(ok, 500))
  }
  const browser = await chromium.launch({ channel: process.env.CI ? 'chrome' : 'msedge' })
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'de-DE', colorScheme: 'light' })
  const seite = await kontext.newPage()
  const anfrage = seite.request
  const kopf = { 'x-belegbruecke': '1', origin: BASIS }
  const json = async (methode, pfad, daten) => {
    const r = await anfrage.fetch(`${BASIS}/api${pfad}`, { method: methode, headers: kopf, data: daten })
    if (!r.ok()) throw new Error(`${methode} ${pfad}: ${r.status()} ${await r.text()}`)
    return r.json()
  }
  // Einrichten: Benutzer, Beispiel-Firma aus den KoSIT-Dateien, Kontenplan
  await json('POST', '/einrichtung/benutzer', { anmeldename: 'robin', name: 'Robin', passwort: 'readme-bilder-123' })
  const e = await (await anfrage.get(`${BASIS}/api/einstellungen`)).json()
  delete e.passwortGesetzt
  await json('PUT', '/einstellungen', { ...e, firma: { name: '[Buyer name]', namensVarianten: [], anschrift: { zeile1: '[Buyer address line 1]', plz: '12345', ort: '[Buyer city]', land: 'DE' }, kleinunternehmer: false }, eingerichtetAm: 'jetzt' })
  await json('POST', '/sachkonten', { csv: '4900;Sonstige Aufwendungen;nein\n4930;Bürobedarf;nein\n4940;Zeitschriften, Bücher;nein\n4980;Betriebsbedarf;nein\n' })
  const hoch = async (name, bytes) => {
    const r = await anfrage.post(`${BASIS}/api/belege`, { headers: kopf, multipart: { dateien: { name, mimeType: 'application/xml', buffer: bytes } } })
    return (await r.json()).ergebnisse[0].belegId
  }
  const freigeben = async (id, konto) => {
    const d = await (await anfrage.get(`${BASIS}/api/belege/${id}`)).json()
    await json('PUT', `/belege/${id}/lieferant`, d.lieferantenvorschlag.vorhanden ? { lieferantId: d.lieferantenvorschlag.vorhanden.id } : { neu: { name: d.lieferantenvorschlag.neu.name } })
    const v = (await (await anfrage.get(`${BASIS}/api/belege/${id}`)).json()).kontierungsvorschlag
    await json('PUT', `/belege/${id}/kontierung`, { zeilen: v.zeilen.map(() => ({ sachkonto: konto })) })
    await json('POST', `/belege/${id}/freigeben`, { inhaltGeprueft: true, begruendung: null })
  }
  const a = await hoch('01.01a-INVOICE_ubl.xml', kosit('standard/01.01a-INVOICE_ubl.xml'))
  await freigeben(a, 4930)
  const b = await hoch('01.02a-INVOICE_ubl.xml', kosit('standard/01.02a-INVOICE_ubl.xml'))
  await freigeben(b, 4930)
  const c = await hoch('03.01a-INVOICE_ubl.xml', kosit('standard/03.01a-INVOICE_ubl.xml'))
  await json('PUT', `/belege/${c}/lieferant`, { neu: { name: '[Seller name]' } })
  await hoch('M1-steuerbetrag.xml', readFileSync(new URL('../testdaten/mutationen/M1-steuerbetrag.xml', import.meta.url)))
  await hoch('02.01a-INVOICE_ubl.xml', kosit('standard/02.01a-INVOICE_ubl.xml'))

  mkdirSync(ZIEL, { recursive: true })
  const foto = async (name) => {
    await seite.waitForTimeout(400)
    // Fokusrahmen der Überschrift nach dem Seitenwechsel gehört nicht ins Bild
    await seite.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await seite.screenshot({ path: new URL(name, ZIEL).pathname.replace(/^\/([A-Za-z]:)/, '$1') })
    console.log(`docs/bilder/${name}`)
  }
  await seite.goto(`${BASIS}/#/eingang`)
  await seite.getByRole('table', { name: 'Offene Belege' }).waitFor()
  await foto('eingang.png')
  await seite.goto(`${BASIS}/#/beleg/${a}/pruefen`)
  await seite.locator('.ampelzeile').waitFor()
  await foto('pruefen.png')
  await seite.goto(`${BASIS}/#/beleg/${a}/ansehen`)
  await seite.frameLocator('iframe[title="Ansicht der E-Rechnung"]').getByText('123456XX').first().waitFor()
  await foto('ansehen.png')
  await seite.goto(`${BASIS}/#/beleg/${c}/kontieren`)
  await seite.getByLabel('Sachkonto für Zeile 1').selectOption('4940')
  await seite.getByLabel('Sachkonto für Zeile 2').selectOption('4940')
  await foto('kontieren.png')
  const lauf = await json('POST', '/uebergaben', { monat: '2016-04' })
  await seite.goto(`${BASIS}/#/uebergabe/${lauf.lauf.id}`)
  await seite.locator('.protokoll-druck').waitFor()
  await foto('uebergabe.png')
  await seite.goto(`${BASIS}/#/archiv`)
  await seite.getByRole('button', { name: 'Archiv prüfen' }).click()
  await seite.locator('.kettenbericht').waitFor()
  await foto('archiv.png')
  await seite.emulateMedia({ colorScheme: 'dark' })
  await seite.goto(`${BASIS}/#/beleg/${a}/pruefen`)
  await seite.locator('.ampelzeile').waitFor()
  await foto('pruefen-dunkel.png')
  await browser.close()
} finally {
  await ende()
}
