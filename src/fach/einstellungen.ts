/**
 * Standard-Einstellungen. Die DATEV-Werte sind Annahmen, bis Robin und die Kanzlei sie bestätigen
 * (docs/entscheidungen.md, offene Fragen 1 bis 5): Testwerte der Spezifikation, BU 9 und 8.
 */
import { STANDARD_AUFBEWAHRUNG } from './aufbewahrung.ts'
import type { Einstellungen } from './typen.ts'

export function standardEinstellungen(): Einstellungen {
  return {
    formatVersion: 1,
    firma: { name: '', namensVarianten: [], anschrift: { land: 'DE' }, kleinunternehmer: false },
    datev: {
      beraternummer: 1001,
      mandantennummer: 1,
      wjBeginnMonatTag: '01-01',
      sachkontenlaenge: 4,
      kontenrahmen: 'SKR03',
      kreditorenVon: 70000,
      kreditorenBis: 99999,
      buSchluessel: { 'vorsteuer-19': '9', 'vorsteuer-7': '8', 'ohne-vorsteuer': null, sonderfall: null },
      exportmodus: 'buchungsstapel-und-belege',
      duoPaket: false,
      exportiertVon: 'Belegbrücke',
      zeichensatz: 'windows-1252',
    },
    postfach: {
      aktiv: false,
      server: '',
      port: 993,
      benutzer: '',
      passwortVerschluesselt: '',
      ordner: 'INBOX',
      zielOrdner: 'Belegbruecke/verarbeitet',
      intervallMinuten: 15,
      nurVonAbsendern: [],
      emlAufbewahren: true,
    },
    aufbewahrung: { ...STANDARD_AUFBEWAHRUNG },
    eingerichtetAm: null,
  }
}

/** Unterschiede zweier Einstellungen als Liste von Pfaden mit altem und neuem Wert, ohne Passwort. */
export function einstellungsAenderungen(alt: Einstellungen, neu: Einstellungen): { pfad: string; alt: unknown; neu: unknown }[] {
  const liste: { pfad: string; alt: unknown; neu: unknown }[] = []
  const vergleiche = (a: unknown, b: unknown, pfad: string) => {
    if (pfad === 'postfach.passwortVerschluesselt') {
      if (a !== b) liste.push({ pfad, alt: '(geändert)', neu: '(geändert)' })
      return
    }
    const objA = a !== null && typeof a === 'object' && !Array.isArray(a)
    const objB = b !== null && typeof b === 'object' && !Array.isArray(b)
    if (objA && objB) {
      const schluessel = new Set([...Object.keys(a as object), ...Object.keys(b as object)])
      for (const s of [...schluessel].sort()) vergleiche((a as Record<string, unknown>)[s], (b as Record<string, unknown>)[s], pfad ? `${pfad}.${s}` : s)
      return
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) liste.push({ pfad, alt: a ?? null, neu: b ?? null })
  }
  vergleiche(alt, neu, '')
  return liste
}
