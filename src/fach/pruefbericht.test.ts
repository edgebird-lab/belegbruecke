import { describe, expect, it } from 'vitest'
import { lokalerAusfuehrer, verarbeiteDatei } from '../pruefung/eingang.ts'
import { kosit, mutation, zugferd } from '../testhilfen/dateien.ts'
import { BEISPIEL_FIRMA } from '../testhilfen/rechnungen.ts'
import { ampel, erstellePruefergebnis, zusatzUst, type Pruefkontext } from './pruefbericht.ts'

const KONTEXT: Pruefkontext = {
  firma: BEISPIEL_FIRMA,
  heute: '2026-11-11',
  zeitpunkt: '2026-11-11T09:30:02.000Z',
  pruefprogramm: 'belegbruecke 0.1.0',
  artefakte: { konfiguration: 'k', enSchematron: 'e', xrSchematron: 'x' },
}

async function bericht(bytes: Uint8Array, art: 'xml' | 'pdf' = 'xml') {
  const t = await verarbeiteDatei(bytes, art, lokalerAusfuehrer)
  return { t, p: erstellePruefergebnis(t, KONTEXT) }
}

describe('Prüfergebnis und Ampel (R6 Punkt 9, Abschnitt 5.3)', () => {
  it('03.01a ist grün: angenommen, keine Warnung', async () => {
    const { t, p } = await bericht(kosit('standard/03.01a-INVOICE_ubl.xml'))
    expect(p).toMatchObject({ formatVersion: 1, angenommen: true, szenario: 'EN16931 XRechnung (UBL Invoice)', pruefprogramm: 'belegbruecke 0.1.0' })
    expect(p.pflichtangaben?.regelwerk).toBe('§ 14 Abs. 4 UStG')
    expect(ampel(t.format, p)).toEqual({ farbe: 'gruen', symbol: '✓', text: 'Gültige XRechnung 3.0 (UBL)' })
  })

  it('01.01a ist gelb wegen des Leistungszeitpunkts (R8 Nr. 6)', async () => {
    const { t, p } = await bericht(kosit('standard/01.01a-INVOICE_ubl.xml'))
    expect(p.befunde.map((b) => [b.regelId, b.stufe])).toEqual([
      ['BR-DE-TMP-32', 'hinweis'],
      ['USTG-14-4-6', 'warnung'],
    ])
    expect(ampel(t.format, p)).toEqual({ farbe: 'gelb', symbol: '!', text: 'Gültig mit Hinweisen' })
  })

  it('M1 ist rot (nicht angenommen); M2 trägt den Zusatz „umsatzsteuerlich unbeachtlich“', async () => {
    const m1 = await bericht(mutation('M1'))
    expect(ampel(m1.t.format, m1.p)).toMatchObject({ farbe: 'rot', text: 'Nicht angenommen' })
    const m2 = await bericht(mutation('M2'))
    const b = m2.p.befunde.find((x) => x.regelId === 'BR-DE-15')!
    expect(zusatzUst(b)).toBe('umsatzsteuerlich unbeachtlich')
    expect(zusatzUst(m1.p.befunde.find((x) => x.regelId === 'BR-CO-14')!)).toBeNull()
  })

  it('fehlende Pflichtangabe macht die Ampel rot, auch wenn die Datei angenommen ist', async () => {
    const t = await verarbeiteDatei(kosit('standard/03.01a-INVOICE_ubl.xml'), 'xml', lokalerAusfuehrer)
    t.daten!.verkaeufer.ustId = null
    t.daten!.verkaeufer.steuernummer = null
    const p = erstellePruefergebnis(t, KONTEXT)
    expect(p.angenommen).toBe(true)
    expect(ampel(t.format, p)).toMatchObject({ farbe: 'rot', text: 'Pflichtangabe fehlt' })
  })

  it('sonstige Rechnungen sind grau und ohne Pflichtangabenprüfung', async () => {
    const { t, p } = await bericht(zugferd('zf-minimum.pdf'), 'pdf')
    expect(p.pflichtangaben).toBeNull()
    expect(ampel(t.format, p)).toEqual({ farbe: 'grau', symbol: '○', text: 'Keine E-Rechnung (sonstige Rechnung)' })
  })

  it('nennt ZUGFeRD-Profile in der Ampel', async () => {
    const { t, p } = await bericht(zugferd('zf-en16931.pdf'), 'pdf')
    const a = ampel(t.format, p)
    expect(a.text).toMatch(/^Gültig/)
    if (a.farbe === 'gruen') expect(a.text).toBe('Gültige E-Rechnung (EN 16931, CII)')
  })
})
