import { describe, expect, it } from 'vitest'
import { alleKosit, kosit, kositText, mutation, text } from '../testhilfen/dateien.ts'
import { erkenneXml, formatBezeichnung, leseWurzel, profilAusKennung } from './formaterkennung.ts'
import { alsUtf8Deklaration, dekodiereXml, enthaeltDtd } from './zeichensatz.ts'

const RAHMEN = { container: 'xml' as const, eingebettetAls: null, xmlSha256: '0'.repeat(64) }

/**
 * Schnellste von fünf Messungen in ms. Eine einzelne Messung schwankt, wenn der Rechner gerade
 * ausgelastet ist (parallele Testdateien, Speicherbereinigung); ein Parser, der die Entitäten
 * wirklich auflöst, wäre auch im besten Lauf weit über der Grenze.
 */
function schnellste<T>(f: () => T): { dauer: number; ergebnis: T } {
  let dauer = Infinity
  let ergebnis = f()
  for (let i = 0; i < 5; i++) {
    const start = performance.now()
    ergebnis = f()
    dauer = Math.min(dauer, performance.now() - start)
  }
  return { dauer, ergebnis }
}

describe('Formaterkennung der KoSIT-Testsuite (T-F1)', () => {
  const dateien = alleKosit()

  it('findet 86 Testdateien', () => {
    expect(dateien).toHaveLength(86)
  })

  it('erkennt Syntax aus dem Dateinamen und Profil aus dem Ordner', () => {
    for (const rel of dateien) {
      const e = erkenneXml(kosit(rel), RAHMEN)
      const syntax = rel.endsWith('_ubl.xml') ? 'ubl-invoice' : rel.endsWith('_uncefact.xml') ? 'cii' : '?'
      const profil = rel.startsWith('extension/') ? 'xrechnung-3.0-extension' : rel.startsWith('technical-cases/cvd/') ? 'xrechnung-3.0-cvd' : 'xrechnung-3.0'
      expect({ rel, syntax: e.format.syntax, profil: e.format.profil, belegart: e.format.belegart }).toEqual({ rel, syntax, profil, belegart: 'e-rechnung' })
      expect(e.befunde).toEqual([])
      expect(e.wohlgeformt).toBe(true)
      expect(e.format.zeichensatz).toBe('utf-8')
    }
  })

  it('zeigt das Format in Klartext', () => {
    expect(formatBezeichnung(erkenneXml(kosit('standard/01.01a-INVOICE_ubl.xml'), RAHMEN).format)).toBe('XRechnung 3.0, UBL')
    expect(formatBezeichnung(erkenneXml(kosit('standard/01.01a-INVOICE_uncefact.xml'), RAHMEN).format)).toBe('XRechnung 3.0, CII')
  })
})

describe('Schutz und Wohlgeformtheit', () => {
  it('T-F2: M4 wird vor dem Parsen wegen der DTD abgelehnt, in unter 100 ms', () => {
    const { dauer, ergebnis: e } = schnellste(() => erkenneXml(mutation('M4'), RAHMEN))
    expect(dauer).toBeLessThan(100)
    expect(e.befunde.map((b) => [b.regelId, b.stufe, b.fehlerklasse])).toEqual([['SICHERHEIT-DTD', 'fehler', 'formatfehler']])
    expect(e.text).toBeNull()
    expect(e.format.belegart).toBe('sonstige-rechnung')
  })

  it('T-S6: „Billion Laughs“ endet ebenso schnell', () => {
    const lol =
      '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;"><!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">]><lolz>&lol3;</lolz>'
    const { dauer, ergebnis: e } = schnellste(() => erkenneXml(text(lol), RAHMEN))
    expect(dauer).toBeLessThan(100)
    expect(e.befunde[0].regelId).toBe('SICHERHEIT-DTD')
  })

  it('erkennt DTD und Entity auch klein geschrieben', () => {
    expect(enthaeltDtd('<!doctype x>')).toBe(true)
    expect(enthaeltDtd('<!ENTITY a "b">')).toBe(true)
    expect(enthaeltDtd('<a>DOCTYPE</a>')).toBe(false)
  })

  it('T-F3: M5 ist nicht wohlgeformt, Formatfehler mit Ort', () => {
    const e = erkenneXml(mutation('M5'), RAHMEN)
    expect(e.wohlgeformt).toBe(false)
    expect(e.befunde).toHaveLength(1)
    expect(e.befunde[0]).toMatchObject({ regelId: 'XML-WOHLGEFORMT', stufe: 'fehler', fehlerklasse: 'formatfehler', quelle: 'xml' })
    expect(e.befunde[0].ort).toMatch(/^\d+:\d+$/)
    expect(e.befunde[0].klartext).toContain('sonstige Rechnung')
  })
})

