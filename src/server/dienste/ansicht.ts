/**
 * KoSIT-Ansicht als HTML (im Worker erzeugt, unter cache/ansicht/<xml-sha256>.html zwischengespeichert,
 * nicht archivrelevant) und der jeweils letzte Prüfbericht eines Belegs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Beleg } from '../../fach/typen.ts'
import { dekodiereXml } from '../../fach/zeichensatz.ts'
import type { Dienste } from './kontext.ts'

/** HTML der Ansicht oder null, wenn der Beleg kein lesbares XML hat. */
export async function ansichtHtml(d: Dienste, b: Beleg): Promise<string | null> {
  if (!b.format.syntax || !b.format.xmlSha256) return null
  const cache = d.ablage.absolut(`cache/ansicht/${b.format.xmlSha256}.html`)
  if (existsSync(cache)) return readFileSync(cache, 'utf8')
  let xml = await d.ablage.lies(b.original.speicherpfad)
  if (b.format.container === 'pdf-mit-xml') {
    const pdf = await d.pruefer.pdf(xml)
    if (pdf.art !== 'mit-xml') return null
    xml = pdf.xml
  }
  const text = dekodiereXml(xml)
  if (!text.ok) return null
  const html = await d.pruefer.ansicht(text.text, b.format.syntax)
  mkdirSync(dirname(cache), { recursive: true })
  writeFileSync(cache, html)
  return html
}

/** Alle Prüfberichte eines Belegs in der Reihenfolge ihrer Nummer (1, 2, … 10). */
export function berichtsPfade(d: Dienste, belegId: string): string[] {
  return d.db
    .alle<{ pfad: string }>("SELECT pfad FROM dateien WHERE art = 'bericht' AND pfad LIKE ?", [`berichte/${belegId}/%`])
    .map((z) => z.pfad)
    .sort((a, b) => Number(/(\d+)\.json$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.json$/.exec(b)?.[1] ?? 0))
}

export function letzterBericht(d: Dienste, belegId: string): string | null {
  return berichtsPfade(d, belegId).at(-1) ?? null
}
