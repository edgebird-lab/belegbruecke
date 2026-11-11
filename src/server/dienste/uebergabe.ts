/**
 * Monatsübergabe (R19 bis R21, Übergabe-Assistent U1 bis U4): Lauf planen, Dateien erzeugen
 * (EXTF-Stapel, Belegpaket), schreibgeschützt unter exporte/<lauf-id>/ ablegen, Belege auf
 * „exportiert“ setzen, Protokoll mit Dateien und Belegliste; der letzte Eintrag ist der Kettenanker.
 */
import { randomUUID } from 'node:crypto'
import { belegpaket, belegpaketName, type Paketbeleg } from '../../fach/datev/belegpaket.ts'
import { extfDatei } from '../../fach/datev/extf.ts'
import { planeUebergabe, type Sperre, type Uebergabekontext, type Uebergabeplan } from '../../fach/uebergabe.ts'
import type { Akteur, Beleg, Exportlauf } from '../../fach/typen.ts'
import { BelegGeaendert } from '../speicher/belege.ts'
import { ansichtHtml, letzterBericht } from './ansicht.ts'
import type { Dienste } from './kontext.ts'

export function uebergabekontext(d: Dienste): Uebergabekontext {
  return { einstellungen: d.einstellungen.lies(), lieferanten: d.lieferanten.alle(), sachkonten: d.sachkonten.alle() }
}

export function plane(d: Dienste, monat: string): Uebergabeplan {
  return planeUebergabe(monat, d.belege.liste(), d.exporte.alle(), uebergabekontext(d))
}

export type Uebergabeergebnis = { ok: true; lauf: Exportlauf } | { ok: false; status: 409; code: string; text: string; sperren: Sperre[] }

