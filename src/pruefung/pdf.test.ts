import { describe, expect, it } from 'vitest'
import { kosit, referenz, text, zugferd } from '../testhilfen/dateien.ts'
import { erzeugePdf } from '../testhilfen/pdf.ts'
import { lokalerAusfuehrer, verarbeiteDatei } from './eingang.ts'
import { leseRechnungsXml } from './pdf.ts'

const MUSTANG = referenz<{ extraktion: Record<string, { xmlSha256: string | null }> }>('mustang-2.26.0.json').extraktion

describe('ZUGFeRD und Factur-X (R5)', () => {
  it('T-Z1: EN 16931 als pdf-mit-xml, XML-Hash gleich der Mustang-Extraktion', async () => {
    const r = await verarbeiteDatei(zugferd('zf-en16931.pdf'), 'pdf', lokalerAusfuehrer)
    expect(r.format).toMatchObject({ belegart: 'e-rechnung', container: 'pdf-mit-xml', eingebettetAls: 'factur-x.xml', syntax: 'cii', profil: 'en16931' })
    expect(r.format.xmlSha256).toBe(MUSTANG['zf-en16931.pdf'].xmlSha256)
    expect(r.szenario).toBe('EN16931 (CII)')
    expect(r.angenommen).toBe(true)
  })

  it('XRECHNUNG in der PDF: eingebettetes XML ist byte-gleich mit der KoSIT-Datei', async () => {
    const r = await verarbeiteDatei(zugferd('zf-xrechnung.pdf'), 'pdf', lokalerAusfuehrer)
    expect(r.format).toMatchObject({ container: 'pdf-mit-xml', eingebettetAls: 'xrechnung.xml', profil: 'xrechnung-3.0' })
    expect(r.format.xmlSha256).toBe(MUSTANG['zf-xrechnung.pdf'].xmlSha256)
    const { createHash } = await import('node:crypto')
    expect(r.format.xmlSha256).toBe(createHash('sha256').update(kosit('standard/01.01a-INVOICE_uncefact.xml')).digest('hex'))
    expect(r.szenario).toBe('EN16931 XRechnung (CII)')
    expect(r.angenommen).toBe(true)
  })

  it('BASIC und EXTENDED laufen über die eigenen Szenarien', async () => {
    const basic = await verarbeiteDatei(zugferd('zf-basic.pdf'), 'pdf', lokalerAusfuehrer)
    expect(basic).toMatchObject({ szenario: 'Factur-X BASIC (CII)', angenommen: true, eingeschraenktGeprueft: false })
    const ext = await verarbeiteDatei(zugferd('zf-extended.pdf'), 'pdf', lokalerAusfuehrer)
    expect(ext).toMatchObject({ szenario: 'Factur-X EXTENDED (CII)', angenommen: true, eingeschraenktGeprueft: true })
    expect(ext.befunde.map((b) => b.regelId)).toContain('PRUEFUNG-EINGESCHRAENKT')
  })

  it('T-Z2: MINIMUM ist eine sonstige Rechnung mit Verweis auf UStAE 14.1 Abs. 14', async () => {
    const r = await verarbeiteDatei(zugferd('zf-minimum.pdf'), 'pdf', lokalerAusfuehrer)
    expect(r.format).toMatchObject({ belegart: 'sonstige-rechnung', container: 'pdf-mit-xml', profil: 'zugferd-minimum' })
    expect(r.format.grund).toContain('UStAE 14.1 Abs. 14')
    expect(r.angenommen).toBe(false)
    expect(r.szenario).toBeNull()
  })

  it('T-Z3: PDF ohne Anhang führt zur Erfassung von Hand', async () => {
    const r = await verarbeiteDatei(zugferd('pdf-ohne-xml.pdf'), 'pdf', lokalerAusfuehrer)
    expect(r.format).toMatchObject({ belegart: 'sonstige-rechnung', container: 'pdf-ohne-xml', xmlSha256: null })
    expect(r.befunde.map((b) => b.regelId)).toEqual(['PDF-OHNE-XML'])
  })

  it('T-Z4: beschädigte PDF ergibt PDF-LESEN ohne Absturz', async () => {
    const kaputt = new Uint8Array([...text('%PDF-1.7\n'), ...Array.from({ length: 2000 }, (_, i) => (i * 37) % 251)])
    const start = performance.now()
    const r = await leseRechnungsXml(kaputt)
    expect(performance.now() - start).toBeLessThan(20_000)
    expect(r.art).toBe('fehler')
    expect(r.befunde[0]).toMatchObject({ regelId: 'PDF-LESEN', stufe: 'fehler' })
    // abgeschnittene echte PDF: entweder lesbar ohne Anhang oder PDF-LESEN, nie ein Absturz
    const halb = zugferd('zf-en16931.pdf').slice(0, 600)
    const h = await leseRechnungsXml(halb)
    expect(['fehler', 'ohne-xml']).toContain(h.art)
  })

  it('T-Z5: eingebettetes XML über 20 MB wird abgelehnt', async () => {
    const gross = new Uint8Array(21 * 1024 * 1024).fill(0x20)
    gross.set(text('<a>'), 0)
    const pdf = erzeugePdf({ anhaenge: [{ name: 'factur-x.xml', bytes: gross }] })
    expect(pdf.length).toBeLessThan(1024 * 1024) // stark komprimiert
    const r = await leseRechnungsXml(pdf)
    expect(r.art).toBe('fehler')
    expect(r.befunde[0].regelId).toBe('PDF-XML-ZU-GROSS')
    expect(r.befunde[0].klartext).toContain('20 MB')
  })

  it('T-Z6: XML-Anhang mit anderem Namen ergibt pdf-ohne-xml und einen Hinweis', async () => {
    const pdf = erzeugePdf({ anhaenge: [{ name: 'rechnung.xml', bytes: kosit('standard/01.01a-INVOICE_uncefact.xml') }] })
    const r = await verarbeiteDatei(pdf, 'pdf', lokalerAusfuehrer)
    expect(r.format.container).toBe('pdf-ohne-xml')
    expect(r.befunde.map((b) => [b.regelId, b.stufe])).toEqual([
      ['PDF-XML-ANDERER-NAME', 'hinweis'],
      ['PDF-OHNE-XML', 'warnung'],
    ])
    expect(r.befunde[0].klartext).toContain('unüblichem Namen')
  })

  it('findet Namen ohne Rücksicht auf Groß- und Kleinschreibung und nimmt bei mehreren den ersten', async () => {
    const xml = kosit('standard/01.01a-INVOICE_uncefact.xml')
    const pdf = erzeugePdf({
      anhaenge: [
        { name: 'ZUGFeRD-invoice.xml', bytes: text('<a/>') },
        { name: 'Factur-X.XML', bytes: xml },
      ],
    })
    const r = await leseRechnungsXml(pdf)
    expect(r.art).toBe('mit-xml')
    if (r.art === 'mit-xml') {
      expect(r.name).toBe('Factur-X.XML')
      expect(r.xml).toEqual(xml)
      expect(r.befunde.map((b) => b.regelId)).toEqual(['PDF-XML-MEHRERE'])
    }
  })

  it('liest unkomprimierte Anhänge ebenso', async () => {
    const xml = kosit('standard/01.01a-INVOICE_uncefact.xml')
    const r = await leseRechnungsXml(erzeugePdf({ anhaenge: [{ name: 'factur-x.xml', bytes: xml }], komprimieren: false }))
    expect(r.art === 'mit-xml' && r.xml).toEqual(xml)
  })

  it('Bilder gehen ohne Prüfung in die Erfassung von Hand', async () => {
    const r = await verarbeiteDatei(new Uint8Array([0xff, 0xd8, 0xff]), 'jpeg', lokalerAusfuehrer)
    expect(r.format).toMatchObject({ belegart: 'sonstige-rechnung', container: 'bild' })
    expect(r.befunde).toEqual([])
  })
})
