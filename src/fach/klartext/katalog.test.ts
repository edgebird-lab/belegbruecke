import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { referenz, WURZEL } from '../../testhilfen/dateien.ts'
import { befund, katalogeintrag } from '../befunde.ts'
import { regelkatalogMarkdown } from './doku.ts'
import { EIGENE_REGELN } from './katalog.ts'
import { REGELWERK } from './regelwerk.ts'

describe('Klartext-Katalog (R7)', () => {
  it('umfasst mindestens 25 Regeln der Regelwerke', () => {
    expect(Object.keys(REGELWERK).length).toBeGreaterThanOrEqual(25)
  })

  it('hat die festen Einträge aus den Quellen', () => {
    expect(REGELWERK['BR-DE-15'].ustRelevant).toBe(false)
    for (const id of ['BR-CO-14', 'BR-CO-15', 'BR-CO-17']) expect(REGELWERK[id].ustRelevant).toBe(true)
    expect(REGELWERK['BR-CO-17'].klartext).toContain('Bemessung (BT-116) × Steuersatz (BT-119) / 100, auf Cent gerundet')
    expect(REGELWERK['BR-CO-17'].handlung).toBe('Korrigierte Rechnung anfordern; Vorsteuer nur aus einer richtigen Rechnung.')
  })

  it('erklärt jede Regel, die im Referenzlauf oder im EXTENDED-Vergleich vorkam', () => {
    const kosit = referenz<{ dateien: Record<string, { meldungen: string[] }> }>('kosit-1.6.3.json')
    const mustang = referenz<{ customLevelWarning: string[] }>('mustang-2.26.0.json')
    const ids = new Set<string>(mustang.customLevelWarning)
    for (const e of Object.values(kosit.dateien)) for (const m of e.meldungen) ids.add(m.split(':')[0])
    const fehlend = [...ids].filter((id) => !id.startsWith('cvc-') && id !== 'generic-error' && !katalogeintrag(id))
    expect(fehlend).toEqual([])
  })

  it('hat vollständige Einträge in eigenen Worten', () => {
    for (const [id, e] of [...Object.entries(EIGENE_REGELN), ...Object.entries(REGELWERK)]) {
      expect({ id, ok: e.titel.length > 3 && e.klartext.length > 20 && e.handlung.length > 5 }).toEqual({ id, ok: true })
      // keine englischen Originaltexte übernommen
      expect({ id, englisch: /\bshall\b|\bMUST\b/.test(e.klartext) }).toEqual({ id, englisch: false })
    }
  })

  it('ordnet Befunde nach R7 ein', () => {
    expect(befund('BR-CO-14', { quelle: 'en16931', stufe: 'fehler' })).toMatchObject({ fehlerklasse: 'geschaeftsregelfehler', ustRelevant: true })
    expect(befund('BR-CL-23', { quelle: 'en16931', stufe: 'warnung' })).toMatchObject({ fehlerklasse: 'keine', ustRelevant: false })
    expect(befund('XSD')).toMatchObject({ fehlerklasse: 'formatfehler', stufe: 'fehler', quelle: 'xsd' })
    const unbekannt = befund('BR-XY-99', { quelle: 'xrechnung', stufe: 'fehler', originaltext: '[BR-XY-99] Text' })
    expect(unbekannt).toMatchObject({ ustRelevant: 'unklar', fehlerklasse: 'geschaeftsregelfehler', originaltext: '[BR-XY-99] Text' })
    expect(unbekannt.klartext).toContain('Originaltext')
  })

  it('docs/regelkatalog.md ist aktuell (sonst: node scripts/regelkatalog.mjs)', () => {
    const datei = readFileSync(join(WURZEL, 'docs', 'regelkatalog.md'), 'utf8').replace(/\r\n/g, '\n')
    expect(datei).toBe(regelkatalogMarkdown())
  })
})
