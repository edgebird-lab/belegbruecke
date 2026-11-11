/**
 * Kanonisches JSON für die Hashkette (R17 Punkt 3): Objektschlüssel sortiert nach
 * UTF-16-Codeeinheiten, keine Leerzeichen, Zeichenketten NFC-normalisiert und mit
 * JSON.stringify maskiert, Zahlen nur als sichere Ganzzahlen, `undefined` verboten.
 */

export class KanonischFehler extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'KanonischFehler'
  }
}

export function kanonisch(wert: unknown): string {
  return schreibe(wert, '$')
}

function schreibe(wert: unknown, pfad: string): string {
  if (wert === null) return 'null'
  switch (typeof wert) {
    case 'string':
      return JSON.stringify(wert.normalize('NFC'))
    case 'boolean':
      return wert ? 'true' : 'false'
    case 'number':
      if (!Number.isSafeInteger(wert)) throw new KanonischFehler(`${pfad}: nur sichere Ganzzahlen erlaubt, nicht ${wert}`)
      // -0 wird zu 0, sonst schriebe String(-0) "0" ohnehin; Object.is hält den Fall explizit fest
      return Object.is(wert, -0) ? '0' : String(wert)
    case 'undefined':
      throw new KanonischFehler(`${pfad}: undefined ist nicht erlaubt`)
    case 'object': {
      if (Array.isArray(wert)) return `[${wert.map((w, i) => schreibe(w, `${pfad}[${i}]`)).join(',')}]`
      const proto = Object.getPrototypeOf(wert)
      if (proto !== Object.prototype && proto !== null) throw new KanonischFehler(`${pfad}: nur einfache Objekte erlaubt`)
      // Sortiert wird nach dem NFC-normalisierten Schlüssel, so wie er geschrieben wird
      const paare = Object.keys(wert).map((s) => [s.normalize('NFC'), s] as const)
      paare.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      for (let i = 1; i < paare.length; i++) {
        if (paare[i][0] === paare[i - 1][0]) throw new KanonischFehler(`${pfad}: Schlüssel ${paare[i][0]} doppelt nach NFC`)
      }
      return `{${paare.map(([norm, s]) => `${JSON.stringify(norm)}:${schreibe((wert as Record<string, unknown>)[s], `${pfad}.${s}`)}`).join(',')}}`
    }
    default:
      throw new KanonischFehler(`${pfad}: Typ ${typeof wert} ist nicht erlaubt`)
  }
}
