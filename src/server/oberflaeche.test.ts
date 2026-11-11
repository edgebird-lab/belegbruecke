import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { lokalerAusfuehrer } from '../pruefung/eingang.ts'
import { ansicht } from '../pruefung/extraktion.ts'
import { erzeugeApp } from './app.ts'
import { erzeugeDienste } from './dienste/kontext.ts'

const ordner: string[] = []
afterEach(() => {
  for (const o of ordner.splice(0)) rmSync(o, { recursive: true, force: true })
})

function aufbau() {
  const daten = mkdtempSync(join(tmpdir(), 'bb-ui-daten-'))
  const ui = mkdtempSync(join(tmpdir(), 'bb-ui-'))
  ordner.push(ui)
  mkdirSync(join(ui, 'assets'))
  writeFileSync(join(ui, 'index.html'), '<!doctype html><title>Belegbrücke</title>')
  writeFileSync(join(ui, 'assets', 'index-abc.js'), 'console.log(1)')
  const d = erzeugeDienste({ datenOrdner: daten, port: 8784, version: '0.0.1', pruefer: { ...lokalerAusfuehrer, ansicht: async (t, s) => ansicht(t, s) } })
  ordner.push(daten)
  return { d, app: erzeugeApp(d, { oberflaeche: ui }) }
}

describe('Auslieferung der Oberfläche', () => {
  it('liefert index.html, Assets mit Typ und Cache, unbekannte Pfade als index.html', async () => {
    const { d, app } = aufbau()
    try {
      const start = await app.request('http://127.0.0.1:8784/')
      expect(start.headers.get('content-type')).toBe('text/html; charset=utf-8')
      expect(await start.text()).toContain('Belegbrücke')
      const js = await app.request('http://127.0.0.1:8784/assets/index-abc.js')
      expect(js.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
      expect(js.headers.get('cache-control')).toContain('immutable')
      for (const pfad of ['/belege/123', '/../../Windows/win.ini', '/%E0%A4%A', '/assets/../../geheim']) {
        const r = await app.request(`http://127.0.0.1:8784${pfad}`)
        expect({ pfad, status: r.status }).toEqual({ pfad, status: 200 })
        expect(await r.text()).toContain('<title>Belegbrücke</title>')
      }
      // API-Pfade fallen nie auf die Oberfläche zurück
      expect((await app.request('http://127.0.0.1:8784/api/gibt-es-nicht')).status).toBe(401)
    } finally {
      d.db.schliessen()
    }
  })
})
