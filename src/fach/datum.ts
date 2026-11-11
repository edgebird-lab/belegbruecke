/** Kalenderdaten (ISO "JJJJ-MM-TT") und Ortszeit Europe/Berlin, ohne Abhängigkeit von der Zeitzone des Rechners. */
import type { Datum, Zeitpunkt } from './typen.ts'

export function istGueltigesDatum(d: string | null | undefined): d is Datum {
  if (!d) return false
  const t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!t) return false
  const [j, m, tag] = [Number(t[1]), Number(t[2]), Number(t[3])]
  if (m < 1 || m > 12 || tag < 1) return false
  return tag <= new Date(Date.UTC(j, m, 0)).getUTCDate()
}

function utc(d: Datum): number {
  const [j, m, t] = d.split('-').map(Number)
  return Date.UTC(j, m - 1, t)
}

/** Tage von a nach b (positiv, wenn b später ist). */
export function tageZwischen(a: Datum, b: Datum): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000)
}

const BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Kalenderdatum eines UTC-Zeitpunkts nach Ortszeit Europe/Berlin. */
export function datumInBerlin(z: Zeitpunkt | Date): Datum {
  const teile = BERLIN.formatToParts(typeof z === 'string' ? new Date(z) : z)
  const wert = (typ: string) => teile.find((t) => t.type === typ)!.value
  return `${wert('year')}-${wert('month')}-${wert('day')}`
}

export function jahr(d: Datum): number {
  return Number(d.slice(0, 4))
}

const BERLIN_ZEIT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** Ortszeit Europe/Berlin eines Zeitpunkts als Zeichenketten mit führenden Nullen (Millisekunden dreistellig). */
export function ortszeitBerlin(z: Zeitpunkt | Date): { jahr: string; monat: string; tag: string; stunde: string; minute: string; sekunde: string; milli: string } {
  const d = typeof z === 'string' ? new Date(z) : z
  const teile = BERLIN_ZEIT.formatToParts(d)
  const wert = (typ: string) => teile.find((t) => t.type === typ)!.value
  return { jahr: wert('year'), monat: wert('month'), tag: wert('day'), stunde: wert('hour'), minute: wert('minute'), sekunde: wert('second'), milli: String(d.getUTCMilliseconds()).padStart(3, '0') }
}

/** Letzter Tag eines Monats "JJJJ-MM" als Zahl. */
export function monatsletzter(monat: string): number {
  const [j, m] = monat.split('-').map(Number)
  return new Date(Date.UTC(j, m, 0)).getUTCDate()
}
