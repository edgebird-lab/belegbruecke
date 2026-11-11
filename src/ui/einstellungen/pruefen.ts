/** Hilfen der Einstellungsformulare: Speichern und Prüfung der Eingaben (ohne Komponenten). */
import { STEUERFALL_TEXT } from '../../fach/kontierung.ts'
import type { DatevEinstellungen, Einstellungen, Firma, Steuerfall } from '../../fach/typen.ts'
import { api, type EinstellungenAntwort } from '../api.ts'

export const STEUERFAELLE: Steuerfall[] = ['vorsteuer-19', 'vorsteuer-7', 'ohne-vorsteuer', 'sonderfall']

/** Antwort des Servers ohne die Zusatzangabe `passwortGesetzt` (die PUT-Prüfung ist streng). */
export function alsEinstellungen(a: EinstellungenAntwort): Einstellungen {
  const { passwortGesetzt: _weg, ...rest } = a
  void _weg
  return rest
}

/** Einstellungen speichern: leere optionale Angaben weglassen. */
export async function speichereEinstellungen(e: Einstellungen): Promise<EinstellungenAntwort> {
  const firma: Firma = { ...e.firma, ustId: e.firma.ustId?.trim() || undefined, steuernummer: e.firma.steuernummer?.trim() || undefined }
  return api<EinstellungenAntwort>('/einstellungen', { methode: 'PUT', daten: { ...e, firma } })
}

export type Fehlerliste = Partial<Record<string, string>>

export function firmaFehler(f: Firma): Fehlerliste {
  const fehler: Fehlerliste = {}
  if (!f.name.trim()) fehler.name = 'Der Name der Firma fehlt.'
  if (!f.anschrift.ort?.trim()) fehler.ort = 'Der Ort fehlt.'
  if (!/^[A-Z]{2}$/.test(f.anschrift.land ?? '')) fehler.land = 'Ländercode mit zwei Großbuchstaben, z. B. DE.'
  if (f.ustId?.trim() && !/^[A-Z]{2}[A-Z0-9]{2,13}$/.test(f.ustId.trim())) fehler.ustId = 'USt-IdNr. ohne Leerzeichen, z. B. DE123456789.'
  return fehler
}

export function kanzleiFehler(d: DatevEinstellungen): Fehlerliste {
  const fehler: Fehlerliste = {}
  const ganz = (n: number, von: number, bis: number) => Number.isSafeInteger(n) && n >= von && n <= bis
  if (!ganz(d.beraternummer, 1001, 9999999)) fehler.beraternummer = 'Beraternummer zwischen 1001 und 9999999.'
  if (!ganz(d.mandantennummer, 1, 99999)) fehler.mandantennummer = 'Mandantennummer zwischen 1 und 99999.'
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d.wjBeginnMonatTag)) fehler.wj = 'Format MM-TT, z. B. 01-01 für den 1. Januar.'
  const stellen = d.sachkontenlaenge + 1
  if (!ganz(d.kreditorenVon, 10 ** (stellen - 1), 10 ** stellen - 1)) fehler.kreditorenVon = `Kreditorenkonten haben ${stellen} Stellen (Sachkontenlänge + 1).`
  if (!ganz(d.kreditorenBis, 10 ** (stellen - 1), 10 ** stellen - 1)) fehler.kreditorenBis = `Kreditorenkonten haben ${stellen} Stellen (Sachkontenlänge + 1).`
  else if (d.kreditorenBis < d.kreditorenVon) fehler.kreditorenBis = '„bis“ muss mindestens so groß sein wie „von“.'
  if (d.exportiertVon.length > 25) fehler.exportiertVon = 'Höchstens 25 Zeichen.'
  return fehler
}

/** E3 prüft: jeder Steuerfall außer „sonderfall“ hat einen Schlüssel oder ist bewusst leer. */
export function steuerschluesselFehler(wert: DatevEinstellungen['buSchluessel'], bewusstLeer: Record<Steuerfall, boolean>): string | null {
  const offen = STEUERFAELLE.filter((f) => f !== 'sonderfall' && !wert[f] && !bewusstLeer[f])
  return offen.length ? `Tragen Sie einen BU-Schlüssel ein oder setzen Sie „bewusst leer“: ${offen.map((f) => STEUERFALL_TEXT[f]).join(', ')}.` : null
}

