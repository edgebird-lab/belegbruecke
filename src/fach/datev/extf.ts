/**
 * DATEV-Buchungsstapel im EXTF-Format (R19), Feldliste nach Spezifikation 3.3 aus der Sekundärquelle
 * `ledermann/datev` (MIT) **[ungeprüft]** bis Schritt 0.6; die Oberfläche nennt den Export deshalb
 * „Vorschau“. Texte in doppelten Anführungszeichen (innere verdoppelt), Zahlen ohne, leere Felder
 * leer; Zeilenende CR LF; Windows-1252 ohne BOM. Rein, ohne Node-APIs.
 */
import { monatsletzter, ortszeitBerlin } from '../datum.ts'
import type { Cent, Datum, DatevEinstellungen } from '../typen.ts'
import { kodiereWindows1252 } from './cp1252.ts'

/** Spaltenüberschriften der 125 Buchungsfelder (Zeile 2), Reihenfolge und Namen wie `ledermann/datev`. */
export const BUCHUNGSFELDER: readonly string[] = [
  'Umsatz (ohne Soll/Haben-Kz)',
  'Soll/Haben-Kennzeichen',
  'WKZ Umsatz',
  'Kurs',
  'Basisumsatz',
  'WKZ Basisumsatz',
  'Konto',
  'Gegenkonto (ohne BU-Schlüssel)',
  'BU-Schlüssel',
  'Belegdatum',
  'Belegfeld 1',
  'Belegfeld 2',
  'Skonto',
  'Buchungstext',
  'Postensperre',
  'Diverse Adressnummer',
  'Geschäftspartnerbank',
  'Sachverhalt',
  'Zinssperre',
  'Beleglink',
  ...Array.from({ length: 8 }, (_, i) => [`Beleginfo – Art ${i + 1}`, `Beleginfo – Inhalt ${i + 1}`]).flat(),
  'KOST1 – Kostenstelle',
  'KOST2 – Kostenstelle',
  'Kost Menge',
  'EU-Land u. USt-IdNr.',
  'EU-Steuersatz',
  'Abw. Versteuerungsart',
  'Sachverhalt L+L',
  'Funktionsergänzung L+L',
  'BU 49 Hauptfunktionstyp',
  'BU 49 Hauptfunktionsnummer',
  'BU 49 Funktionsergänzung',
  ...Array.from({ length: 20 }, (_, i) => [`Zusatzinformation – Art ${i + 1}`, `Zusatzinformation – Inhalt ${i + 1}`]).flat(),
  'Stück',
  'Gewicht',
  'Zahlweise',
  'Forderungsart',
  'Veranlagungsjahr',
  'Zugeordnete Fälligkeit',
  'Skontotyp',
  'Auftragsnummer',
  'Buchungstyp',
  'USt-Schlüssel (Anzahlungen)',
  'EU-Mitgliedstaat (Anzahlungen)',
  'Sachverhalt L+L (Anzahlungen)',
  'EU-Steuersatz (Anzahlungen)',
  'Erlöskonto (Anzahlungen)',
  'Herkunft-Kz',
  'Leerfeld',
  'KOST-Datum',
  'SEPA-Mandatsreferenz',
  'Skontosperre',
  'Gesellschaftername',
  'Beteiligtennummer',
  'Identifikationsnummer',
  'Zeichnernummer',
  'Postensperre bis',
  'Bezeichnung',
  'Kennzeichen',
  'Festschreibung',
  'Leistungsdatum',
  'Datum Zuord.',
  'Fälligkeit',
  'Generalumkehr',
  'Steuersatz',
  'Land',
  'Abrechnungsreferent',
  'BVV-Position',
  'EU-Mitgliedstaat u. UStID (Ursprung)',
  'EU-Steuersatz (Ursprung)',
  'Abw. Skontokonto',
]

