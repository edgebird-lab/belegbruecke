/**
 * Prüft das echte Windows-Programm (Debug-Build) ohne Installation (Schritte 7.3 und 7.4):
 *
 *  1. Start: Ladeseite, Server als Sidecar auf zufälligem Port von 127.0.0.1, Einmal-Token
 *     eingelöst; ohne das Cookie des Fensters antwortet der Server mit 403.
 *  2. Einrichtung (erster Benutzer, Firma, Kanzlei, Konten, Eingang, Aufbewahrung).
 *  3. Upload von 01.01a aus der KoSIT-Testsuite, Prüfen, Ansicht im Sandbox-iframe.
 *  4. Archiv prüfen (Kette in Ordnung), Prüferexport als Download.
 *  5. Fenster schließen: Programm und Server enden, der Port ist frei.
 *  6. Zweiter Start: Anmeldung, der Beleg ist noch da; ein weiterer Start landet im laufenden
 *     Programm (kein zweiter Server).
 *  7. Hartes Beenden (taskkill /F): das Job-Objekt beendet auch den Server.
 *
 * Über alle Starts: keine Meldung zur Content Security Policy. Die Oberfläche steuert Playwright
 * über die Debug-Schnittstelle von WebView2 (Port 9337). Die Programmdaten unter
 * %LOCALAPPDATA%\de.olbricht-digital.belegbruecke werden vorher beiseitegelegt und danach
 * wiederhergestellt.
 *
 * Vorher: npx tauri build --debug --no-bundle
 * Aufruf:  node scripts/desktop-test.mjs
 * BELEGBRUECKE_EXE wählt eine andere exe; sonst $CARGO_TARGET_DIR/debug bzw. src-tauri/target/debug.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const ZIEL = process.env.CARGO_TARGET_DIR ? resolve(process.env.CARGO_TARGET_DIR) : resolve('src-tauri/target')
const EXE = resolve(process.env.BELEGBRUECKE_EXE ?? join(ZIEL, 'debug', 'belegbruecke.exe'))
if (!existsSync(EXE)) throw new Error(`${EXE} fehlt. Vorher: npx tauri build --debug --no-bundle`)
const KENNUNG = 'de.olbricht-digital.belegbruecke'
const CDP = 9337
const RECHNUNG = resolve('testdaten/kosit/instances/standard/01.01a-INVOICE_ubl.xml')
if (!existsSync(RECHNUNG)) throw new Error(`${RECHNUNG} fehlt. Vorher: npm run vorbereiten`)
const PASSWORT = 'sehr-geheim-123'
const PROGRAMMDATEN = [join(process.env.LOCALAPPDATA, KENNUNG), join(process.env.APPDATA, KENNUNG)]
const SICHERUNG = `.desktop-test-sicherung`
const DOWNLOADS = join(homedir(), 'Downloads')

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}

async function warte(bedingung, text, ms = 15000) {
  const ende = Date.now() + ms
  while (Date.now() < ende) {
    if (await bedingung()) return pruefe(true, text)
    await new Promise((r) => setTimeout(r, 200))
  }
  pruefe(false, text)
}

/** Laufende Prozesse eines Namens: [{ pid, eltern, pfad }] */
function prozesse(name) {
  const aus = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='${name}'" | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.ExecutablePath)" }`], { encoding: 'utf8' })
  return aus
    .split(/\r?\n/)
    .filter(Boolean)
    .map((z) => {
      const [pid, eltern, pfad] = z.split('|')
      return { pid: Number(pid), eltern: Number(eltern), pfad }
    })
}
const laeuft = (pid) => prozesse('belegbruecke-server.exe').some((p) => p.pid === pid) || prozesse('belegbruecke.exe').some((p) => p.pid === pid)

async function portFrei(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) })
    return false
  } catch {
    return true
  }
}

// ---------- Vorbereitung: nichts darf laufen, Programmdaten beiseitelegen ----------
pruefe(prozesse('belegbruecke.exe').length === 0, 'kein anderes Belegbrücke-Programm läuft (es bekäme sonst den Start)')
pruefe(await portFrei(CDP), `Port ${CDP} für die Debug-Schnittstelle ist frei`)
for (const d of PROGRAMMDATEN) if (existsSync(d + SICHERUNG)) throw new Error(`${d + SICHERUNG} ist noch da (abgebrochener Lauf?). Bitte prüfen und von Hand zurücklegen.`)
const beiseite = PROGRAMMDATEN.filter((d) => existsSync(d))
for (const d of beiseite) renameSync(d, d + SICHERUNG)
if (beiseite.length) console.log(`Programmdaten beiseitegelegt: ${beiseite.join(', ')}`)
const downloadsVorher = new Set(existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])

function starte() {
  return spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP}` }, stdio: 'ignore' })
}

