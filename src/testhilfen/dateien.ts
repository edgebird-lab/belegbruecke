/** Zugriff auf Testdateien: KoSIT-Testsuite (per Skript geladen), Mutationen, ZUGFeRD-Testdateien. */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const WURZEL = fileURLToPath(new URL('../..', import.meta.url))
export const KOSIT = join(WURZEL, 'testdaten', 'kosit', 'instances')

function sicherstellen(pfad: string): string {
  if (!existsSync(pfad)) throw new Error(`Testdatei fehlt: ${pfad}. Erst: npm run vorbereiten`)
  return pfad
}

/** Bytes einer Datei relativ zu testdaten/kosit/instances, z. B. "standard/01.01a-INVOICE_ubl.xml". */
export function kosit(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(sicherstellen(join(KOSIT, rel))))
}

export function kositText(rel: string): string {
  return new TextDecoder().decode(kosit(rel))
}

/** Alle 86 positiven Testdateien als relative Pfade mit "/". */
export function alleKosit(): string[] {
  sicherstellen(KOSIT)
  return readdirSync(KOSIT, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.xml'))
    .map((e) => relative(KOSIT, join(e.parentPath, e.name)).split(/[\\/]/).join('/'))
    .sort()
}

export function mutation(name: string): Uint8Array {
  const datei = readdirSync(join(WURZEL, 'testdaten', 'mutationen')).find((d) => d.startsWith(`${name}-`))
  if (!datei) throw new Error(`Mutation ${name} fehlt`)
  return new Uint8Array(readFileSync(join(WURZEL, 'testdaten', 'mutationen', datei)))
}

export function zugferd(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(WURZEL, 'testdaten', 'zugferd', name)))
}

export function referenz<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(join(WURZEL, 'testdaten', 'referenz', name), 'utf8')) as T
}

export const text = (s: string): Uint8Array => new TextEncoder().encode(s)
