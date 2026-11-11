/**
 * Monatsübergabe an die Kanzlei (R19 Sperren, R21): Gruppierung nach dem Monat des Belegdatums,
 * Nachtragsläufe, Sperrgründe je Beleg, Buchungen für den EXTF-Stapel und Summen je Steuersatz.
 * Rein, ohne Node-APIs; die Dateien erzeugen `datev/extf.ts` und `datev/belegpaket.ts`.
 */
import { formatBetrag } from './anzeige.ts'
import type { Buchung } from './datev/extf.ts'
import { belegnummer } from './dubletten.ts'
import { STEUERFALL_TEXT } from './kontierung.ts'
import type { Beleg, Belegstatus, Cent, DatevEinstellungen, Einstellungen, Exportlauf, Lieferant, Sachkonto, Uuid } from './typen.ts'

/** Belegdatum: Erfassung von Hand, sonst BT-2 (R21 Punkt 1). */
export function belegdatumVon(b: Pick<Beleg, 'daten' | 'handerfassung'>): string | null {
  return b.handerfassung?.rechnungsdatum ?? b.daten?.rechnungsdatum ?? null
}

/** Monat "JJJJ-MM" des Belegdatums oder null. */
export function belegMonat(b: Pick<Beleg, 'daten' | 'handerfassung'>): string | null {
  const d = belegdatumVon(b)
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.slice(0, 7) : null
}

/** U1: ältester Monat mit freigegebenen, noch nicht exportierten Belegen. */
export function monatsvorschlag(belege: readonly Beleg[]): string | null {
  const monate = belege.filter((b) => b.status === 'freigegeben' && !b.exportlaufId).map(belegMonat).filter((m): m is string => m !== null)
  return monate.length ? monate.sort()[0] : null
}

/** R21 Punkt 2: 0 für den ersten Lauf eines Monats, dann fortlaufend. */
export function naechsteNachtragNr(monat: string, laeufe: readonly Pick<Exportlauf, 'monat' | 'nachtragNr'>[]): number {
  const nummern = laeufe.filter((l) => l.monat === monat).map((l) => l.nachtragNr)
  return nummern.length ? Math.max(...nummern) + 1 : 0
}

export interface Sperre {
  belegId: Uuid | null
  laufnummer: number | null
  grund: string
}

/** Nummernprüfung aus R19: Beraternummer, Mandantennummer, Sachkontenlänge. */
export function stammdatenSperren(datev: Pick<DatevEinstellungen, 'beraternummer' | 'mandantennummer' | 'sachkontenlaenge'>): Sperre[] {
  const sperren: Sperre[] = []
  const ganz = (n: number, von: number, bis: number) => Number.isSafeInteger(n) && n >= von && n <= bis
  if (!ganz(datev.beraternummer, 1001, 9999999)) sperren.push({ belegId: null, laufnummer: null, grund: 'Die Beraternummer muss zwischen 1001 und 9999999 liegen (Einstellungen, Kanzlei).' })
  if (!ganz(datev.mandantennummer, 1, 99999)) sperren.push({ belegId: null, laufnummer: null, grund: 'Die Mandantennummer muss zwischen 1 und 99999 liegen (Einstellungen, Kanzlei).' })
  if (!ganz(datev.sachkontenlaenge, 4, 8)) sperren.push({ belegId: null, laufnummer: null, grund: 'Die Sachkontenlänge muss zwischen 4 und 8 liegen (Einstellungen, Kanzlei).' })
  return sperren
}

export interface Uebergabekontext {
  einstellungen: Pick<Einstellungen, 'datev'>
  lieferanten: readonly Lieferant[]
  sachkonten: readonly Sachkonto[]
}

function mitBuchungsstapel(k: Uebergabekontext): boolean {
  return k.einstellungen.datev.exportmodus === 'buchungsstapel-und-belege'
}

/** R19: Sperrgründe eines Belegs in Klartext (leer = exportierbar). */
export function belegSperren(b: Beleg, k: Uebergabekontext): string[] {
  const gruende: string[] = []
  const waehrung = b.handerfassung ? 'EUR' : (b.daten?.waehrung ?? 'EUR')
  if (waehrung !== 'EUR') gruende.push(`Fremdwährung ${waehrung}: Die Übergabe ist nur in Euro möglich.`)
  if (!mitBuchungsstapel(k)) return gruende
  const kt = b.kontierung
  if (!kt) return [...gruende, 'Der Beleg ist nicht kontiert.']
  if (kt.nurBeleg) return gruende
  const datev = k.einstellungen.datev
  const lieferant = k.lieferanten.find((l) => l.id === b.lieferantId) ?? null
  if (!lieferant?.kreditorKonto) gruende.push('Kreditorenkonto fehlt.')
  else if (String(lieferant.kreditorKonto).length !== datev.sachkontenlaenge + 1) {
    gruende.push(`Das Kreditorenkonto ${lieferant.kreditorKonto} passt nicht zur Sachkontenlänge ${datev.sachkontenlaenge} (erwartet ${datev.sachkontenlaenge + 1} Stellen).`)
  }
  for (const [i, z] of kt.zeilen.entries()) {
    const zeile = kt.zeilen.length > 1 ? ` (Zeile ${i + 1})` : ''
    if (z.sachkonto === null) {
      gruende.push(`Sachkonto fehlt${zeile}.`)
      continue
    }
    const konto = k.sachkonten.find((s) => s.nummer === z.sachkonto)
    if (!konto) gruende.push(`Das Sachkonto ${z.sachkonto} steht nicht im Kontenplan${zeile}.`)
    else if (String(z.sachkonto).length > datev.sachkontenlaenge) gruende.push(`Das Sachkonto ${z.sachkonto} ist länger als die Sachkontenlänge ${datev.sachkontenlaenge}${zeile}.`)
    if (!z.buSchluessel && !konto?.automatikkonto && z.steuerfall !== 'ohne-vorsteuer') {
      gruende.push(`BU-Schlüssel fehlt für den Steuerfall „${STEUERFALL_TEXT[z.steuerfall]}“${zeile}; mit der Kanzlei abstimmen.`)
    }
  }
  return gruende
}