/** Eine Buchung im Stapel, je Kontierungszeile (R19). */
export interface Buchung {
  umsatzCent: Cent
  sollHaben: 'S' | 'H'
  /** Kreditorenkonto */
  konto: number
  /** Sachkonto */
  gegenkonto: number
  buSchluessel: string | null
  belegdatum: Datum
  /** BT-1 bzw. Rechnungsnummer der Erfassung von Hand; Belegfeld 1 entsteht daraus */
  rechnungsnummer: string
  buchungstext: string
  /** Beleg-ID für den Beleglink, nur mit DUO-Paket */
  beleglink: string | null
  leistungsdatum: Datum | null
}

export interface Stapelangaben {
  erzeugtAm: Date
  datev: Pick<DatevEinstellungen, 'beraternummer' | 'mandantennummer' | 'wjBeginnMonatTag' | 'sachkontenlaenge' | 'kontenrahmen' | 'exportiertVon'>
  /** "JJJJ-MM" */
  monat: string
  nachtragNr: number
}

const ERLAUBT = /[A-Za-z0-9$&%*+\-/]/

/** Belegfeld 1: Zeichen außerhalb `A–Z a–z 0–9 $ & % * + - /` werden zu "-", danach höchstens 36 Zeichen. */
export function belegfeld1(nummer: string): string {
  return [...nummer.trim()]
    .map((z) => (ERLAUBT.test(z) ? z : '-'))
    .join('')
    .slice(0, 36)
}

/** Feld 6 der Kopfzeile: JJJJMMTTHHMMSSmmm in Ortszeit Europe/Berlin. */
export function erzeugtAmFeld(d: Date): string {
  const o = ortszeitBerlin(d)
  return `${o.jahr}${o.monat}${o.tag}${o.stunde}${o.minute}${o.sekunde}${o.milli}`
}

/** Feld 13: letzter Beginn des Wirtschaftsjahrs am oder vor dem Monatsersten, als JJJJMMTT. */
export function wjBeginn(monat: string, wjBeginnMonatTag: string): string {
  const [j, m] = monat.split('-')
  const [wm, wt] = wjBeginnMonatTag.split('-')
  const diesesJahr = `${j}${wm}${wt}`
  return diesesJahr <= `${j}${m}01` ? diesesJahr : `${Number(j) - 1}${wm}${wt}`
}

export function stapelBezeichnung(monat: string, nachtragNr: number): string {
  const [j, m] = monat.split('-')
  return `Belegbrücke ${m}/${j}${nachtragNr > 0 ? ` N${nachtragNr}` : ''}`.slice(0, 30)
}

export function extfDateiname(datev: Pick<DatevEinstellungen, 'beraternummer' | 'mandantennummer'>, monat: string, nachtragNr: number): string {
  return `EXTF_Buchungsstapel_${datev.beraternummer}_${datev.mandantennummer}_${monat}${nachtragNr > 0 ? `_N${nachtragNr}` : ''}.csv`
}

/** Textfeld: in Anführungszeichen, innere verdoppelt; Zeilenumbrüche und Tabulatoren werden Leerzeichen. */
function text(wert: string): string {
  return `"${wert.replace(/[\r\n\t]+/g, ' ').replace(/"/g, '""')}"`
}

/** Betrag in Cent als Dezimalzahl mit Komma ohne Tausenderpunkt, z. B. 68888 → 688,88. */
export function datevBetrag(cent: Cent): string {
  if (!Number.isSafeInteger(cent) || cent < 0) throw new RangeError(`Umsatz muss ein nicht negativer Cent-Betrag sein: ${cent}`)
  return `${Math.floor(cent / 100)},${String(cent % 100).padStart(2, '0')}`
}

function ttmm(d: Datum): string {
  return `${d.slice(8, 10)}${d.slice(5, 7)}`
}

function ttmmjjjj(d: Datum): string {
  return `${d.slice(8, 10)}${d.slice(5, 7)}${d.slice(0, 4)}`
}

