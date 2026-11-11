import { describe, expect, it } from 'vitest'
import { kanonisch, KanonischFehler } from './kanonisch.ts'

describe('kanonisch (R17 Punkt 3)', () => {
  it('sortiert Schlüssel nach UTF-16-Codeeinheiten, ohne Leerzeichen', () => {
    expect(kanonisch({ b: 1, a: [true, null, 'x'], C: { z: 0, y: -1 } })).toBe('{"C":{"y":-1,"z":0},"a":[true,null,"x"],"b":1}')
    // Großbuchstaben vor Kleinbuchstaben, „ä“ (U+00E4) hinter „z“
    expect(kanonisch({ ä: 1, z: 2, Z: 3 })).toBe('{"Z":3,"z":2,"ä":1}')
  })

  it('normalisiert Zeichenketten nach NFC', () => {
    const zerlegt = 'Müller' // u + kombinierendes Trema
    expect(kanonisch(zerlegt)).toBe('"Müller"')
    expect(kanonisch(zerlegt)).toBe(kanonisch('Müller'))
  })

  it('maskiert wie JSON.stringify', () => {
    expect(kanonisch('a"b\\c\n')).toBe('"a\\"b\\\\c\\n"')
  })

  it('erlaubt nur sichere Ganzzahlen', () => {
    expect(kanonisch(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991')
    expect(kanonisch(-0)).toBe('0')
    expect(() => kanonisch(1.5)).toThrow(KanonischFehler)
    expect(() => kanonisch(Number.MAX_SAFE_INTEGER + 1)).toThrow(KanonischFehler)
    expect(() => kanonisch(Number.NaN)).toThrow(KanonischFehler)
  })

  it('verbietet undefined, Funktionen und Klassenobjekte', () => {
    expect(() => kanonisch({ a: undefined })).toThrow(/\$\.a: undefined/)
    expect(() => kanonisch([1, undefined])).toThrow(KanonischFehler)
    expect(() => kanonisch({ d: new Date(0) })).toThrow(/einfache Objekte/)
    expect(() => kanonisch({ f: () => 1 })).toThrow(KanonischFehler)
  })

  it('lehnt Schlüssel ab, die nach NFC gleich sind', () => {
    expect(() => kanonisch({ 'Müller': 1, 'Müller': 2 })).toThrow(/doppelt/)
  })
})