/** Verbindet sich mit der WebView2 und wartet, bis das Fenster die Oberfläche vom eigenen Server zeigt. */
async function verbinde() {
  const ende = Date.now() + 60000
  let letzter
  while (Date.now() < ende) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP}`)
      const kontext = browser.contexts()[0]
      const seite = kontext.pages()[0] ?? (await kontext.waitForEvent('page', { timeout: 10000 }))
      await seite.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 60000 })
      await seite.waitForLoadState('domcontentloaded')
      return { browser, kontext, seite }
    } catch (e) {
      letzter = e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Keine Verbindung zur WebView2: ${letzter}`)
}

/** Meldungen zur Content Security Policy aus allen Starts */
const csp = []
async function beobachteCsp(seite) {
  const merke = (text) => /Content.Security.Policy/i.test(text) && csp.push(text)
  seite.on('console', (m) => merke(m.text()))
  const cdp = await seite.context().newCDPSession(seite)
  cdp.on('Log.entryAdded', ({ entry }) => merke(entry.text))
  await cdp.send('Log.enable')
}

function serverVon(programmPid) {
  return prozesse('belegbruecke-server.exe').filter((p) => p.eltern === programmPid)
}

const h1 = (seite) => seite.getByRole('heading', { level: 1 })
let prozess
let browser
const messwerte = {}

