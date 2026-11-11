/**
 * Kleiner PDF-Erzeuger für Testdateien: eine Seite mit Text und beliebig viele eingebettete
 * Dateien (Name-Tree /EmbeddedFiles und /AF wie bei ZUGFeRD/Factur-X). Kein PDF/A; die
 * Belegbrücke prüft PDF/A in Version 0.1 nicht. So entstehen lizenzklare Testdateien aus den
 * KoSIT-Beispielen, ohne fremde PDFs ins Repo zu nehmen.
 */
import { deflateSync } from 'node:zlib'

export interface PdfAnhang {
  name: string
  bytes: Uint8Array
  mimeTyp?: string
  /** AFRelationship; ZUGFeRD verlangt Alternative (EN 16931) bzw. Data */
  beziehung?: 'Alternative' | 'Data' | 'Source'
}

export interface PdfOptionen {
  text?: string
  anhaenge?: PdfAnhang[]
  /** Factur-X-Angaben im XMP (fx:DocumentFileName, fx:ConformanceLevel); ohne nur Titel */
  facturX?: { dateiname: string; profil: string }
  /** Eingebettete Dateien mit FlateDecode komprimieren (Standard: ja, wie in echten Rechnungen) */
  komprimieren?: boolean
}

const enc = new TextEncoder()

/** PDF-Literal-String; nur ASCII, Klammern und Backslash maskiert. */
function literal(text: string): string {
  return `(${text.replace(/[\\()]/g, (z) => `\\${z}`).replace(/[^\x20-\x7e]/g, '?')})`
}

export function erzeugePdf(optionen: PdfOptionen = {}): Uint8Array {
  const anhaenge = [...(optionen.anhaenge ?? [])].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const komprimieren = optionen.komprimieren ?? true
  const objekte: (Uint8Array | string)[] = []
  // Nummern: 1 Katalog, 2 Seiten, 3 Seite, 4 Inhalt, 5 Schrift, 6 XMP, danach je Anhang Filespec und Datei
  const filespecNr = (i: number) => 7 + i * 2
  const dateiNr = (i: number) => 8 + i * 2

  const namen = anhaenge.map((a, i) => `${literal(a.name)} ${filespecNr(i)} 0 R`).join(' ')
  const af = anhaenge.map((_, i) => `${filespecNr(i)} 0 R`).join(' ')
  objekte.push(
    `<< /Type /Catalog /Pages 2 0 R /Metadata 6 0 R${anhaenge.length ? ` /Names << /EmbeddedFiles << /Names [${namen}] >> >> /AF [${af}]` : ''} >>`,
  )
  objekte.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  objekte.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>')
  const inhalt = `BT /F1 14 Tf 72 770 Td ${literal(optionen.text ?? 'Testrechnung (Belegbruecke)')} Tj ET`
  objekte.push(enc.encode(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`))
  objekte.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const xmp = enc.encode(xmpPaket(optionen.text ?? 'Testrechnung', optionen.facturX))
  objekte.push(verbinde([enc.encode(`<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n`), xmp, enc.encode('\nendstream')]))
  anhaenge.forEach((a, i) => {
    objekte.push(
      `<< /Type /Filespec /F ${literal(a.name)} /UF ${literal(a.name)} /Desc (Rechnung) /AFRelationship /${a.beziehung ?? 'Alternative'} /EF << /F ${dateiNr(i)} 0 R /UF ${dateiNr(i)} 0 R >> >>`,
    )
    const daten = komprimieren ? new Uint8Array(deflateSync(a.bytes)) : a.bytes
    const subtyp = (a.mimeTyp ?? 'text/xml').replace('/', '#2F')
    const kopf = enc.encode(
      `<< /Type /EmbeddedFile /Subtype /${subtyp} /Params << /Size ${a.bytes.length} >> /Length ${daten.length}${komprimieren ? ' /Filter /FlateDecode' : ''} >>\nstream\n`,
    )
    objekte.push(verbinde([kopf, daten, enc.encode('\nendstream')]))
  })

  const teile: Uint8Array[] = [enc.encode('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')]
  let laenge = teile[0].length
  const offsets: number[] = []
  objekte.forEach((o, i) => {
    offsets.push(laenge)
    const rumpf = typeof o === 'string' ? enc.encode(o) : o
    const stueck = verbinde([enc.encode(`${i + 1} 0 obj\n`), rumpf, enc.encode('\nendobj\n')])
    teile.push(stueck)
    laenge += stueck.length
  })
  const xref = [`xref\n0 ${objekte.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  teile.push(enc.encode(`${xref}trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${laenge}\n%%EOF\n`))
  return verbinde(teile)
}

/** Minimales XMP-Paket; Mustang liest eingebettete Dateien nur aus PDFs mit Metadaten. */
function xmpPaket(titel: string, facturX?: { dateiname: string; profil: string }): string {
  const fx = facturX
    ? `<rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">` +
      `<fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>${facturX.dateiname}</fx:DocumentFileName>` +
      `<fx:Version>1.0</fx:Version><fx:ConformanceLevel>${facturX.profil}</fx:ConformanceLevel></rdf:Description>`
    : ''
  return (
    `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${titel.replace(/[<&]/g, '')}</rdf:li></rdf:Alt></dc:title></rdf:Description>` +
    `${fx}</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`
  )
}

function verbinde(teile: Uint8Array[]): Uint8Array {
  const gesamt = new Uint8Array(teile.reduce((s, t) => s + t.length, 0))
  let pos = 0
  for (const t of teile) {
    gesamt.set(t, pos)
    pos += t.length
  }
  return gesamt
}
