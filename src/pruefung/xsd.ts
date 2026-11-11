/**
 * XSD-Prüfung mit xmllint-wasm (libxml2 als WebAssembly, R6 Punkt 2). Alle importierten XSD
 * liegen im virtuellen Dateisystem mit den Unterordnern der Konfiguration.
 */
import { memoryPages, validateXML } from 'xmllint-wasm'
import { xsdDateien } from './artefakte.ts'

export interface XsdMeldung {
  zeile: number | null
  spalte: number | null
  text: string
}

export interface XsdErgebnis {
  gueltig: boolean
  meldungen: XsdMeldung[]
}

/** Ordner des XSD-Satzes und Haupt-XSD relativ dazu, aus dem Pfad im Szenario. */
function zerlege(xsdPfad: string): { ordner: string; haupt: string } {
  const t = /^(resources\/(?:ubl\/2\.1|cii\/16b)\/xsd)\/(.+)$/.exec(xsdPfad)
  if (!t) throw new Error(`Unbekannter XSD-Pfad: ${xsdPfad}`)
  return { ordner: t[1], haupt: t[2] }
}

/**
 * Spalte zur gemeldeten Zeile: libxml2 nennt nur die Zeile. Gesucht wird der Beginn des Elements,
 * das die Meldung nennt („Element '{ns}Name'“); ohne Treffer bleibt die Spalte leer.
 */
export function spalteZurMeldung(zeilen: string[], zeile: number | null, text: string): number | null {
  if (zeile === null || zeile < 1 || zeile > zeilen.length) return null
  const element = /Element '(?:\{[^}]*\})?([^']+)'/.exec(text)?.[1]
  if (!element) return null
  const inhalt = zeilen[zeile - 1]
  const t = new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${element.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s/>])`).exec(inhalt)
  return t ? t.index + 1 : null
}

export async function pruefeXsd(xmlUtf8: string, xsdPfad: string): Promise<XsdErgebnis> {
  const { ordner, haupt } = zerlege(xsdPfad)
  const dateien = xsdDateien(ordner)
  const schema = dateien.find((d) => d.fileName === haupt)
  if (!schema) throw new Error(`Haupt-XSD fehlt: ${xsdPfad}`)
  const ergebnis = await validateXML({
    xml: [{ fileName: 'rechnung.xml', contents: xmlUtf8 }],
    schema: [schema],
    preload: dateien.filter((d) => d !== schema),
    maxMemoryPages: 512 * memoryPages.MiB,
  })
  if (ergebnis.valid) return { gueltig: true, meldungen: [] }
  const zeilen = xmlUtf8.split(/\r?\n/)
  // „rechnung.xml fails to validate“ ist keine eigene Meldung
  const meldungen = ergebnis.errors.filter((f) => !/fails to validate$/.test(f.message.trim())).map((f) => {
    const zeile = f.loc?.lineNumber ?? null
    const text = f.message.replace(/^Schemas validity error : /, '').trim()
    return { zeile, spalte: spalteZurMeldung(zeilen, zeile, text), text }
  })
  return { gueltig: false, meldungen: meldungen.length ? meldungen : [{ zeile: null, spalte: null, text: ergebnis.rawOutput.trim() || 'XSD-Prüfung fehlgeschlagen' }] }
}
