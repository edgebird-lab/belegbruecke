/**
 * Startet die Belegbrücke: Server auf 127.0.0.1 (Standard Port 8784), Prüf-Worker, tägliche
 * Sicherung der Datenbank. Umgebungsvariablen: BB_DATEN (Datenordner, Standard ./daten),
 * BB_PORT, BB_OBERFLAECHE (Ordner der gebauten Oberfläche, Standard ./dist).
 *
 *   node src/server/start.ts
 */
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { ansicht } from '../pruefung/extraktion.ts'
import { Prueferpool } from '../pruefung/pool.ts'
import { erzeugeApp } from './app.ts'
import { pruefeOffene } from './dienste/eingang.ts'
import { erzeugeDienste, raeumeSicherheitslogAuf, type Dienste } from './dienste/kontext.ts'

const HOST = '127.0.0.1'

export interface Serveroptionen {
  datenOrdner: string
  port: number
  oberflaeche: string | null
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
  const pool = new Prueferpool()
  const pruefer = Object.assign(pool, {
    // Die Ansicht läuft ebenfalls im Worker
    ansicht: (text: string, syntax: Parameters<typeof ansicht>[1]) => pool.ansicht(text, syntax),
  })
  const d = erzeugeDienste({ datenOrdner: o.datenOrdner, port: o.port, pruefer })
  raeumeSicherheitslogAuf(d)
  sichereTaeglich(d)
  const offen = await pruefeOffene(d)
  if (offen) console.log(`${offen} Beleg(e) mit unterbrochener Prüfung erneut geprüft.`)
  const app = erzeugeApp(d, { oberflaeche: o.oberflaeche })
  const server = serve({ fetch: app.fetch, port: o.port, hostname: HOST })
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
    server.close()
    await pool.beenden()
    d.db.schliessen()
  }
  return { d, app, server, beenden, url: `http://${HOST}:${o.port}` }
}

// Direkt gestartet (node src/server/start.ts): Server starten und bei Strg+C sauber beenden
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}` || process.argv[1]?.endsWith('start.ts')) {
  const o = optionenAusUmgebung()
  const s = await starteServer(o)
  console.log(`Belegbrücke ${s.d.version} läuft auf ${s.url} (Daten: ${o.datenOrdner}${o.oberflaeche ? '' : ', ohne Oberfläche: erst npm run build'})`)
  const stopp = () => {
    void s.beenden().then(() => process.exit(0))
  }
  process.on('SIGINT', stopp)
  process.on('SIGTERM', stopp)
}
