import { describe, expect, it } from 'vitest'
import { erkenneXml } from '../fach/formaterkennung.ts'
import { alleKosit, kosit, mutation, referenz } from '../testhilfen/dateien.ts'
import { levelAusSvrl, nachCustomLevel } from './stufen.ts'
import { EXTENDED_WARNUNGEN, szenarien } from './szenarien.ts'
import { validiere } from './validierung.ts'

interface Referenzeintrag {
  szenario: string | null
  angenommen: boolean
  meldungen: string[]
}
const REF = referenz<{ dateien: Record<string, Referenzeintrag> }>('kosit-1.6.3.json').dateien
const RAHMEN = { container: 'xml' as const, eingebettetAls: null, xmlSha256: '0'.repeat(64) }
const MUTATIONEN = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']
const MUTATIONSDATEIEN: Record<string, string> = {
  M1: 'M1-steuerbetrag.xml',
  M2: 'M2-ohne-kaeuferreferenz.xml',
  M3: 'M3-unbekannte-kennung.xml',
  M4: 'M4-externe-entity.xml',
  M5: 'M5-abgeschnitten.xml',
  M6: 'M6-falsches-element.xml',
  M7: 'M7-einheit-qqq.xml',
  M8: 'M8-steuersatz-16.xml',
}

async function pruefe(bytes: Uint8Array) {
  const eingang = erkenneXml(bytes, RAHMEN)
  if (!eingang.text || eingang.format.belegart !== 'e-rechnung') return { eingang, validierung: null }
  return { eingang, validierung: await validiere(eingang.text, eingang.format) }
}

/** Menge wie im Referenz-Snapshot; Xerces-Codes der XSD-Prüfung (cvc-…) werden zu „XSD“. */
function menge(meldungen: string[]): string[] {
  return [...new Set(meldungen.map((m) => (m.startsWith('cvc-') ? `XSD:${m.split(':').pop()}` : m)))].sort()
}

describe('Prüfpipeline gleich dem KoSIT-Validator (T-V1)', () => {
  it('liefert für alle 86 Testdateien Szenario, Annahme und Meldungen wie die Referenz', { timeout: 300_000 }, async () => {
    const abweichungen: string[] = []
    for (const rel of alleKosit()) {
      const { validierung } = await pruefe(kosit(rel))
      const ref = REF[rel]
      const ist = { szenario: validierung?.szenario ?? null, angenommen: validierung?.angenommen ?? false, meldungen: menge(validierung?.meldungen ?? []) }
      const soll = { szenario: ref.szenario, angenommen: ref.angenommen, meldungen: menge(ref.meldungen) }
      if (JSON.stringify(ist) !== JSON.stringify(soll)) abweichungen.push(`${rel}: ${JSON.stringify(ist)} ≠ ${JSON.stringify(soll)}`)
    }
    expect(abweichungen).toEqual([])
    expect(Object.values(REF).filter((r) => r.angenommen).length).toBeGreaterThanOrEqual(86)
  })

  it('liefert für M1 bis M8 Annahme und Meldungen wie die Referenz', { timeout: 120_000 }, async () => {
    for (const m of MUTATIONEN) {
      const { eingang, validierung } = await pruefe(mutation(m))
      const ref = REF[`mutationen/${MUTATIONSDATEIEN[m]}`]
      expect({ m, angenommen: validierung?.angenommen ?? false }).toEqual({ m, angenommen: ref.angenommen })
      if (validierung) {
        expect({ m, szenario: validierung.szenario, meldungen: menge(validierung.meldungen) }).toEqual({ m, szenario: ref.szenario, meldungen: menge(ref.meldungen) })
      } else {
        // M4 und M5 scheitern schon vor der Prüfung, wie beim Validator (generic-error)
        expect(ref.meldungen).toEqual(['generic-error:error'])
        expect(eingang.befunde[0].fehlerklasse).toBe('formatfehler')
      }
    }
  })
})

