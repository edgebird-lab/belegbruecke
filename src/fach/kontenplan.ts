/**
 * Kontenplan (Schritt 4.1): Sachkonten von Hand oder als CSV. Erwartet je Zeile Nummer und
 * Bezeichnung, optional „Automatik“ (ja/nein); Trennzeichen `;`, `,` oder Tabulator, Text in
 * Anführungszeichen erlaubt, Kopfzeile wird erkannt. Rein, ohne Node-APIs.
 */
import type { Sachkonto } from './typen.ts'

export interface Kontenimport {
  konten: Sachkonto[]
  /** Fehler je Zeile in Klartext; Zeilen mit Fehler werden nicht übernommen */
  fehler: string[]
}

const JA = new Set(['ja', 'j', 'x', '1', 'true', 'wahr', 'am', 'automatik', 'automatikkonto', 'yes'])
const NEIN = new Set(['', 'nein', 'n', '0', 'false', 'falsch', 'no', '-'])

/** Eine CSV-Zeile in Felder zerlegen (Anführungszeichen, verdoppelte Anführungszeichen). */
export function csvFelder(zeile: string, trenner: string): string[] {
  const felder: string[] = []
  let feld = ''
  let inText = false
  for (let i = 0; i < zeile.length; i++) {
    const z = zeile[i]
    if (inText) {
      if (z === '"' && zeile[i + 1] === '"') {
        feld += '"'
        i++
      } else if (z === '"') inText = false
      else feld += z
    } else if (z === '"') inText = true
    else if (z === trenner) {
      felder.push(feld)
      feld = ''
    } else feld += z
  }
  felder.push(feld)
  return felder.map((f) => f.trim())
}

function trennzeichen(zeile: string): string {
  if (zeile.includes(';')) return ';'
  if (zeile.includes('\t')) return '\t'
  return ','
}

/** Prüft eine Kontonummer gegen die Sachkontenlänge; Fehler in Klartext oder null. */
export function pruefeSachkonto(nummer: number, sachkontenlaenge: number): string | null {
  if (!Number.isSafeInteger(nummer) || nummer <= 0) return 'Die Kontonummer muss eine positive ganze Zahl sein.'
  if (String(nummer).length > sachkontenlaenge) return `Die Kontonummer ${nummer} hat mehr als ${sachkontenlaenge} Stellen (Sachkontenlänge).`
  return null
}

export function leseKontenCsv(text: string, sachkontenlaenge: number): Kontenimport {
  const konten = new Map<number, Sachkonto>()
  const fehler: string[] = []
  const zeilen = text.replace(/^﻿/, '').split(/\r\n|\n|\r/)
  for (const [i, roh] of zeilen.entries()) {
    if (!roh.trim()) continue
    const nr = i + 1
    const [nummerText = '', bezeichnung = '', automatik = ''] = csvFelder(roh, trennzeichen(roh))
    // Kopfzeile: erste Spalte ist keine Zahl und es ist die erste nicht leere Zeile
    if (!/^\d+$/.test(nummerText) && konten.size === 0 && fehler.length === 0 && /konto|nummer|nr/i.test(nummerText)) continue
    if (!/^\d+$/.test(nummerText)) {
      fehler.push(`Zeile ${nr}: „${nummerText}“ ist keine Kontonummer.`)
      continue
    }
    const nummer = Number(nummerText)
    const kontofehler = pruefeSachkonto(nummer, sachkontenlaenge)
    if (kontofehler) {
      fehler.push(`Zeile ${nr}: ${kontofehler}`)
      continue
    }
    if (!bezeichnung) {
      fehler.push(`Zeile ${nr}: Die Bezeichnung zu Konto ${nummer} fehlt.`)
      continue
    }
    const a = automatik.toLowerCase()
    if (!JA.has(a) && !NEIN.has(a)) {
      fehler.push(`Zeile ${nr}: „${automatik}“ ist kein Ja oder Nein für „Automatik“.`)
      continue
    }
    if (konten.has(nummer)) {
      fehler.push(`Zeile ${nr}: Konto ${nummer} steht doppelt in der Datei; die erste Zeile gilt.`)
      continue
    }
    konten.set(nummer, { nummer, bezeichnung: bezeichnung.slice(0, 100), automatikkonto: JA.has(a), aktiv: true })
  }
  return { konten: [...konten.values()].sort((a, b) => a.nummer - b.nummer), fehler }
}

/** Sucht Sachkonten nach Nummer oder Bezeichnung; zuletzt genutzte zuerst (B5). */
export function sucheSachkonten(konten: readonly Sachkonto[], suche: string, zuletzt: readonly number[] = []): Sachkonto[] {
  const s = suche.trim().toLowerCase()
  const rang = (k: Sachkonto) => {
    const i = zuletzt.indexOf(k.nummer)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  return konten
    .filter((k) => k.aktiv && (!s || String(k.nummer).startsWith(s) || k.bezeichnung.toLowerCase().includes(s)))
    .sort((a, b) => rang(a) - rang(b) || a.nummer - b.nummer)
}
