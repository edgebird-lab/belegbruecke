/** Lieferantenschlüssel, Lieferantenvorschlag und Kreditorenkonto (R10). */
import { normName } from './pflichtangaben.ts'
import type { Anschrift, DatevEinstellungen, Handerfassung, Lieferant, Rechnungsdaten } from './typen.ts'

/**
 * R10 Punkt 1: `ustid:` + BT-31 ohne Leerraum in Großbuchstaben, sonst `stnr:` + Ziffern aus BT-32,
 * sonst `name:` + normName(BT-27) + `|` + BT-38. Bei BT-3 = 389 ist der Verkäufer die eigene
 * Firma; dann bildet der Käufer den Schlüssel (BT-48, sonst normName(BT-44) + `|` + BT-53).
 */
export function lieferantenschluessel(d: Rechnungsdaten): string {
  if (d.typcode === '389') {
    const k = d.kaeufer
    if (k.ustId) return `ustid:${k.ustId.replace(/\s+/g, '').toUpperCase()}`
    return `name:${normName(k.name)}|${(k.anschrift.plz ?? '').trim()}`
  }
  const v = d.verkaeufer
  if (v.ustId) return `ustid:${v.ustId.replace(/\s+/g, '').toUpperCase()}`
  const ziffern = (v.steuernummer ?? '').replace(/\D/g, '')
  if (ziffern) return `stnr:${ziffern}`
  return `name:${normName(v.name)}|${(v.anschrift.plz ?? '').trim()}`
}

/** Schlüssel für eine Erfassung von Hand; ohne Postleitzahl, weil sie nicht erfasst wird. */
export function schluesselHand(h: Handerfassung): string {
  if (h.lieferantUstId) return `ustid:${h.lieferantUstId.replace(/\s+/g, '').toUpperCase()}`
  const ziffern = (h.lieferantSteuernummer ?? '').replace(/\D/g, '')
  if (ziffern) return `stnr:${ziffern}`
  return `name:${normName(h.lieferantName)}|`
}

export type NeuerLieferant = Pick<Lieferant, 'schluessel' | 'name' | 'ustId' | 'steuernummer' | 'anschrift'>

export interface Lieferantenvorschlag {
  schluessel: string
  vorhanden: Lieferant | null
  neu: NeuerLieferant
}

/** R10 Punkt 2: vorhandenen Lieferanten mit gleichem Schlüssel vorschlagen, sonst einen neuen aus dem Beleg. */
export function lieferantVorschlagen(d: Rechnungsdaten, lieferanten: readonly Lieferant[]): Lieferantenvorschlag {
  const schluessel = lieferantenschluessel(d)
  const partei = d.typcode === '389' ? d.kaeufer : d.verkaeufer
  const anschrift: Anschrift = { ...partei.anschrift }
  return {
    schluessel,
    vorhanden: lieferanten.find((l) => l.schluessel === schluessel) ?? null,
    neu: { schluessel, name: partei.name, ustId: partei.ustId, steuernummer: partei.steuernummer, anschrift },
  }
}

type Kreis = Pick<DatevEinstellungen, 'sachkontenlaenge' | 'kreditorenVon' | 'kreditorenBis'>

/** R10 Punkt 3: größtes vergebenes Konto + 1, sonst Beginn des Kreises; null, wenn der Kreis voll ist. */
export function naechstesKreditorenkonto(vergeben: readonly number[], kreis: Kreis): number | null {
  const imKreis = vergeben.filter((k) => k >= kreis.kreditorenVon && k <= kreis.kreditorenBis)
  const naechstes = imKreis.length ? Math.max(...imKreis) + 1 : kreis.kreditorenVon
  return naechstes <= kreis.kreditorenBis ? naechstes : null
}

/** Prüfung eines vom Benutzer gewählten Kreditorenkontos; liefert den Fehler in Klartext oder null. */
export function pruefeKreditorenkonto(konto: number, vergebenAnAndere: readonly number[], kreis: Kreis): string | null {
  if (!Number.isSafeInteger(konto) || konto <= 0) return 'Das Kreditorenkonto muss eine positive ganze Zahl sein.'
  const stellen = kreis.sachkontenlaenge + 1
  if (String(konto).length !== stellen) return `Das Kreditorenkonto muss ${stellen} Stellen haben (Sachkontenlänge ${kreis.sachkontenlaenge} + 1).`
  if (konto < kreis.kreditorenVon || konto > kreis.kreditorenBis) return `Das Kreditorenkonto muss zwischen ${kreis.kreditorenVon} und ${kreis.kreditorenBis} liegen.`
  if (vergebenAnAndere.includes(konto)) return `Das Kreditorenkonto ${konto} ist schon einem anderen Lieferanten zugeordnet.`
  return null
}