describe('Einzelfälle der Pipeline', () => {
  it('T-F4: M3 ohne Szenario wird nicht angenommen', async () => {
    const { validierung } = await pruefe(mutation('M3'))
    expect(validierung?.angenommen).toBe(false)
    expect(validierung?.szenario).toBeNull()
    expect(validierung?.befunde.map((b) => [b.regelId, b.stufe, b.fehlerklasse])).toEqual([['SZENARIO-FEHLT', 'fehler', 'formatfehler']])
    expect(validierung?.befunde[0].klartext).toContain('urn:beispiel:unbekannt')
  })

  it('T-V4: M6 meldet den XSD-Fehler mit Zeile und Spalte, danach kein Schematron', async () => {
    const { validierung } = await pruefe(mutation('M6'))
    expect(validierung?.xsdGueltig).toBe(false)
    expect(validierung?.angenommen).toBe(false)
    const xsd = validierung!.befunde.filter((b) => b.regelId === 'XSD')
    expect(xsd).toHaveLength(1)
    // Zeile 11 wie im Referenzlauf (Xerces: 11:19, Ende des Start-Tags); Spalte 5 = Beginn von <cbc:IssueDat>
    const ref = referenz<{ dateien: Record<string, { xmlMeldungen: { zeile: number }[] }> }>('kosit-1.6.3.json')
    expect(ref.dateien['mutationen/M6-falsches-element.xml'].xmlMeldungen[0].zeile).toBe(11)
    expect(xsd[0]).toMatchObject({ quelle: 'xsd', stufe: 'fehler', fehlerklasse: 'formatfehler', ort: '11:5' })
    expect(xsd[0].originaltext).toContain('IssueDat')
    expect(validierung!.meldungen).toEqual(['XSD:error'])
  })

  it('T-V5: M7 meldet BR-CL-23 als Warnung (customLevel) und wird angenommen', async () => {
    const { validierung } = await pruefe(mutation('M7'))
    expect(validierung?.angenommen).toBe(true)
    const b = validierung!.befunde.find((x) => x.regelId === 'BR-CL-23')
    expect(b).toMatchObject({ quelle: 'en16931', stufe: 'warnung', fehlerklasse: 'keine' })
    expect(validierung!.meldungen).toContain('BR-CL-23:error')
  })

  it('M1 meldet BR-CO-14 und BR-CO-15 als Geschäftsregelfehler mit Ort und Originaltext', async () => {
    const { validierung } = await pruefe(mutation('M1'))
    const fehler = validierung!.befunde.filter((b) => b.stufe === 'fehler')
    expect(fehler.map((b) => b.regelId).sort()).toEqual(['BR-CO-14', 'BR-CO-15'])
    for (const b of fehler) {
      expect(b.fehlerklasse).toBe('geschaeftsregelfehler')
      expect(b.ort).toMatch(/^\/.+/)
      expect(b.originaltext).toContain(b.regelId)
    }
  })

  it('01.01a ist angenommen; BR-DE-TMP-32 ist nur ein Hinweis', async () => {
    const { validierung } = await pruefe(kosit('standard/01.01a-INVOICE_ubl.xml'))
    expect(validierung).toMatchObject({ szenario: 'EN16931 XRechnung (UBL Invoice)', angenommen: true, xsdGueltig: true, wohlgeformt: true })
    expect(validierung!.befunde.map((b) => [b.regelId, b.stufe, b.quelle])).toEqual([['BR-DE-TMP-32', 'hinweis', 'xrechnung']])
  })
})

describe('Stufen und Szenarien', () => {
  it('folgt der Stufenlogik von default-report.xsl', () => {
    expect(levelAusSvrl('fatal', null)).toBe('error')
    expect(levelAusSvrl(null, 'error')).toBe('error')
    expect(levelAusSvrl('warning', null)).toBe('warning')
    expect(levelAusSvrl(null, 'warn')).toBe('warning')
    expect(levelAusSvrl(null, 'information')).toBe('information')
    expect(levelAusSvrl('info', null)).toBe('information')
    expect(levelAusSvrl('warning', 'fatal')).toBe('error')
    expect(levelAusSvrl(null, null)).toBe('error')
    expect(levelAusSvrl('unbekannt', null)).toBe('error')
  })

  it('lädt 11 KoSIT-Szenarien in Dateireihenfolge und 2 eigene', () => {
    const s = szenarien()
    expect(s).toHaveLength(13)
    expect(s[0].name).toBe('EN16931 XRechnung (UBL Invoice)')
    expect(s[10].name).toBe('EN16931 (CII)')
    expect(s.slice(11).map((x) => x.name)).toEqual(['Factur-X BASIC (CII)', 'Factur-X EXTENDED (CII)'])
    const xr = s[0]
    expect(xr.customLevel.get('BR-CL-23')).toBe('warning')
    expect(xr.customLevel.get('UBL-CR-646')).toBe('error')
    expect(xr.schematron.map((r) => r.quelle)).toEqual(['en16931', 'xrechnung'])
    expect(nachCustomLevel('BR-CL-23', 'error', xr)).toBe('warning')
    expect(nachCustomLevel('BR-CO-14', 'error', xr)).toBe('error')
  })

  it('friert die customLevel-Liste für EXTENDED ein (Schritt 0.7)', () => {
    const mustang = referenz<{ customLevelWarning: string[] }>('mustang-2.26.0.json')
    expect([...EXTENDED_WARNUNGEN]).toEqual(mustang.customLevelWarning)
    const ext = szenarien().find((x) => x.name === 'Factur-X EXTENDED (CII)')!
    expect(ext.eingeschraenkt).toBe(true)
    expect([...ext.customLevel.values()].every((l) => l === 'warning')).toBe(true)
    expect(ext.customLevel.size).toBe(12)
  })
})