/** Buchungen eines Belegs für den EXTF-Stapel (je Kontierungszeile eine; 0,00 € entfällt). */
export function buchungenFuer(b: Beleg, k: Uebergabekontext): Buchung[] {
  const kt = b.kontierung
  if (!kt || kt.nurBeleg) return []
  const lieferant = k.lieferanten.find((l) => l.id === b.lieferantId)
  const belegdatum = belegdatumVon(b)
  const nummer = b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? ''
  if (!lieferant?.kreditorKonto || !belegdatum) return []
  return kt.zeilen
    .filter((z) => z.sachkonto !== null && z.bruttoCent > 0)
    .map((z) => ({
      umsatzCent: z.bruttoCent,
      sollHaben: kt.sollHaben,
      konto: lieferant.kreditorKonto!,
      gegenkonto: z.sachkonto!,
      buSchluessel: z.buSchluessel,
      belegdatum,
      rechnungsnummer: nummer,
      buchungstext: z.buchungstext,
      beleglink: k.einstellungen.datev.duoPaket ? b.id : null,
      leistungsdatum: b.handerfassung ? b.handerfassung.leistungsdatum : (b.daten?.lieferdatum ?? null),
    }))
}

export interface Steuersumme {
  kategorie: string
  satz: string
  bruttoCent: Cent
}

/** Summen der Buchungszeilen je Kategorie und Satz; Gutschriften (Soll) zählen negativ. */
export function summenJeSteuersatz(belege: readonly Beleg[]): Steuersumme[] {
  const summen = new Map<string, Steuersumme>()
  for (const b of belege) {
    const kt = b.kontierung
    if (!kt || kt.nurBeleg) continue
    const vorzeichen = kt.sollHaben === 'S' ? -1 : 1
    for (const z of kt.zeilen) {
      const s = `${z.steuerkategorie}|${z.steuersatz}`
      const alt = summen.get(s) ?? { kategorie: z.steuerkategorie, satz: z.steuersatz, bruttoCent: 0 }
      summen.set(s, { ...alt, bruttoCent: alt.bruttoCent + vorzeichen * z.bruttoCent })
    }
  }
  return [...summen.values()].sort((a, b) => a.kategorie.localeCompare(b.kategorie) || Number(b.satz) - Number(a.satz))
}

export interface Uebergabeplan {
  monat: string
  nachtragNr: number
  /** Belege dieses Laufs: freigegeben, im Monat, noch nicht exportiert */
  belege: Beleg[]
  /** davon ohne Buchung (Typ 389) */
  nurBeleg: Beleg[]
  /** alle Belege des Monats je Status */
  anzahlJeStatus: Record<Belegstatus, number>
  /** noch nicht freigegebene Belege des Monats (Warnung in U1) */
  offen: Beleg[]
  sperren: Sperre[]
  summen: Steuersumme[]
  summeBruttoCent: Cent
  buchungen: Buchung[]
  mitBuchungsstapel: boolean
}

/** U1 und U2: was ein Lauf für den Monat übergeben würde und was ihn sperrt. */
export function planeUebergabe(monat: string, alle: readonly Beleg[], laeufe: readonly Pick<Exportlauf, 'monat' | 'nachtragNr'>[], k: Uebergabekontext): Uebergabeplan {
  const imMonat = alle.filter((b) => belegMonat(b) === monat)
  const anzahlJeStatus: Record<Belegstatus, number> = { eingegangen: 0, geprueft: 0, kontiert: 0, freigegeben: 0, exportiert: 0, abgelehnt: 0 }
  for (const b of imMonat) anzahlJeStatus[b.status]++
  const belege = imMonat.filter((b) => b.status === 'freigegeben' && !b.exportlaufId).sort((a, b) => a.laufnummer - b.laufnummer)
  const sperren: Sperre[] = [...stammdatenSperren(k.einstellungen.datev)]
  for (const b of belege) for (const grund of belegSperren(b, k)) sperren.push({ belegId: b.id, laufnummer: b.laufnummer, grund: `${belegnummer(b.laufnummer)}: ${grund}` })
  const stapel = mitBuchungsstapel(k)
  const summen = summenJeSteuersatz(belege)
  return {
    monat,
    nachtragNr: naechsteNachtragNr(monat, laeufe),
    belege,
    nurBeleg: belege.filter((b) => b.kontierung?.nurBeleg),
    anzahlJeStatus,
    offen: imMonat.filter((b) => b.status === 'eingegangen' || b.status === 'geprueft' || b.status === 'kontiert'),
    sperren,
    summen,
    summeBruttoCent: summen.reduce((n, s) => n + s.bruttoCent, 0),
    buchungen: stapel ? belege.flatMap((b) => buchungenFuer(b, k)) : [],
    mitBuchungsstapel: stapel,
  }
}

/** Kurzer Text einer Steuersumme, z. B. „S 19 %: 688,88 €“. */
export function steuersummeText(s: Steuersumme): string {
  return `${s.kategorie} ${s.satz} %: ${formatBetrag(s.bruttoCent)}`
}
