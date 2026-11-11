/** Gemeinsame Bausteine der API: JSON mit zod lesen, Akteur, Beleg laden, Zusammenfassung, Download-Kopf. */
import type { Context } from 'hono'
import type { ZodError } from 'zod'
import { belegnummer } from '../../fach/dubletten.ts'
import { formatBezeichnung } from '../../fach/formaterkennung.ts'
import { ampel } from '../../fach/pruefbericht.ts'
import type { Akteur, Beleg } from '../../fach/typen.ts'
import type { Dienste } from '../dienste/kontext.ts'
import type { Schrittergebnis } from '../dienste/belegschritte.ts'
import { fehler, type Umgebung } from '../sicherheit/middleware.ts'
import { zodText } from './schemata.ts'

type Schema<T> = { safeParse(x: unknown): { success: true; data: T } | { success: false; error: ZodError } }

/** Liest den JSON-Körper und prüft ihn; liefert Daten oder die fertige Fehlerantwort. */
export async function leseJson<T>(c: Context, schema: Schema<T>): Promise<{ daten: T; fehler?: undefined } | { fehler: Response; daten?: undefined }> {
  let roh: unknown
  try {
    roh = await c.req.json()
  } catch {
    return { fehler: fehler(c, 400, 'EINGABE', 'Die Anfrage enthält kein gültiges JSON.') }
  }
  const r = schema.safeParse(roh)
  return r.success ? { daten: r.data } : { fehler: fehler(c, 400, 'EINGABE', zodText(r.error)) }
}

export function akteurVon(c: Context<Umgebung>): Akteur {
  return { art: 'benutzer', id: c.get('benutzer')!.id }
}

export function ladeBeleg(d: Dienste, c: Context<Umgebung>): Beleg | Response {
  const id = c.req.param('id') ?? ''
  if (!/^[0-9A-F-]{36}$/i.test(id)) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Diesen Beleg gibt es nicht.')
  return d.belege.hole(id.toUpperCase()) ?? fehler(c, 404, 'NICHT-GEFUNDEN', 'Diesen Beleg gibt es nicht.')
}

/** Antwort eines Assistentenschritts: Beleg oder Fehler mit deutschem Text. */
export function schrittAntwort(c: Context, r: Schrittergebnis) {
  return r.ok ? c.json({ beleg: r.beleg, zusammenfassung: belegZusammenfassung(r.beleg) }) : fehler(c, r.status, r.code, r.text)
}

export function belegZusammenfassung(b: Beleg) {
  const d = b.daten
  return {
    id: b.id,
    laufnummer: b.laufnummer,
    belegnummer: belegnummer(b.laufnummer),
    status: b.status,
    eingangAm: b.eingangAm,
    quelle: b.quelle.art,
    dateiname: b.original.dateiname,
    format: formatBezeichnung(b.format),
    belegart: b.format.belegart,
    lieferant: b.handerfassung?.lieferantName ?? (d ? (d.typcode === '389' ? d.kaeufer.name : d.verkaeufer.name) : null),
    rechnungsnummer: b.handerfassung?.rechnungsnummer ?? d?.rechnungsnummer ?? null,
    rechnungsdatum: b.handerfassung?.rechnungsdatum ?? d?.rechnungsdatum ?? null,
    bruttoCent: b.handerfassung?.bruttoCent ?? d?.summen.bruttoCent ?? null,
    waehrung: d?.waehrung ?? 'EUR',
    ampel: ampel(b.format, b.pruefung),
    dubletten: b.dubletten.length,
    aufbewahrenBis: b.aufbewahrenBis,
    exportlaufId: b.exportlaufId,
  }
}

export type Belegzusammenfassung = ReturnType<typeof belegZusammenfassung>

export function anhangKopf(dateiname: string, inline = false): string {
  const ascii = dateiname.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`
}
