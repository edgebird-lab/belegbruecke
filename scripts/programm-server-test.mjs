/**
 * API-Test des gebündelten Servers für das Windows-Programm (Schritt 7.2): startet die
 * mitgelieferte Laufzeit mit server.mjs wie die Tauri-Hülle (Datenordner, stdin offen), liest die
 * Bereit-Zeile, löst das Einmal-Token ein und prüft dann Einrichtung, Upload einer XRechnung aus der
 * KoSIT-Testsuite und einer ZUGFeRD-PDF (Prüfung und PDF im Worker), Ansicht, Archivprüfung und das
 * Ende mit stdin. Ohne Fenster, ohne Tauri.
 *
 * Vorher: npm run build && npm run programm:server
 * Aufruf:  node scripts/programm-server-test.mjs
 * PROGRAMM_SERVER_EXE und PROGRAMM_SERVER_ORDNER wählen eine andere Laufzeit bzw. einen anderen
 * Ordner (z. B. die installierte Fassung im Installer-Test).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const EXE = resolve(process.env.PROGRAMM_SERVER_EXE ?? 'src-tauri/binaries/belegbruecke-server-x86_64-pc-windows-msvc.exe')
const ORDNER = resolve(process.env.PROGRAMM_SERVER_ORDNER ?? 'src-tauri/server')
const SKRIPT = join(ORDNER, 'server.mjs')
for (const p of [EXE, SKRIPT]) if (!existsSync(p)) throw new Error(`${p} fehlt. Vorher: npm run build && npm run programm:server`)
const XML = 'testdaten/kosit/instances/standard/01.01a-INVOICE_ubl.xml'
const PDF = 'testdaten/zugferd/zf-en16931.pdf'
for (const p of [XML, PDF]) if (!existsSync(p)) throw new Error(`${p} fehlt. Vorher: npm run vorbereiten`)

const basis = mkdtempSync(join(tmpdir(), 'bb-programm-server-'))
const PASSWORT = 'sehr-geheim-123'

function pruefe(bedingung, text) {
  if (!bedingung) throw new Error(`Fehlgeschlagen: ${text}`)
  console.log(`  ✓ ${text}`)
}

const beginn = performance.now()
const p = spawn(EXE, [SKRIPT], {
  cwd: basis,
  env: { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, BB_DATEN: join(basis, 'daten') },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
})
let fehlerText = ''
p.stderr.on('data', (b) => (fehlerText += b.toString()))
const beendet = new Promise((ok) => p.once('exit', (code) => ok(code)))

try {
  const zeilen = createInterface({ input: p.stdout })
  const bereit = await Promise.race([
    new Promise((ok) => zeilen.on('line', (z) => z.startsWith('BELEGBRUECKE-BEREIT ') && ok(z))),
    beendet.then((code) => {
      throw new Error(`Server beendet mit ${code}: ${fehlerText}`)
    }),
    new Promise((_, fehler) => setTimeout(() => fehler(new Error('Keine Bereit-Zeile nach 60 s')), 60_000)),
  ])
  const startMs = performance.now() - beginn
  const [, portText, token] = bereit.split(' ')
  const url = `http://127.0.0.1:${portText}`
  console.log(`Server ${EXE} bereit nach ${Math.round(startMs)} ms auf ${url}`)
  pruefe(/^[0-9a-f]{64}$/.test(token), 'Bereit-Zeile nennt Port und Einmal-Token')

  pruefe((await fetch(`${url}/`)).status === 403, 'ohne Token antwortet der Server mit 403')
  const start = await fetch(`${url}/programm/start?token=${token}`, { redirect: 'manual' })
  pruefe(start.status === 303, 'das Einmal-Token öffnet das Tor')
  const tor = start.headers.get('set-cookie').split(';')[0]
  const kopf = { cookie: tor, origin: url, 'x-belegbruecke': '1' }
  pruefe((await fetch(`${url}/programm/start?token=${token}`, { redirect: 'manual' })).status === 403, 'das Token gilt nur einmal')

  const seite = await fetch(`${url}/`, { headers: { cookie: tor } })
  pruefe(seite.status === 200 && (await seite.text()).includes('<div id="root">'), 'die Oberfläche kommt aus dem Bündel')
  pruefe((seite.headers.get('content-security-policy') ?? '').includes("default-src 'self'"), 'mit der CSP der App')
  const status = await (await fetch(`${url}/api/status`, { headers: { cookie: tor } })).json()
  pruefe(status.einrichtungNoetig === true && status.artefakte?.konfiguration?.includes('XRechnung'), `Prüfartefakte gefunden (${status.artefakte?.konfiguration})`)

  const einrichtung = await fetch(`${url}/api/einrichtung/benutzer`, { method: 'POST', headers: { ...kopf, 'content-type': 'application/json' }, body: JSON.stringify({ anmeldename: 'robin', name: 'Robin', passwort: PASSWORT }) })
  pruefe(einrichtung.status === 201, 'erster Benutzer angelegt')
  const cookie = `${tor}; ${einrichtung.headers.get('set-cookie').split(';')[0]}`

  const fd = new FormData()
  fd.append('dateien', new File([readFileSync(XML)], '01.01a-INVOICE_ubl.xml', { type: 'application/xml' }))
  fd.append('dateien', new File([readFileSync(PDF)], 'zf-en16931.pdf', { type: 'application/pdf' }))
  const t0 = performance.now()
  const upload = await fetch(`${url}/api/belege`, { method: 'POST', headers: { ...kopf, cookie }, body: fd })
  const { ergebnisse } = await upload.json()
  const uploadMs = performance.now() - t0
  pruefe(upload.status === 201 && ergebnisse.length === 2, `zwei Dateien hochgeladen (${Math.round(uploadMs)} ms mit Prüfung)`)
  pruefe(ergebnisse[0].ok && ergebnisse[0].status === 'geprueft' && ergebnisse[0].format === 'XRechnung 3.0, UBL', `XRechnung geprüft (${ergebnisse[0].format})`)
  pruefe(ergebnisse[1].ok && ergebnisse[1].status === 'geprueft' && ergebnisse[1].format === 'EN 16931, CII', `ZUGFeRD-PDF: XML aus der PDF gelesen und geprüft (${ergebnisse[1].format})`)

  const { beleg } = await (await fetch(`${url}/api/belege/${ergebnisse[0].belegId}`, { headers: { cookie } })).json()
  pruefe(beleg.pruefung?.angenommen === true && beleg.pruefung.szenario === 'EN16931 XRechnung (UBL Invoice)', 'angenommen wie beim KoSIT-Validator (Szenario XRechnung UBL Invoice)')
  pruefe(beleg.daten?.rechnungsnummer === '123456XX', 'Daten über das Zwischenmodell gelesen (Rechnungsnummer 123456XX)')
  for (const e of ergebnisse) {
    const ansicht = await fetch(`${url}/api/belege/${e.belegId}/ansicht`, { headers: { cookie } })
    pruefe(ansicht.status === 200 && (await ansicht.text()).includes('123456XX'), `Ansicht der KoSIT-Visualisierung für ${e.format}`)
  }
  const kette = await (await fetch(`${url}/api/archiv/pruefen`, { method: 'POST', headers: { ...kopf, cookie, 'content-type': 'application/json' }, body: '{}' })).json()
  pruefe(kette.bericht?.ok === true && kette.bericht.dateien === 4, `Archivprüfung in Ordnung (${kette.bericht?.dateien} Dateien)`)

  p.stdin.end()
  const code = await Promise.race([beendet, new Promise((ok) => setTimeout(() => ok('Zeit abgelaufen'), 15_000))])
  pruefe(code === 0, `stdin geschlossen: Server endet sauber (Code ${code})`)
  pruefe(await fetch(`${url}/api/status`).then(() => false, () => true), 'Port ist danach frei')
  console.log(`API-Test des Programm-Servers bestanden (Start ${Math.round(startMs)} ms, Upload ${Math.round(uploadMs)} ms).`)
} finally {
  if (p.exitCode === null) p.kill()
  await beendet
  rmSync(basis, { recursive: true, force: true })
}