/** Zeile 1: Kopfzeile mit 31 Feldern (R19). */
export function kopfzeile(a: Stapelangaben): string {
  const [j, m] = a.monat.split('-')
  const felder: string[] = [
    text('EXTF'),
    '700',
    '21',
    text('Buchungsstapel'),
    '13',
    erzeugtAmFeld(a.erzeugtAm),
    '',
    text('RE'),
    text(a.datev.exportiertVon.slice(0, 25)),
    text(''),
    String(a.datev.beraternummer),
    String(a.datev.mandantennummer),
    wjBeginn(a.monat, a.datev.wjBeginnMonatTag),
    String(a.datev.sachkontenlaenge),
    `${j}${m}01`,
    `${j}${m}${String(monatsletzter(a.monat)).padStart(2, '0')}`,
    text(stapelBezeichnung(a.monat, a.nachtragNr)),
    text(''),
    '1',
    '0',
    '0',
    text('EUR'),
    '',
    text(''),
    '',
    '',
    text(a.datev.kontenrahmen === 'SKR04' ? '04' : '03'),
    '',
    '',
    text(''),
    text(''),
  ]
  return felder.join(';')
}

/** Eine Buchungszeile mit 125 Feldern; nur die Felder aus R19 sind gefüllt. */
export function buchungszeile(b: Buchung, sachkontenlaenge: number): string {
  const felder = new Array<string>(BUCHUNGSFELDER.length).fill('')
  const setze = (nr: number, wert: string) => {
    felder[nr - 1] = wert
  }
  const bf1 = belegfeld1(b.rechnungsnummer)
  const nr = b.rechnungsnummer.trim()
  // Weicht Belegfeld 1 von BT-1 ab, steht BT-1 vollständig im Buchungstext
  const buchungstext = bf1 !== nr && !b.buchungstext.includes(nr) ? `${b.buchungstext.slice(0, Math.max(0, 59 - nr.length)).trimEnd()} ${nr}`.trim().slice(0, 60) : b.buchungstext
  setze(1, datevBetrag(b.umsatzCent))
  setze(2, text(b.sollHaben))
  setze(3, text('EUR'))
  setze(7, String(b.konto))
  setze(8, String(b.gegenkonto).padStart(sachkontenlaenge, '0'))
  setze(9, b.buSchluessel ? text(b.buSchluessel) : '')
  setze(10, ttmm(b.belegdatum))
  setze(11, text(bf1))
  setze(14, text(buchungstext))
  if (b.beleglink) setze(20, text(`BEDI "${b.beleglink}"`))
  setze(114, '0')
  setze(115, b.leistungsdatum ? ttmmjjjj(b.leistungsdatum) : '')
  return felder.join(';')
}

export interface Extfdatei {
  name: string
  text: string
  bytes: Uint8Array
  /** z. B. nicht darstellbare Zeichen */
  hinweise: string[]
}

/** Der ganze Stapel als Text (CR LF) und als Windows-1252-Bytes ohne BOM. */
export function extfDatei(a: Stapelangaben & { datev: Stapelangaben['datev'] & Pick<DatevEinstellungen, 'beraternummer' | 'mandantennummer'> }, buchungen: readonly Buchung[]): Extfdatei {
  const zeilen = [kopfzeile(a), BUCHUNGSFELDER.join(';'), ...buchungen.map((b) => buchungszeile(b, a.datev.sachkontenlaenge))]
  const inhalt = `${zeilen.join('\r\n')}\r\n`
  const kodiert = kodiereWindows1252(inhalt)
  const hinweise = kodiert.ersetzt.length
    ? [`Nicht in Windows-1252 darstellbare Zeichen wurden durch „_“ ersetzt: ${kodiert.ersetzt.map((z) => `„${z}“ (U+${z.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}.`]
    : []
  return { name: extfDateiname(a.datev, a.monat, a.nachtragNr), text: inhalt, bytes: kodiert.bytes, hinweise }
}