try {
  // ---------- 1. Erster Start ----------
  let t0 = Date.now()
  prozess = starte()
  console.log(`Programm gestartet (PID ${prozess.pid}): ${EXE}`)
  let verbindung = await verbinde()
  browser = verbindung.browser
  let seite = verbindung.seite
  await beobachteCsp(seite)
  await h1(seite).filter({ hasText: 'Willkommen bei der Belegbrücke' }).waitFor({ timeout: 60000 })
  messwerte.ersterStartMs = Date.now() - t0
  pruefe(true, `Einrichtung erscheint (${messwerte.ersterStartMs} ms nach dem Start, mit neuer Datenbank)`)
  const adresse = new URL(seite.url())
  const port = Number(adresse.port)
  pruefe(port !== 8784 && port !== 4184 && port > 1024, `Server auf zufälligem Port 127.0.0.1:${port}`)
  pruefe(!adresse.search.includes('token'), 'die Adresse im Fenster enthält das Token nicht mehr')
  const server = serverVon(prozess.pid)
  pruefe(server.length === 1, `genau ein Serverprozess als Kind des Programms (PID ${server[0]?.pid})`)
  const serverPid = server[0].pid
  pruefe(server[0].pfad.toLowerCase().endsWith('\\belegbruecke-server.exe'), 'Sidecar belegbruecke-server.exe neben dem Programm')
  pruefe(existsSync(join(PROGRAMMDATEN[0], 'daten', 'belegbruecke.sqlite')), 'Datenbank im Programmordner des Benutzers (%LOCALAPPDATA%)')
  pruefe(!existsSync(join(EXE, '..', 'daten')), 'keine Daten neben dem Programm')
  const status = await fetch(`http://127.0.0.1:${port}/api/status`)
  pruefe(status.status === 403, 'ohne das Cookie des Fensters antwortet der Server mit 403')
  pruefe((await fetch(`http://127.0.0.1:${port}/programm/start?token=${'0'.repeat(64)}`, { redirect: 'manual' })).status === 403, 'ein geratenes Token öffnet nichts')
  const sicher = await seite.evaluate(() => ({ sicher: window.isSecureContext, tauri: '__TAURI_INTERNALS__' in window && typeof window.__TAURI_INTERNALS__?.invoke === 'function' }))
  pruefe(sicher.sicher, 'sicherer Kontext (127.0.0.1)')
  if (sicher.tauri) {
    // Gegenprobe: Die CSP der App sperrt den IPC-Weg über ipc.localhost, der Rückweg wird abgelehnt
    const bisher = csp.length
    const antwort = await seite.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:single-instance|ping').then(() => 'erlaubt', (e) => String(e)))
    pruefe(antwort !== 'erlaubt', `die Oberfläche darf keine Tauri-Befehle aufrufen („${antwort}“)`)
    await new Promise((r) => setTimeout(r, 1000))
    pruefe(csp.slice(bisher).some((t) => t.includes('ipc.localhost')), 'die CSP der App blockiert dabei auch den Weg zu ipc.localhost')
    csp.splice(bisher)
  } else pruefe(true, 'die Oberfläche hat keinen Zugriff auf Tauri-Befehle')

  // ---------- 2. Einrichtung ----------
  await seite.getByLabel('Ihr Name').fill('Robin')
  await seite.getByLabel('Anmeldename').fill('robin')
  await seite.getByLabel('Passwort', { exact: false }).first().fill(PASSWORT)
  await seite.getByLabel('Passwort wiederholen').fill(PASSWORT)
  await seite.getByRole('button', { name: 'Benutzer anlegen' }).click()
  await h1(seite).filter({ hasText: /^Firma$/ }).waitFor()
  await seite.getByLabel('Wie heißt Ihre Firma').fill('[Buyer name]')
  await seite.getByLabel('Straße und Hausnummer').fill('[Buyer address line 1]')
  await seite.getByLabel('Postleitzahl').fill('12345')
  await seite.getByLabel(/^Ort/).fill('[Buyer city]')
  await seite.getByRole('button', { name: 'Speichern und weiter' }).click()
  await h1(seite).filter({ hasText: /^Kanzlei$/ }).waitFor()
  await seite.getByLabel(/^Mandantennummer/).fill('1')
  await seite.getByRole('button', { name: 'Speichern und weiter' }).click()
  await h1(seite).filter({ hasText: 'Steuerschlüssel und Konten' }).waitFor()
  await seite.getByLabel('Kontonummer').fill('4900')
  await seite.getByLabel('Bezeichnung', { exact: true }).fill('Testaufwand')
  await seite.getByRole('button', { name: 'Konto speichern' }).click()
  await seite.getByRole('cell', { name: 'Testaufwand', exact: true }).waitFor()
  await seite.getByRole('button', { name: 'Speichern und weiter' }).click()
  await h1(seite).filter({ hasText: /^Eingang$/ }).waitFor()
  await seite.getByRole('button', { name: 'Speichern und weiter' }).click()
  await h1(seite).filter({ hasText: /^Aufbewahrung$/ }).waitFor()
  await seite.getByRole('checkbox', { name: /Hinweise zu Aufbewahrung/ }).check()
  await seite.getByRole('button', { name: 'Einrichtung abschließen' }).click()
  await h1(seite).filter({ hasText: /^Eingang$/ }).waitFor()
  await seite.getByRole('navigation').first().waitFor()
  pruefe(true, 'Einrichtung abgeschlossen, Eingang mit Navigation')

  // ---------- 3. Upload und Prüfung ----------
  t0 = Date.now()
  await seite.getByLabel('Rechnungsdateien auswählen').setInputFiles(RECHNUNG)
  await seite.getByRole('heading', { name: 'Ergebnis des Uploads' }).waitFor({ timeout: 60000 })
  const ergebnis = seite.locator('.ergebnisliste li').first()
  await warte(async () => ((await ergebnis.textContent()) ?? '').includes('XRechnung 3.0, UBL'), `01.01a aus der KoSIT-Testsuite hochgeladen und geprüft (${Date.now() - t0} ms)`, 60000)
  await ergebnis.getByRole('link').click()
  await seite.getByRole('heading', { name: 'Prüfen', level: 2 }).waitFor()
  await warte(async () => ((await seite.locator('.ampelzeile').textContent()) ?? '').includes('Gültig mit Hinweisen'), 'Prüfen: „Gültig mit Hinweisen“ wie im Browser (T9)')
  await seite.getByRole('button', { name: 'Weiter' }).click()
  await seite.getByRole('heading', { name: 'Ansehen', level: 2 }).waitFor()
  const rahmen = seite.locator('iframe[title="Ansicht der E-Rechnung"]')
  pruefe((await rahmen.getAttribute('sandbox')) === 'allow-scripts allow-downloads', 'Ansicht im Sandbox-iframe ohne allow-same-origin')
  await seite.frameLocator('iframe[title="Ansicht der E-Rechnung"]').getByText('123456XX').first().waitFor({ timeout: 30000 })
  pruefe(true, 'KoSIT-Ansicht zeigt die Rechnungsnummer 123456XX')

  // ---------- 4. Archiv ----------
  await seite.getByRole('link', { name: /^Archiv/ }).first().click()
  await seite.getByRole('button', { name: 'Archiv prüfen' }).click()
  await warte(async () => ((await seite.locator('.kettenbericht .hinweis-erfolg').textContent().catch(() => '')) ?? '').includes('In Ordnung'), 'Archiv prüfen: Kette in Ordnung', 30000)
  const [download] = await Promise.all([seite.waitForEvent('download', { timeout: 30000 }), seite.getByRole('button', { name: 'Prüferexport herunterladen' }).click()])
  pruefe(/^Prueferexport_anfang_\d{4}-\d{2}-\d{2}\.zip$/.test(download.suggestedFilename()), `Prüferexport als Download (${download.suggestedFilename()})`)
  const zip = await download.path().catch(() => null)
  pruefe(!zip || readFileSync(zip).subarray(0, 2).toString('latin1') === 'PK', 'der Download ist ein ZIP-Paket')

  // ---------- 5. Fenster schließen: Programm und Server enden ----------
  t0 = Date.now()
  execFileSync('taskkill', ['/PID', String(prozess.pid)])
  await warte(() => prozess.exitCode !== null, 'Schließen beendet das Programm', 20000)
  await warte(() => !laeuft(serverPid), `der Server (PID ${serverPid}) endet mit dem Programm`, 20000)
  messwerte.endeMs = Date.now() - t0
  pruefe(await portFrei(port), `Port ${port} ist danach frei (${messwerte.endeMs} ms)`)
  const log = readFileSync(join(PROGRAMMDATEN[0], 'server.log'), 'utf8')
  pruefe(/\[Hülle\] Server beendet \(exit code: 0\)/.test(log), 'der Server hat sich sauber beendet (Code 0 im server.log)')
  pruefe(!/[0-9a-f]{64}/.test(log), 'das Einmal-Token steht nicht im server.log')
  await browser.close().catch(() => {})
  await warte(() => portFrei(CDP), 'die WebView2 ist beendet', 20000)

  // ---------- 6. Zweiter Start: Anmeldung, Daten noch da, Single-Instance ----------
  t0 = Date.now()
  prozess = starte()
  verbindung = await verbinde()
  browser = verbindung.browser
  seite = verbindung.seite
  await beobachteCsp(seite)
  await h1(seite).filter({ hasText: /Anmelden/ }).waitFor({ timeout: 60000 })
  messwerte.zweiterStartMs = Date.now() - t0
  pruefe(true, `zweiter Start zeigt die Anmeldung (${messwerte.zweiterStartMs} ms)`)
  await seite.getByLabel('Anmeldename').fill('robin')
  await seite.getByLabel('Passwort').fill(PASSWORT)
  await seite.getByRole('button', { name: 'Anmelden' }).click()
  await h1(seite).filter({ hasText: /^Eingang$/ }).waitFor()
  await seite.getByRole('link', { name: /^Belege/ }).first().click()
  await warte(async () => ((await seite.locator('main').textContent()) ?? '').includes('B-00001'), 'der Beleg aus dem ersten Start ist noch da (B-00001)')
  const zweiter = starte()
  const zweiterCode = await new Promise((r) => zweiter.on('exit', r))
  pruefe(zweiterCode === 0, 'ein weiterer Start beendet sich sofort und zeigt das laufende Fenster')
  pruefe(serverVon(prozess.pid).length === 1 && prozesse('belegbruecke-server.exe').length === 1, 'weiterhin genau ein Serverprozess')

  // ---------- 7. Hartes Beenden ----------
  const serverPid2 = serverVon(prozess.pid)[0].pid
  const port2 = Number(new URL(seite.url()).port)
  await browser.close().catch(() => {})
  execFileSync('taskkill', ['/F', '/PID', String(prozess.pid)])
  await warte(() => prozess.exitCode !== null, 'taskkill /F beendet das Programm', 20000)
  await warte(() => !laeuft(serverPid2), `das Job-Objekt beendet auch den Server (PID ${serverPid2})`, 10000)
  pruefe(await portFrei(port2), `Port ${port2} ist danach frei`)
  await warte(() => portFrei(CDP), 'die WebView2 ist beendet', 20000)

  pruefe(csp.length === 0, `keine Meldung zur Content Security Policy (zwei Starts)${csp.length ? `: ${csp.join(' | ')}` : ''}`)
  console.log(`Desktop-Test bestanden. Erster Start ${messwerte.ersterStartMs} ms, zweiter Start ${messwerte.zweiterStartMs} ms, Ende ${messwerte.endeMs} ms.`)
} finally {
  await browser?.close().catch(() => {})
  if (prozess && prozess.exitCode === null) {
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(prozess.pid)], { stdio: 'ignore' })
    } catch {
      // schon beendet
    }
  }
  // Übrig gebliebene Server dieses Builds beenden (sollte nie nötig sein)
  for (const p of prozesse('belegbruecke-server.exe')) {
    if (p.pfad && resolve(p.pfad, '..') === resolve(EXE, '..')) {
      console.log(`  ! Serverprozess ${p.pid} lief noch und wird beendet`)
      execFileSync('taskkill', ['/F', '/PID', String(p.pid)], { stdio: 'ignore' })
    }
  }
  await new Promise((r) => setTimeout(r, 1500))
  // Programmdaten des Tests entfernen, gesicherte zurücklegen
  for (const d of PROGRAMMDATEN) {
    rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
    if (existsSync(d + SICHERUNG)) renameSync(d + SICHERUNG, d)
  }
  if (beiseite.length) console.log('Programmdaten wiederhergestellt.')
  // Ein Download, den WebView2 selbst gespeichert hat, gehört nicht in Robins Downloads
  if (existsSync(DOWNLOADS)) for (const n of readdirSync(DOWNLOADS)) if (!downloadsVorher.has(n) && /^Prueferexport_/.test(n)) rmSync(join(DOWNLOADS, n), { force: true })
}
