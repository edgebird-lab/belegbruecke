/**
 * Zeichensatz von XML-Dateien (R3) und XML-Schutz (R2).
 *
 * Erkennung über BOM (UTF-8, UTF-16 LE/BE) oder das `encoding` der XML-Deklaration, sonst UTF-8.
 * Unterstützt: UTF-8, UTF-16, ISO-8859-1, Windows-1252 (US-ASCII als Teilmenge von UTF-8).
 * TextDecoder behandelt ISO-8859-1 nach WHATWG wie Windows-1252, und `fatal` greift bei diesen
 * Einbyte-Zeichensätzen nie; für Rechnungen ist das unkritisch.
 */

export type Dekodierung =
  | { ok: true; text: string; zeichensatz: string }
  | { ok: false; zeichensatz: string | null; grund: string }

const ALIASE: Record<string, string> = {
  'utf-8': 'utf-8',
  utf8: 'utf-8',
  'us-ascii': 'utf-8',
  ascii: 'utf-8',
  'utf-16': 'utf-16',
  'utf-16le': 'utf-16le',
  'utf-16be': 'utf-16be',
  'iso-8859-1': 'iso-8859-1',
  'iso_8859-1': 'iso-8859-1',
  'iso8859-1': 'iso-8859-1',
  latin1: 'iso-8859-1',
  l1: 'iso-8859-1',
  'windows-1252': 'windows-1252',
  cp1252: 'windows-1252',
}

/** Liest `encoding` aus der XML-Deklaration im ASCII-kompatiblen Anfang der Datei. */
function deklarierterZeichensatz(bytes: Uint8Array): string | null {
  let kopf = ''
  for (let i = 0; i < Math.min(bytes.length, 256); i++) kopf += String.fromCharCode(bytes[i])
  const t = /^\s*<\?xml\b[^>]*?\bencoding\s*=\s*(["'])([A-Za-z][A-Za-z0-9._-]*)\1/.exec(kopf)
  return t ? t[2].toLowerCase() : null
}

export function dekodiereXml(bytes: Uint8Array): Dekodierung {
  let label: string
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) label = 'utf-8'
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) label = 'utf-16le'
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be'
  else if (bytes[0] === 0x3c && bytes[1] === 0x00) label = 'utf-16le'
  else if (bytes[0] === 0x00 && bytes[1] === 0x3c) label = 'utf-16be'
  else {
    const deklariert = deklarierterZeichensatz(bytes)
    if (deklariert === null) label = 'utf-8'
    else {
      const bekannt = ALIASE[deklariert]
      if (!bekannt) return { ok: false, zeichensatz: deklariert, grund: `Zeichensatz „${deklariert}“ wird nicht unterstützt.` }
      // UTF-16 ohne BOM und ohne erkennbares Bytemuster ist nicht lesbar
      if (bekannt === 'utf-16') return { ok: false, zeichensatz: deklariert, grund: 'UTF-16 ohne Byte-Order-Mark.' }
      label = bekannt
    }
  }
  try {
    const text = new TextDecoder(label, { fatal: true }).decode(bytes)
    return { ok: true, text, zeichensatz: label }
  } catch {
    return { ok: false, zeichensatz: label, grund: `Die Datei ist kein gültiges ${label.toUpperCase()}.` }
  }
}

/**
 * Text für die Prüfwerkzeuge: xmllint liest nur UTF-8. Die Deklaration wird auf UTF-8 gesetzt,
 * die Zeilen bleiben gleich, damit Zeilenangaben von XSD-Fehlern zum Original passen.
 */
export function alsUtf8Deklaration(text: string): string {
  return text.replace(/^(\s*<\?xml\b[^>]*?\bencoding\s*=\s*)(["'])[^"']*\2/, '$1$2UTF-8$2')
}

/**
 * R2: Vor jedem Parser wird geprüft, ob der Text eine DTD oder Entity-Deklaration enthält.
 * E-Rechnungen brauchen keine; die Regel verhindert XXE und Entity-Expansion.
 */
export function enthaeltDtd(text: string): boolean {
  return /<!(DOCTYPE|ENTITY)/i.test(text)
}
