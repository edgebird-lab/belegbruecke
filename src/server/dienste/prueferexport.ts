/**
 * Prüferexport (R22) für den Datenzugriff der Betriebsprüfung: ZIP mit originale/, pruefberichte/,
 * belege.csv (alle Felder des Belegs flach), protokoll.jsonl, kettenbericht.txt und LIESMICH.txt.
 * Zeitraum nach Belegdatum (ohne Belegdatum: Eingangsdatum). Der Export wird protokolliert.
 */
import { createHash } from 'node:crypto'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { formatDatum } from '../../fach/anzeige.ts'
import { paketname } from '../../fach/datev/belegpaket.ts'
import { datumInBerlin } from '../../fach/datum.ts'
import { belegnummer } from '../../fach/dubletten.ts'
import type { Akteur, Beleg } from '../../fach/typen.ts'
import { belegdatumVon } from '../../fach/uebergabe.ts'
import { berichtsPfade } from './ansicht.ts'
import { kettenberichtText, pruefeArchiv } from './kette.ts'
import type { Dienste } from './kontext.ts'

const ENDUNG = { 'application/xml': 'xml', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const

/** Beleg als flache Felder: verschachtelte Objekte mit Punkt, Listen als JSON. */
export function flach(wert: unknown, praefix = '', ziel: Record<string, string> = {}): Record<string, string> {
  if (wert !== null && typeof wert === 'object' && !Array.isArray(wert)) {
    for (const [k, v] of Object.entries(wert)) flach(v, praefix ? `${praefix}.${k}` : k, ziel)
  } else ziel[praefix] = wert === null || wert === undefined ? '' : Array.isArray(wert) ? JSON.stringify(wert) : String(wert)
  return ziel
}

function csvFeld(t: string): string {
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function belegeCsv(belege: readonly Beleg[]): string {
  const zeilen = belege.map((b) => flach(b))
  const vorne = ['id', 'laufnummer', 'status']
  const spalten = [...vorne, ...[...new Set(zeilen.flatMap((z) => Object.keys(z)))].filter((s) => !vorne.includes(s)).sort()]
  const text = [spalten.join(';'), ...zeilen.map((z) => spalten.map((s) => csvFeld(z[s] ?? '')).join(';'))]
  return `﻿${text.join('\r\n')}\r\n`
}

const LIESMICH = (von: string | null, bis: string | null, anzahl: number, erzeugt: string) => `Prüferexport der Belegbrücke
============================

Erzeugt am ${erzeugt}. Zeitraum (Belegdatum): ${von ? formatDatum(von) : 'Anfang'} bis ${bis ? formatDatum(bis) : 'heute'}. Belege: ${anzahl}.

Inhalt
- originale/       empfangene Dateien bytegleich zum Archiv (<Belegnummer>_<Rechnungsnummer>.<Endung>);
                   ihr SHA-256 steht in belege.csv (original.sha256) und im Protokoll (Aktion „eingang“)
- pruefberichte/   alle Prüfberichte je Beleg (<Belegnummer>/<n>.json), maschinenlesbar
- belege.csv       alle Felder jedes Belegs, flach (UTF-8 mit BOM, Trennzeichen ;)
- protokoll.jsonl  vollständiges Protokoll, ein Eintrag je Zeile; jeder Eintrag trägt den SHA-256 seines
                   Vorgängers (Hashkette nach R17 der Spezifikation)
- kettenbericht.txt Ergebnis der Kettenprüfung beim Erzeugen dieses Exports

Hashkette nachrechnen: hash = SHA-256 über die UTF-8-Bytes des kanonischen JSON aus
{ nr, zeitpunkt, akteur, aktion, belegId, daten, vorgaengerHash } (Schlüssel sortiert, ohne Leerzeichen,
Zeichenketten NFC-normalisiert).

Technische Aufbereitung ohne Gewähr; maßgeblich sind die Originale.
`

export interface Prueferexport {
  name: string
  bytes: Uint8Array
  sha256: string
  anzahl: number
}

export async function erzeugePrueferexport(d: Dienste, zeitraum: { von: string | null; bis: string | null }, akteur: Akteur): Promise<Prueferexport> {
  const jetzt = d.uhr()
  const im = (b: Beleg) => {
    const datum = belegdatumVon(b) ?? datumInBerlin(b.eingangAm)
    return (!zeitraum.von || datum >= zeitraum.von) && (!zeitraum.bis || datum <= zeitraum.bis)
  }
  const belege = d.belege
    .liste()
    .filter(im)
    .sort((a, b) => a.laufnummer - b.laufnummer)
  // Kettenprüfung zuerst; ihr Eintrag gehört schon zum exportierten Protokoll
  const bericht = await pruefeArchiv(d.db, d.ablage, d.protokoll, { akteur, uhr: d.uhr })
  const dateien: Zippable = {}
  const mtime = jetzt
  for (const b of belege) {
    const name = paketname({ laufnummer: b.laufnummer, rechnungsnummer: b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? '' })
    dateien[`originale/${name}.${ENDUNG[b.original.mimeTyp]}`] = [await d.ablage.lies(b.original.speicherpfad), { mtime }]
    for (const pfad of berichtsPfade(d, b.id)) dateien[`pruefberichte/${belegnummer(b.laufnummer)}/${pfad.split('/').at(-1)}`] = [await d.ablage.lies(pfad), { mtime }]
  }
  dateien['belege.csv'] = [strToU8(belegeCsv(belege)), { mtime }]
  dateien['protokoll.jsonl'] = [strToU8(d.protokoll.alle().map((e) => JSON.stringify(e)).join('\n') + '\n'), { mtime }]
  dateien['kettenbericht.txt'] = [strToU8(kettenberichtText(bericht)), { mtime }]
  dateien['LIESMICH.txt'] = [strToU8(LIESMICH(zeitraum.von, zeitraum.bis, belege.length, `${formatDatum(datumInBerlin(jetzt))}`)), { mtime }]
  const bytes = zipSync(dateien)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const name = `Prueferexport_${zeitraum.von ?? 'anfang'}_${zeitraum.bis ?? datumInBerlin(jetzt)}.zip`
  d.protokoll.anhaengen({ akteur, aktion: 'prueferexport', belegId: null, daten: { von: zeitraum.von, bis: zeitraum.bis, belege: belege.length, name, sha256, kettePruefungOk: bericht.ok } })
  return { name, bytes, sha256, anzahl: belege.length }
}