const ENDUNG = { 'application/xml': 'xml', 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' } as const

async function paketbeleg(d: Dienste, b: Beleg): Promise<Paketbeleg> {
  const lieferant = b.lieferantId ? d.lieferanten.hole(b.lieferantId) : null
  const bericht = letzterBericht(d, b.id)
  const kt = b.kontierung
  return {
    laufnummer: b.laufnummer,
    belegId: b.id,
    lieferant: lieferant?.name ?? b.handerfassung?.lieferantName ?? b.daten?.verkaeufer.name ?? '',
    rechnungsnummer: b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? '',
    rechnungsdatum: b.handerfassung?.rechnungsdatum ?? b.daten?.rechnungsdatum ?? '',
    bruttoCent: b.handerfassung?.bruttoCent ?? b.daten?.summen.bruttoCent ?? 0,
    konto: kt?.nurBeleg ? null : (lieferant?.kreditorKonto ?? null),
    gegenkonten: [...new Set((kt?.zeilen ?? []).map((z) => z.sachkonto).filter((k): k is number => k !== null))],
    sha256: b.original.sha256,
    dateiname: b.original.dateiname,
    endung: ENDUNG[b.original.mimeTyp],
    original: await d.ablage.lies(b.original.speicherpfad),
    ansicht: await ansichtHtml(d, b),
    pruefbericht: bericht ? new TextDecoder().decode(await d.ablage.lies(bericht)) : null,
  }
}

/** Läufe, die gerade entstehen; je Server nur einer gleichzeitig (Doppelklick, zwei Benutzer). */
const laufend = new WeakSet<Dienste>()

/** U3: Lauf erzeugen. Bricht mit den Sperrgründen ab (R19), wenn ein Beleg nicht übergeben werden kann. */
export async function erzeugeUebergabe(d: Dienste, monat: string, akteur: Akteur): Promise<Uebergabeergebnis> {
  if (laufend.has(d)) return { ok: false, status: 409, code: 'LAEUFT', text: 'Eine Übergabe wird gerade erzeugt. Bitte einen Moment warten.', sperren: [] }
  laufend.add(d)
  try {
    return await erzeugeLauf(d, monat, akteur)
  } finally {
    laufend.delete(d)
  }
}

async function erzeugeLauf(d: Dienste, monat: string, akteur: Akteur): Promise<Uebergabeergebnis> {
  const k = uebergabekontext(d)
  const plan = planeUebergabe(monat, d.belege.liste(), d.exporte.alle(), k)
  if (plan.belege.length === 0) return { ok: false, status: 409, code: 'KEINE-BELEGE', text: `Für ${monat} gibt es keine freigegebenen, noch nicht übergebenen Belege.`, sperren: [] }
  if (plan.sperren.length) return { ok: false, status: 409, code: 'GESPERRT', text: 'Die Übergabe ist gesperrt. Beheben Sie zuerst die genannten Gründe.', sperren: plan.sperren }
  const datev = k.einstellungen.datev
  const id = randomUUID().toUpperCase()
  const erzeugtAm = d.uhr()
  const dateien: { name: string; bytes: Uint8Array }[] = []
  const hinweise: string[] = []
  if (plan.mitBuchungsstapel && plan.buchungen.length) {
    const extf = extfDatei({ erzeugtAm, datev, monat, nachtragNr: plan.nachtragNr }, plan.buchungen)
    dateien.push({ name: extf.name, bytes: extf.bytes })
    hinweise.push(...extf.hinweise)
  } else if (plan.mitBuchungsstapel) hinweise.push('Keine Buchungszeile in diesem Lauf, deshalb keine EXTF-Datei.')
  const paket: Paketbeleg[] = []
  for (const b of plan.belege) paket.push(await paketbeleg(d, b))
  dateien.push({ name: belegpaketName(monat, plan.nachtragNr), bytes: belegpaket(paket, erzeugtAm) })

  const abgelegt: { name: string; sha256: string; pfad: string; bytes: number }[] = []
  for (const f of dateien) abgelegt.push({ ...(await d.ablage.speichereExport(id, f.name, f.bytes)), name: f.name })
  const jetzt = erzeugtAm.toISOString()
  const lauf: Exportlauf = {
    formatVersion: 1,
    id,
    monat,
    nachtragNr: plan.nachtragNr,
    erzeugtAm: jetzt,
    benutzerId: akteur.art === 'benutzer' ? akteur.id : '00000000-0000-4000-8000-000000000000',
    belegIds: plan.belege.map((b) => b.id),
    dateien: abgelegt.map((f) => ({ name: f.name, sha256: f.sha256, bytes: f.bytes })),
    summeBruttoCent: plan.summeBruttoCent,
    summenJeSteuersatz: plan.summen,
    kettenanker: { nr: 0, hash: '' },
    beraternummer: datev.beraternummer,
    mandantennummer: datev.mandantennummer,
    exportmodus: datev.exportmodus,
    nurBelegIds: plan.nurBeleg.map((b) => b.id),
    hinweise,
  }
  const schreibeLauf = () => {
    for (const f of abgelegt) {
      d.db.aendern('INSERT INTO dateien (pfad, sha256, art, mime_typ, bytes, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [f.pfad, f.sha256, 'export', f.name.endsWith('.zip') ? 'application/zip' : 'text/csv', f.bytes, jetzt])
    }
    for (const b of plan.belege) {
      d.belege.aktualisieren({ ...b, status: 'exportiert', exportlaufId: id }, jetzt, b)
      d.protokoll.anhaengen({ akteur, aktion: 'exportiert', belegId: b.id, daten: { exportlaufId: id, monat, nachtragNr: plan.nachtragNr } })
    }
    // Eintrag des Laufs mit Dateien und Belegliste (R17 Punkt 5); er ist der Kettenanker (R17 Punkt 8)
    const anker = d.protokoll.anhaengen({
      akteur,
      aktion: 'exportiert',
      belegId: null,
      daten: {
        exportlaufId: id,
        monat,
        nachtragNr: plan.nachtragNr,
        exportmodus: datev.exportmodus,
        beraternummer: datev.beraternummer,
        mandantennummer: datev.mandantennummer,
        dateien: lauf.dateien,
        belege: lauf.belegIds,
        nurBeleg: lauf.nurBelegIds ?? [],
        summeBruttoCent: lauf.summeBruttoCent,
      },
    })
    lauf.kettenanker = { nr: anker.nr, hash: anker.hash }
    d.exporte.anlegen(lauf)
  }
  const stand = planStand(plan, k)
  try {
    d.db.transaktion(() => {
      // Während die Dateien entstanden (Ansicht im Worker, Lesen der Originale), konnte eine andere Anfrage
      // einen Beleg, einen Lieferanten oder die Einstellungen ändern. Dann passen die Dateien nicht mehr.
      const frischK = uebergabekontext(d)
      if (planStand(planeUebergabe(monat, d.belege.liste(), d.exporte.alle(), frischK), frischK) !== stand) throw new BelegGeaendert('uebergabe')
      schreibeLauf()
    })
  } catch (e) {
    if (!(e instanceof BelegGeaendert)) throw e
    // Die Dateien sind nirgends verbucht; sie gehören zu keinem Lauf
    for (const f of abgelegt) await d.ablage.verwerfeUnverbucht(f.pfad)
    return { ok: false, status: 409, code: 'GEAENDERT', text: 'Während die Dateien entstanden, hat sich ein Beleg, ein Lieferant oder eine Einstellung geändert. Prüfen Sie die Übergabe und erzeugen Sie sie noch einmal.', sperren: [] }
  }
  return { ok: true, lauf }
}

/** Was den Inhalt der Dateien eines Laufs bestimmt: Belege, Nachtragsnummer, Sperren, Buchungen, DATEV-Kopfdaten. */
function planStand(plan: Uebergabeplan, k: Uebergabekontext): string {
  return JSON.stringify({ belege: plan.belege, nachtragNr: plan.nachtragNr, sperren: plan.sperren, buchungen: plan.buchungen, datev: k.einstellungen.datev })
}
