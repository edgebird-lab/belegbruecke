import { describe, expect, it } from 'vitest'
import { csvFelder, leseKontenCsv, pruefeSachkonto, sucheSachkonten } from './kontenplan.ts'
import { naechstesKreditorenkonto, pruefeKreditorenkonto } from './lieferant.ts'

/** 20 Beispielkonten (Bezeichnungen frei gewählt, keine Kontierungsempfehlung) */
const ZWANZIG = `Konto;Bezeichnung;Automatik
4900;Testaufwand;nein
4901;Testaufwand Automatik;ja
4910;Porto;
4920;Telefon;
4925;Internet;
4930;Bürobedarf;
4940;Zeitschriften, Bücher;
4950;Rechts- und Beratungskosten;
4955;Buchführungskosten;
4960;Mieten für Einrichtungen;
4970;Nebenkosten des Geldverkehrs;
4980;Betriebsbedarf;
4985;Werkzeuge und Kleingeräte;
4806;Wartung Software;
4210;Miete;
4240;Gas, Strom, Wasser;
4360;Versicherungen;
4530;Laufende Kfz-Betriebskosten;
4654;Bewirtungskosten;
"4670";"Reisekosten ""Unternehmer""";x
`

describe('Kontenplan (Schritt 4.1)', () => {
  it('importiert 20 Konten aus einer CSV-Datei mit Kopfzeile', () => {
    const r = leseKontenCsv(`﻿${ZWANZIG}`, 4)
    expect(r.fehler).toEqual([])
    expect(r.konten).toHaveLength(20)
    expect(r.konten[0]).toEqual({ nummer: 4210, bezeichnung: 'Miete', automatikkonto: false, aktiv: true })
    expect(r.konten.find((k) => k.nummer === 4901)?.automatikkonto).toBe(true)
    expect(r.konten.find((k) => k.nummer === 4670)).toEqual({ nummer: 4670, bezeichnung: 'Reisekosten "Unternehmer"', automatikkonto: true, aktiv: true })
    expect(r.konten.find((k) => k.nummer === 4940)?.bezeichnung).toBe('Zeitschriften, Bücher')
  })

  it('meldet fehlerhafte Zeilen in Klartext und übernimmt den Rest', () => {
    const r = leseKontenCsv('4900,Aufwand\r\nabc,Text\n12345,Zu lang\n4901,\n4902\tTab-Konto\tvielleicht\n4900;Doppelt\n0;Null', 4)
    expect(r.konten.map((k) => k.nummer)).toEqual([4900])
    expect(r.fehler).toEqual([
      'Zeile 2: „abc“ ist keine Kontonummer.',
      'Zeile 3: Die Kontonummer 12345 hat mehr als 4 Stellen (Sachkontenlänge).',
      'Zeile 4: Die Bezeichnung zu Konto 4901 fehlt.',
      'Zeile 5: „vielleicht“ ist kein Ja oder Nein für „Automatik“.',
      'Zeile 6: Konto 4900 steht doppelt in der Datei; die erste Zeile gilt.',
      'Zeile 7: Die Kontonummer muss eine positive ganze Zahl sein.',
    ])
    expect(csvFelder('"a;b";c', ';')).toEqual(['a;b', 'c'])
    expect(pruefeSachkonto(480, 4)).toBeNull()
    expect(pruefeSachkonto(1.5, 4)).not.toBeNull()
  })

  it('sucht nach Nummer und Bezeichnung, zuletzt genutzte zuerst, ohne inaktive Konten', () => {
    const { konten } = leseKontenCsv(ZWANZIG, 4)
    konten.find((k) => k.nummer === 4920)!.aktiv = false
    expect(sucheSachkonten(konten, '49').map((k) => k.nummer).slice(0, 3)).toEqual([4900, 4901, 4910])
    expect(sucheSachkonten(konten, 'büro').map((k) => k.nummer)).toEqual([4930])
    expect(sucheSachkonten(konten, '', [4654, 4930]).map((k) => k.nummer).slice(0, 3)).toEqual([4654, 4930, 4210])
    expect(sucheSachkonten(konten, '4920')).toEqual([])
  })

  it('Kreditor-Test: fortlaufende Vergabe im Kreis und Prüfung der Wahl von Hand', () => {
    const kreis = { sachkontenlaenge: 4, kreditorenVon: 70000, kreditorenBis: 70002 }
    expect(naechstesKreditorenkonto([], kreis)).toBe(70000)
    expect(naechstesKreditorenkonto([70000, 70001, 12345], kreis)).toBe(70002)
    expect(naechstesKreditorenkonto([70002], kreis)).toBeNull()
    expect(pruefeKreditorenkonto(70001, [70000], kreis)).toBeNull()
    expect(pruefeKreditorenkonto(70000, [70000], kreis)).toContain('schon einem anderen Lieferanten')
    expect(pruefeKreditorenkonto(7000, [], kreis)).toContain('5 Stellen')
    expect(pruefeKreditorenkonto(70003, [], kreis)).toContain('zwischen 70000 und 70002')
  })
})
