/**
 * PDF mit eingebettetem XML (R5): pdf.js liest nur die Anhänge; Seiten werden nicht gerendert,
 * Skripte nie ausgeführt. pdf.js 6 kennt keinen eval-Pfad mehr, die frühere Option
 * isEvalSupported entfällt. Läuft im Prüf-Worker mit Zeitlimit; das Original bleibt immer die
 * ganze PDF (UStAE 14b.1 Abs. 1 Satz 2).
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { GRENZEN } from '../fach/annahme.ts'
import { befund } from '../fach/befunde.ts'
import type { Befund } from '../fach/typen.ts'

/** Gesucht ohne Groß- und Kleinschreibung, in dieser Reihenfolge (Schritt 0.7 bestätigt). */
export const RECHNUNGSANHAENGE = ['factur-x.xml', 'xrechnung.xml', 'zugferd-invoice.xml'] as const

export type PdfErgebnis =
  | { art: 'mit-xml'; name: string; xml: Uint8Array; befunde: Befund[] }
  | { art: 'ohne-xml'; befunde: Befund[] }
  | { art: 'fehler'; befunde: Befund[] }

export async function leseRechnungsXml(bytes: Uint8Array): Promise<PdfErgebnis> {
  // pdf.js übernimmt den Puffer; deshalb eine Kopie
  const aufgabe = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    enableXfa: false,
    verbosity: 0,
  })
  let dokument
  try {
    dokument = await aufgabe.promise
  } catch (e) {
    await aufgabe.destroy()
    const name = (e as Error).name
    const text = name === 'PasswordException' ? 'Die PDF ist mit einem Passwort geschützt.' : 'Die PDF-Struktur ist ungültig.'
    return { art: 'fehler', befunde: [befund('PDF-LESEN', { zusatz: text, originaltext: String((e as Error).message ?? e).slice(0, 300) })] }
  }
  try {
    const anhaenge = await dokument.getAttachments()
    const liste = anhaenge ? [...anhaenge.entries()] : []
    const treffer = RECHNUNGSANHAENGE.flatMap((n) => liste.filter(([, a]) => a.filename.toLowerCase() === n))
    const befunde: Befund[] = []
    if (treffer.length === 0) {
      const andere = liste.filter(([, a]) => a.filename.toLowerCase().endsWith('.xml')).map(([, a]) => a.filename)
      if (andere.length) befunde.push(befund('PDF-XML-ANDERER-NAME', { zusatz: `Gefunden: ${andere.join(', ')}.` }))
      befunde.push(befund('PDF-OHNE-XML'))
      return { art: 'ohne-xml', befunde }
    }
    if (treffer.length > 1) befunde.push(befund('PDF-XML-MEHRERE', { zusatz: `Gefunden: ${treffer.map(([, a]) => a.filename).join(', ')}.` }))
    const [id, anhang] = treffer[0]
    const inhalt = anhang.content ?? (await dokument.getAttachmentContent(id))
    if (!inhalt || inhalt.length === 0) {
      return { art: 'fehler', befunde: [befund('PDF-LESEN', { zusatz: `Der Anhang ${anhang.filename} ist leer oder nicht lesbar.` })] }
    }
    if (inhalt.length > GRENZEN.xml) {
      return { art: 'fehler', befunde: [befund('PDF-XML-ZU-GROSS', { zusatz: `Größe: ${Math.round(inhalt.length / 1024 / 1024)} MB.` })] }
    }
    return { art: 'mit-xml', name: anhang.filename, xml: new Uint8Array(inhalt), befunde }
  } catch (e) {
    return { art: 'fehler', befunde: [befund('PDF-LESEN', { originaltext: String((e as Error).message ?? e).slice(0, 300) })] }
  } finally {
    await aufgabe.destroy()
  }
}