describe('Zeichensatz (R3)', () => {
  it('T-F5: 01.01a als ISO-8859-1 mit „Müller“ wird richtig gelesen', () => {
    const original = kositText('standard/01.01a-INVOICE_ubl.xml')
    const latin = original.replace('encoding="UTF-8"', 'encoding="ISO-8859-1"').replace('[Seller name]', 'Müller')
    // Zeichen außerhalb von ISO-8859-1 (z. B. „…“) als Zeichenreferenz, wie es ein Erzeuger täte
    const liste: number[] = []
    for (const z of latin) {
      const c = z.codePointAt(0)!
      if (c <= 0xff) liste.push(c)
      else liste.push(...Array.from(`&#${c};`, (x) => x.charCodeAt(0)))
    }
    const iso = new Uint8Array(liste)
    // „ü“ ist in ISO-8859-1 ein Byte (0xFC), kein UTF-8
    expect(iso.includes(0xfc)).toBe(true)
    const e = erkenneXml(iso, RAHMEN)
    expect(e.format.zeichensatz).toBe('iso-8859-1')
    expect(e.text).toContain('<cbc:RegistrationName>Müller</cbc:RegistrationName>')
    const o = erkenneXml(kosit('standard/01.01a-INVOICE_ubl.xml'), RAHMEN)
    expect({ ...e.format, zeichensatz: 'x' }).toEqual({ ...o.format, zeichensatz: 'x' })
  })

  it('erkennt BOM und Deklaration', () => {
    expect(dekodiereXml(new Uint8Array([0xef, 0xbb, 0xbf, ...text('<a>ä</a>')]))).toEqual({ ok: true, text: '<a>ä</a>', zeichensatz: 'utf-8' })
    const le = new Uint8Array([0xff, 0xfe, ...Array.from('<a/>').flatMap((z) => [z.charCodeAt(0), 0])])
    expect(dekodiereXml(le)).toEqual({ ok: true, text: '<a/>', zeichensatz: 'utf-16le' })
    const be = new Uint8Array([0xfe, 0xff, ...Array.from('<a/>').flatMap((z) => [0, z.charCodeAt(0)])])
    expect(dekodiereXml(be)).toEqual({ ok: true, text: '<a/>', zeichensatz: 'utf-16be' })
    const cp = new Uint8Array([...text('<?xml version="1.0" encoding="windows-1252"?><a>'), 0x80, ...text('</a>')])
    expect(dekodiereXml(cp)).toMatchObject({ ok: true, zeichensatz: 'windows-1252', text: expect.stringContaining('<a>€</a>') })
    expect(dekodiereXml(text("<?xml version='1.0' encoding='us-ascii'?><a/>"))).toMatchObject({ ok: true, zeichensatz: 'utf-8' })
  })

  it('meldet Unlesbares und Unbekanntes', () => {
    const kaputt = new Uint8Array([...text('<a>'), 0xc3, 0x28, ...text('</a>')])
    expect(dekodiereXml(kaputt)).toMatchObject({ ok: false, zeichensatz: 'utf-8' })
    expect(dekodiereXml(text('<?xml version="1.0" encoding="Shift_JIS"?><a/>'))).toMatchObject({ ok: false, zeichensatz: 'shift_jis' })
    expect(dekodiereXml(text('<?xml version="1.0" encoding="UTF-16"?><a/>'))).toMatchObject({ ok: false, grund: expect.stringContaining('Byte-Order-Mark') })
    const e = erkenneXml(kaputt, RAHMEN)
    expect(e.befunde.map((b) => [b.regelId, b.fehlerklasse])).toEqual([['XML-ZEICHENSATZ', 'formatfehler']])
  })

  it('setzt die Deklaration für die Prüfwerkzeuge auf UTF-8, ohne Zeilen zu verschieben', () => {
    const t = '<?xml version="1.0" encoding="ISO-8859-1"?>\n<a/>'
    expect(alsUtf8Deklaration(t)).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<a/>')
    expect(alsUtf8Deklaration("<?xml version='1.0' encoding='latin1' standalone='yes'?><a/>")).toBe("<?xml version='1.0' encoding='UTF-8' standalone='yes'?><a/>")
    expect(alsUtf8Deklaration('<a/>')).toBe('<a/>')
  })
})

