/**
 * Beträge als Cent-Ganzzahl (R24). Dezimaltext aus der Rechnung: optionales Vorzeichen, Ziffern,
 * optional Punkt mit Nachkommastellen (lexikalischer Raum von xs:decimal). Belegbeträge haben
 * nach EN 16931 höchstens 2 Nachkommastellen; mehr Stellen sind ein Befund `BETRAG-FORMAT`.
 */
import type { Cent } from './typen.ts'

export type Betragsergebnis =
  | { ok: true; cent: Cent }
  | {
      ok: false
      grund: 'leer' | 'format' | 'nachkommastellen' | 'zu-gross'
      /** bei 'nachkommastellen': exakter Wert, falls die zusätzlichen Stellen alle 0 sind */
      cent: Cent | null
    }

const DEZIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/

export function parseBetrag(text: string | null | undefined): Betragsergebnis {
  const roh = (text ?? '').trim()
  if (roh === '') return { ok: false, grund: 'leer', cent: null }
  const t = DEZIMAL.exec(roh)
  // xs:decimal verlangt mindestens eine Ziffer vor oder nach dem Punkt
  if (!t || (t[2] === '' && (t[3] ?? '') === '')) return { ok: false, grund: 'format', cent: null }
  const vorzeichen = t[1] === '-' ? -1 : 1
  const ganz = t[2].replace(/^0+(?=\d)/, '') || '0'
  const nachkomma = t[3] ?? ''
  if (ganz.length > 13) return { ok: false, grund: 'zu-gross', cent: null }
  const zweiStellen = (nachkomma + '00').slice(0, 2)
  const cent = vorzeichen * (Number(ganz) * 100 + Number(zweiStellen)) || 0
  if (!Number.isSafeInteger(cent)) return { ok: false, grund: 'zu-gross', cent: null }
  if (nachkomma.length > 2) {
    const exakt = /^0*$/.test(nachkomma.slice(2))
    return { ok: false, grund: 'nachkommastellen', cent: exakt ? cent : null }
  }
  return { ok: true, cent }
}

/** Cent als Dezimaltext mit Punkt, wie in XML: 33690 → "336.90". */
export function centAlsDezimal(cent: Cent): string {
  if (!Number.isSafeInteger(cent)) throw new RangeError(`Kein Cent-Betrag: ${cent}`)
  const betrag = Math.abs(cent)
  return `${cent < 0 ? '-' : ''}${Math.floor(betrag / 100)}.${String(betrag % 100).padStart(2, '0')}`
}

/**
 * Kaufmännische Rundung von Bemessung × Satz / 100 auf Cent, exakt ohne Gleitkomma.
 * `satz` ist Dezimaltext (z. B. "19", "7", "16", "5.5"). Halbe Cent werden vom Nullpunkt weg
 * gerundet, wie es BR-CO-17 über round() in XPath für positive Werte verlangt.
 */
export function steuerAusSatz(bemessungCent: Cent, satz: string): Cent | null {
  const t = /^(\d+)(?:\.(\d+))?$/.exec(satz.trim())
  if (!t) return null
  const nachkomma = t[2] ?? ''
  const nenner = 10n ** BigInt(nachkomma.length)
  const satzGanz = BigInt(t[1] + nachkomma)
  // Steuer in Cent = bemessung × satzGanz / (100 × nenner)
  const zaehler = BigInt(bemessungCent) * satzGanz
  const teiler = 100n * nenner
  const negativ = zaehler < 0n
  const abs = negativ ? -zaehler : zaehler
  let q = abs / teiler
  if ((abs % teiler) * 2n >= teiler) q += 1n
  return Number(negativ ? -q : q)
}

/**
 * Betrag aus einer Eingabe im deutschen Format: „1.234,56“, „336,90 €“, „-12,5“; ohne Komma gilt der
 * Punkt als Dezimalzeichen („336.90“), außer bei Tausendergruppen („1.234“ = 1234). Liefert Cent oder
 * null, wenn die Eingabe kein Betrag mit höchstens 2 Nachkommastellen ist.
 */
export function leseBetragEingabe(text: string): Cent | null {
  let t = text.replace(/[\s €]/g, '')
  if (t === '') return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const r = parseBetrag(t)
  return r.ok ? r.cent : null
}
