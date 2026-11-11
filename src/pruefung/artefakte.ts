/**
 * Zugriff auf die Prüfartefakte in vendor/ (KoSIT-Konfiguration, Visualisierung, SEF).
 * Der Ordner ist über BB_VENDOR einstellbar (z. B. für ein späteres Windows-Programm).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const VENDOR = process.env.BB_VENDOR ?? fileURLToPath(new URL('../../vendor/', import.meta.url))
export const KONFIGURATION = join(VENDOR, 'konfiguration')
export const VISUALISIERUNG = join(VENDOR, 'visualisierung')
export const SEF = join(VENDOR, 'sef')

export class ArtefaktFehler extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'ArtefaktFehler'
  }
}

function lies(pfad: string): Buffer {
  if (!existsSync(pfad)) throw new ArtefaktFehler(`Prüfartefakt fehlt: ${pfad}. Erst: npm run vorbereiten`)
  return readFileSync(pfad)
}

export function liesKonfiguration(rel: string): string {
  return lies(join(KONFIGURATION, rel)).toString('utf8')
}

const sefCache = new Map<string, unknown>()

/** SEF-Datei laden und im Prozess behalten (je Worker einmal). */
export function sef(name: string): unknown {
  let s = sefCache.get(name)
  if (!s) {
    s = JSON.parse(lies(join(SEF, `${name}.sef.json`)).toString('utf8'))
    sefCache.set(name, s)
  }
  return s
}

/** Basis-URI der Original-XSLT der Visualisierung, damit unparsed-text() und doc() ihre Dateien finden. */
export function visualisierungsBasis(datei: string): string {
  return pathToFileURL(join(VISUALISIERUNG, 'xsl', datei)).href
}

export interface Schemadatei {
  fileName: string
  contents: Uint8Array
}

const xsdCache = new Map<string, Schemadatei[]>()

/** Alle XSD eines Ordners der Konfiguration (mit Unterordnern), Namen relativ zum Ordner. */
export function xsdDateien(ordnerRel: string): Schemadatei[] {
  let liste = xsdCache.get(ordnerRel)
  if (!liste) {
    const ordner = join(KONFIGURATION, ordnerRel)
    if (!existsSync(ordner)) throw new ArtefaktFehler(`Prüfartefakt fehlt: ${ordner}. Erst: npm run vorbereiten`)
    liste = readdirSync(ordner, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.xsd'))
      .map((e) => ({
        fileName: relative(ordner, join(e.parentPath, e.name)).split(/[\\/]/).join('/'),
        contents: new Uint8Array(readFileSync(join(e.parentPath, e.name))),
      }))
    xsdCache.set(ordnerRel, liste)
  }
  return liste
}

export interface Artefaktversionen {
  konfiguration: string
  enSchematron: string
  xrSchematron: string
  visualisierung: string
}

/** Versionen für Prüfbericht und Statusanzeige; null, wenn die Artefakte fehlen. */
export function artefaktversionen(): Artefaktversionen | null {
  const marke = join(KONFIGURATION, '.artefakt.json')
  const markeVis = join(VISUALISIERUNG, '.artefakt.json')
  if (!existsSync(marke) || !existsSync(markeVis) || !existsSync(SEF)) return null
  const scenarios = liesKonfiguration('scenarios.xml')
  const name = /<name>([^<]*)<\/name>/.exec(scenarios)?.[1]?.trim() ?? 'unbekannt'
  const datum = /<date>([^<]*)<\/date>/.exec(scenarios)?.[1]?.trim() ?? ''
  const cen = /CEN Schematron rules of urn:cen\.eu:en16931:2017\s+in version ([\d.]+)/.exec(scenarios)?.[1] ?? 'unbekannt'
  const xr = /Schematron Rules version ([\d.]+)/.exec(scenarios)?.[1] ?? 'unbekannt'
  const vis = JSON.parse(readFileSync(markeVis, 'utf8')) as { version: string }
  return {
    konfiguration: `${name} (${datum})`,
    enSchematron: `CEN EN 16931 ${cen}`,
    xrSchematron: `XRechnung-Schematron ${xr}`,
    visualisierung: `XRechnung-Visualisierung ${vis.version}`,
  }
}
