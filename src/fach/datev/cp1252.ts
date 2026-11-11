/**
 * Windows-1252 ohne BOM für die EXTF-Datei (R19). Eigene Tabelle statt iconv-lite: 0x00 bis 0x7F
 * und 0xA0 bis 0xFF wie Unicode, dazu 27 Zeichen in 0x80 bis 0x9F. Nicht darstellbare Zeichen
 * werden zu "_" und als Hinweis gemeldet. Läuft auch im Browser.
 */

/** Unicode → Byte für 0x80 bis 0x9F; 0x81, 0x8D, 0x8F, 0x90 und 0x9D sind in Windows-1252 nicht belegt. */
const SONDERZEICHEN = new Map<number, number>([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
])

const ERSATZ = 0x5f // "_"

export interface Kodiert {
  bytes: Uint8Array
  /** nicht darstellbare Zeichen, je einmal in der Reihenfolge des Auftretens */
  ersetzt: string[]
}

/** Text (vorher NFC-normalisiert) als Windows-1252. */
export function kodiereWindows1252(text: string): Kodiert {
  const bytes: number[] = []
  const ersetzt = new Set<string>()
  for (const zeichen of text.normalize('NFC')) {
    const cp = zeichen.codePointAt(0)!
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) bytes.push(cp)
    else {
      const b = SONDERZEICHEN.get(cp)
      if (b !== undefined) bytes.push(b)
      else {
        bytes.push(ERSATZ)
        ersetzt.add(zeichen)
      }
    }
  }
  return { bytes: Uint8Array.from(bytes), ersetzt: [...ersetzt] }
}

/** Gegenrichtung für Tests und die Vorschau in der Oberfläche. */
export function dekodiereWindows1252(bytes: Uint8Array): string {
  const rueck = new Map([...SONDERZEICHEN].map(([cp, b]) => [b, cp]))
  let text = ''
  for (const b of bytes) text += String.fromCodePoint(b >= 0x80 && b <= 0x9f ? (rueck.get(b) ?? 0xfffd) : b)
  return text
}
