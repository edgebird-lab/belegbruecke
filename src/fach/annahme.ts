/**
 * Annahme einer Datei (R1): Dateiart nach Inhalt, nicht nach Endung, und Größengrenzen.
 * 1 MB = 1.048.576 Byte.
 */

export type Dateiart = 'xml' | 'pdf' | 'jpeg' | 'png'

const MB = 1024 * 1024

export const GRENZEN = {
  xml: 20 * MB,
  pdf: 30 * MB,
  bild: 10 * MB,
  email: 50 * MB,
  anhaengeJeEmail: 20,
} as const

export const MIME_TYP: Record<Dateiart, 'application/xml' | 'application/pdf' | 'image/jpeg' | 'image/png'> = {
  xml: 'application/xml',
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export const ENDUNG: Record<Dateiart, string> = { xml: 'xml', pdf: 'pdf', jpeg: 'jpg', png: 'png' }

function beginntMit(bytes: Uint8Array, muster: readonly number[], ab = 0): boolean {
  return bytes.length >= ab + muster.length && muster.every((b, i) => bytes[ab + i] === b)
}

const LEERRAUM = new Set([0x20, 0x09, 0x0d, 0x0a])

/** Erstes Zeichen nach optionaler BOM und Leerraum ist `<` (UTF-8, UTF-16 LE/BE, jeweils mit oder ohne BOM). */
function istXml(bytes: Uint8Array): boolean {
  let pos = 0
  let breite = 1
  let le = true
  if (beginntMit(bytes, [0xef, 0xbb, 0xbf])) pos = 3
  else if (beginntMit(bytes, [0xff, 0xfe])) [pos, breite, le] = [2, 2, true]
  else if (beginntMit(bytes, [0xfe, 0xff])) [pos, breite, le] = [2, 2, false]
  else if (beginntMit(bytes, [0x3c, 0x00])) [breite, le] = [2, true]
  else if (beginntMit(bytes, [0x00, 0x3c])) [breite, le] = [2, false]
  while (pos + breite <= bytes.length) {
    const zeichen = breite === 1 ? bytes[pos] : le ? bytes[pos] | (bytes[pos + 1] << 8) : (bytes[pos] << 8) | bytes[pos + 1]
    if (zeichen === 0x3c) return true
    if (!LEERRAUM.has(zeichen)) return false
    pos += breite
  }
  return false
}

export function erkenneDateiart(bytes: Uint8Array): Dateiart | null {
  if (beginntMit(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf' // %PDF-
  if (beginntMit(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (beginntMit(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png'
  if (istXml(bytes)) return 'xml'
  return null
}

export type Annahme =
  | { ok: true; art: Dateiart; mimeTyp: (typeof MIME_TYP)[Dateiart] }
  | { ok: false; code: 'DATEI-LEER' | 'DATEI-TYP' | 'DATEI-GROESSE'; text: string }

function grenzeFuer(art: Dateiart): number {
  return art === 'xml' ? GRENZEN.xml : art === 'pdf' ? GRENZEN.pdf : GRENZEN.bild
}

function mb(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10} MB`.replace('.', ',')
}

/** R1 Punkte 1 und 2: Art nach Inhalt bestimmen, Grenzen einhalten. */
export function pruefeAnnahme(bytes: Uint8Array): Annahme {
  if (bytes.length === 0) return { ok: false, code: 'DATEI-LEER', text: 'Die Datei ist leer.' }
  const art = erkenneDateiart(bytes)
  if (!art) return { ok: false, code: 'DATEI-TYP', text: 'Dateityp nicht unterstützt. Angenommen werden XML, PDF sowie JPEG und PNG für die Erfassung von Hand.' }
  const grenze = grenzeFuer(art)
  if (bytes.length > grenze) {
    return { ok: false, code: 'DATEI-GROESSE', text: `Die Datei ist zu groß (${mb(bytes.length)}); erlaubt sind für ${art === 'jpeg' || art === 'png' ? 'Bilder' : art.toUpperCase()} höchstens ${mb(grenze)}.` }
  }
  return { ok: true, art, mimeTyp: MIME_TYP[art] }
}

/** Dateinamen nur für die Anzeige: ohne Pfad, ohne Steuerzeichen, höchstens 200 Zeichen. */
export function bereinigeDateiname(name: string): string {
  const ohnePfad = name.split(/[\\/]/).pop() ?? ''
  // oxlint-disable-next-line no-control-regex
  const sauber = ohnePfad.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim()
  return (sauber || 'unbenannt').slice(0, 200)
}