describe('Profile und Wurzeln (R4)', () => {
  const ubl = kositText('standard/01.01a-INVOICE_ubl.xml')
  const KENNUNG = 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0'
  const mitKennung = (k: string) => ubl.replace(`<cbc:CustomizationID>${KENNUNG}</cbc:CustomizationID>`, `<cbc:CustomizationID>${k}</cbc:CustomizationID>`)

  it('ordnet die Factur-X-Profile zu', () => {
    expect(profilAusKennung('urn:cen.eu:en16931:2017')).toBe('en16931')
    expect(profilAusKennung('urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic')).toBe('zugferd-basic')
    expect(profilAusKennung('urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:extended')).toBe('zugferd-extended')
    expect(profilAusKennung('urn:beispiel:unbekannt')).toBe('unbekannt')
    expect(profilAusKennung(null)).toBe('unbekannt')
    expect(profilAusKennung('constructor')).toBe('unbekannt')
  })

  it('vergleicht BT-24 exakt, ohne Trimmen', () => {
    const e = erkenneXml(text(mitKennung(` ${KENNUNG}`)), RAHMEN)
    expect(e.format.profil).toBe('unbekannt')
    expect(e.format.belegart).toBe('e-rechnung') // wird dann an SZENARIO-FEHLT scheitern
    expect(e.format.spezifikationsKennung).toBe(` ${KENNUNG}`)
  })

  it('M3: unbekannte Kennung ergibt Profil „unbekannt“', () => {
    expect(erkenneXml(mutation('M3'), RAHMEN).format).toMatchObject({ syntax: 'ubl-invoice', profil: 'unbekannt', spezifikationsKennung: 'urn:beispiel:unbekannt' })
  })

  it('MINIMUM und BASIC WL sind sonstige Rechnungen', () => {
    for (const [k, profil] of [
      ['urn:factur-x.eu:1p0:minimum', 'zugferd-minimum'],
      ['urn:factur-x.eu:1p0:basicwl', 'zugferd-basic-wl'],
    ]) {
      const e = erkenneXml(text(mitKennung(k)), RAHMEN)
      expect(e.format).toMatchObject({ belegart: 'sonstige-rechnung', profil })
      expect(e.format.grund).toContain('UStAE 14.1 Abs. 14')
      expect(e.befunde.map((b) => [b.regelId, b.stufe, b.fehlerklasse])).toEqual([['PROFIL-KEINE-ERECHNUNG', 'warnung', 'formatfehler']])
      expect(formatBezeichnung(e.format)).toContain('keine E-Rechnung')
    }
  })

  it('ZUGFeRD 1.0 und fremde Wurzeln sind keine E-Rechnung', () => {
    const zf1 = '<?xml version="1.0"?><rsm:CrossIndustryDocument xmlns:rsm="urn:ferd:CrossIndustryDocument:invoice:1p0"/>'
    const e = erkenneXml(text(zf1), RAHMEN)
    expect(e.format).toMatchObject({ belegart: 'sonstige-rechnung', syntax: null, grund: 'Format wird nicht als E-Rechnung anerkannt' })
    expect(e.befunde[0].regelId).toBe('FORMAT-UNBEKANNT')
    // Invoice im falschen Namensraum
    expect(leseWurzel('<Invoice xmlns="urn:falsch"/>').syntax).toBeNull()
  })

  it('löst Namensräume unabhängig vom Präfix auf', () => {
    const anders = ubl.replaceAll('<cbc:', '<b:').replaceAll('</cbc:', '</b:').replace('xmlns:cbc=', 'xmlns:b=').replaceAll('<ubl:', '<u:').replaceAll('</ubl:', '</u:').replace('xmlns:ubl=', 'xmlns:u=')
    expect(leseWurzel(anders)).toMatchObject({ syntax: 'ubl-invoice', spezifikationsKennung: KENNUNG })
    const standard = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><CustomizationID xmlns="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">urn:cen.eu:en16931:2017</CustomizationID></Invoice>'
    expect(leseWurzel(standard)).toMatchObject({ syntax: 'ubl-invoice', spezifikationsKennung: 'urn:cen.eu:en16931:2017' })
    // CustomizationID im falschen Namensraum zählt nicht
    const falsch = '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><CustomizationID>urn:cen.eu:en16931:2017</CustomizationID></Invoice>'
    expect(leseWurzel(falsch).spezifikationsKennung).toBeNull()
  })
})
