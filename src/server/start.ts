/**
 * Startet die Belegbrücke: Server auf 127.0.0.1 (Standard Port 8784), Prüf-Worker, tägliche
 * Sicherung der Datenbank. Umgebungsvariablen: BB_DATEN (Datenordner, Standard ./daten),
 * BB_PORT, BB_OBERFLAECHE (Ordner der gebauten Oberfläche, Standard ./dist), BB_SCHLUESSEL_DATEI
 * (Schlüssel für das Postfach-Passwort, Standard neben dem Datenordner), BB_IMAP_CA (zusätzlicher
 * Vertrauensanker für IMAP, nur für den Testserver der Browsertests).
 *
 *   node src/server/start.ts
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import type { MiddlewareHandler } from 'hono'
import { Prueferpool } from '../pruefung/pool.ts'
import { erzeugeApp } from './app.ts'
import { pruefeOffene } from './dienste/eingang.ts'
import { erzeugeDienste, raeumeSicherheitslogAuf, type Dienste } from './dienste/kontext.ts'

const HOST = '127.0.0.1'

export interface Serveroptionen {
  datenOrdner: string
  port: number
  oberflaeche: string | null
  /** nur im Windows-Programm (src/server/programm.ts) */
  programmtor?: MiddlewareHandler
}

export function optionenAusUmgebung(): Serveroptionen {
  const ui = resolve(process.env.BB_OBERFLAECHE ?? 'dist')
  return {
    datenOrdner: resolve(process.env.BB_DATEN ?? 'daten'),
    port: Number(process.env.BB_PORT ?? 8784),
    oberflaeche: existsSync(join(ui, 'index.html')) ? ui : null,
  }
}

/** Tägliche Kopie der Datenbank mit VACUUM INTO (Spezifikation 7.5), höchstens eine je Tag. */
export function sichereTaeglich(d: Dienste): string | null {
  const ordner = join(d.datenOrdner, 'sicherung')
  mkdirSync(ordner, { recursive: true })
  const ziel = join(ordner, `belegbruecke-${d.uhr().toISOString().slice(0, 10)}.sqlite`)
  if (existsSync(ziel)) return null
  d.db.sichern(ziel)
  return ziel
}

export async function starteServer(o: Serveroptionen) {
  // PDF, Prüfung und Ansicht laufen im Worker-Pool
  const pool = new Prueferpool()
  const imapCa = process.env.BB_IMAP_CA ? readFileSync(process.env.BB_IMAP_CA, 'utf8') : undefined
  const d = erzeugeDienste({ datenOrdner: o.datenOrdner, port: o.port, pruefer: pool, imapCa })
  raeumeSicherheitslogAuf(d)
  sichereTaeglich(d)
  const offen = await pruefeOffene(d)
  if (offen) console.log(`${offen} Beleg(e) mit unterbrochener Prüfung erneut geprüft.`)
  const app = erzeugeApp(d, { oberflaeche: o.oberflaeche, programmtor: o.programmtor })
  const server = serve({ fetch: app.fetch, port: o.port, hostname: HOST })
  // erfüllt, sobald der Server lauscht; abgelehnt z. B. bei belegtem Port (EADDRINUSE)
  const lauscht = new Promise<void>((ok, fehler) => {
    server.once('listening', () => ok())
    server.once('error', fehler)
  })
  // Postfach-Abruf nach Zeitplan (R23); ist das Postfach aus, tut der Zeitgeber nichts
  d.postfach.starte()
  const taeglich = setInterval(
    () => {
      raeumeSicherheitslogAuf(d)
      sichereTaeglich(d)
    },
    60 * 60 * 1000,
  )
  taeglich.unref()
  const beenden = async () => {
    clearInterval(taeglich)
    await d.postfach.stoppe()
    server.close()
    await pool.beenden()
    d.db.schliessen()
  }
  return { d, app, server, lauscht, beenden, url: `http://${HOST}:${o.port}` }
}

// Direkt gestartet (node src/server/start.ts): Server starten und bei Strg+C sauber beenden
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = optionenAusUmgebung()
  const s = await starteServer(o)
  await s.lauscht
  console.log(`Belegbrücke ${s.d.version} läuft auf ${s.url} (Daten: ${o.datenOrdner}${o.oberflaeche ? '' : ', ohne Oberfläche: erst npm run build'})`)
  const stopp = () => {
    void s.beenden().then(() => process.exit(0))
  }
  process.on('SIGINT', stopp)
  process.on('SIGTERM', stopp)
}
