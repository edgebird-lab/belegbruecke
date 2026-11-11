/**
 * Belegpaket der Monatsübergabe (R20) als ZIP mit fflate: Originale bytegleich zum Archiv, KoSIT-Ansicht
 * der XML-Rechnungen, Prüfberichte und `index.csv` (UTF-8 mit BOM, `;`). Rein, läuft auch im Browser.
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import { formatDatum } from '../anzeige.ts'
import { belegnummer } from '../dubletten.ts'
import type { Cent, Datum, Sha256, Uuid } from '../typen.ts'
import { belegfeld1 } from './extf.ts'

export interface Paketbeleg {
  laufnummer: number
  belegId: Uuid
  lieferant: string
  rechnungsnummer: string
  rechnungsdatum: Datum
  bruttoCent: Cent
  /** Kreditorenkonto; leer bei „nur Beleg“ */
  konto: number | null
  /** Sachkonten der Buchungszeilen */
  gegenkonten: number[]
  sha256: Sha256
  dateiname: string
  endung: 'xml' | 'pdf' | 'jpg' | 'png'
  original: Uint8Array
  /** KoSIT-Ansicht als HTML, nur bei Rechnungen mit lesbarem XML */
  ansicht: string | null
  /** Prüfbericht (JSON-Text) */
  pruefbericht: string | null
}

export function belegpaketName(monat: string, nachtragNr: number): string {
  return `Belege_${monat}${nachtragNr > 0 ? `_N${nachtragNr}` : ''}.zip`
}

/** Dateiname im Paket: Laufnummer und Belegfeld 1, z. B. "B-00001_123456XX". */
export function paketname(b: Pick<Paketbeleg, 'laufnummer' | 'rechnungsnummer'>): string {
  const bf = belegfeld1(b.rechnungsnummer)
  return bf ? `${belegnummer(b.laufnummer)}_${bf}` : belegnummer(b.laufnummer)
}

function csvText(wert: string): string {
  return `"${wert.replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""')}"`
}

function csvBetrag(cent: Cent): string {
  const negativ = cent < 0
  const b = Math.abs(cent)
  return `${negativ ? '-' : ''}${Math.floor(b / 100)},${String(b % 100).padStart(2, '0')}`
}

export const INDEX_SPALTEN = ['Laufnummer', 'Beleg-ID', 'Lieferant', 'Rechnungsnummer', 'Rechnungsdatum', 'Brutto', 'Konto', 'Gegenkonto', 'SHA-256', 'Dateiname'] as const

/** index.csv: UTF-8 mit BOM, Trennzeichen `;`, Zeilenende CR LF. */
export function indexCsv(belege: readonly Paketbeleg[]): string {
  const zeilen = [INDEX_SPALTEN.join(';')]
  for (const b of belege) {
    zeilen.push(
      [
        csvText(belegnummer(b.laufnummer)),
        csvText(b.belegId),
        csvText(b.lieferant),
        csvText(b.rechnungsnummer),
        csvText(formatDatum(b.rechnungsdatum)),
        csvBetrag(b.bruttoCent),
        b.konto === null ? '' : String(b.konto),
        csvText(b.gegenkonten.join(', ')),
        csvText(b.sha256),
        csvText(b.dateiname),
      ].join(';'),
    )
  }
  return `﻿${zeilen.join('\r\n')}\r\n`
}

/** Das ZIP; `erzeugtAm` dient als Zeitstempel aller Einträge. */
export function belegpaket(belege: readonly Paketbeleg[], erzeugtAm: Date): Uint8Array {
  const dateien: Zippable = {}
  const mtime = erzeugtAm
  for (const b of belege) {
    const name = paketname(b)
    dateien[`originale/${name}.${b.endung}`] = [b.original, { mtime, level: 6 }]
    if (b.ansicht !== null) dateien[`ansicht/${name}.html`] = [strToU8(b.ansicht), { mtime, level: 6 }]
    if (b.pruefbericht !== null) dateien[`pruefberichte/${belegnummer(b.laufnummer)}.json`] = [strToU8(b.pruefbericht), { mtime, level: 6 }]
  }
  dateien['index.csv'] = [strToU8(indexCsv(belege)), { mtime, level: 6 }]
  return zipSync(dateien)
}
