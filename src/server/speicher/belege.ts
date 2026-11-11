/**
 * Belege in der Datenbank: vollständiger Beleg als JSON, Such- und Schlüsselfelder als Spalten.
 */
import type { Dublettenmerkmale } from '../../fach/dubletten.ts'
import { formatBezeichnung } from '../../fach/formaterkennung.ts'
import { lieferantenschluessel, schluesselHand } from '../../fach/lieferant.ts'
import type { Beleg, Belegstatus, Uuid } from '../../fach/typen.ts'
import type { Datenbank } from './db.ts'

export interface Belegfilter {
  status?: Belegstatus
  /** nur offene Belege (eingegangen, geprüft, kontiert) */
  offen?: boolean
  monat?: string
  /** Volltext in Namen, E-Mail, Nummer und Dateiname */
  suche?: string
  /** Belegdatum von, bis (ISO, je einschließlich) */
  von?: string
  bis?: string
  /** Bruttobetrag in Cent */
  bruttoCent?: number
}

/** Der Beleg wurde zwischen Lesen und Schreiben geändert (optimistische Sperre in `aktualisieren`). */
export class BelegGeaendert extends Error {
  readonly belegId: string

  constructor(belegId: string) {
    super(`Beleg ${belegId} wurde inzwischen geändert`)
    this.name = 'BelegGeaendert'
    this.belegId = belegId
  }
}

/** Belegdatum (BT-2 bzw. Handerfassung) für die Monatsgruppierung (R21). */
export function belegdatum(b: Beleg): string | null {
  return b.handerfassung?.rechnungsdatum ?? b.daten?.rechnungsdatum ?? null
}

export function schluesselVon(b: Beleg): string | null {
  if (b.handerfassung) return schluesselHand(b.handerfassung)
  return b.daten ? lieferantenschluessel(b.daten) : null
}

/** Volltext für die Archivsuche und Auskunftsersuchen: Namen, E-Mail, Nummer, Dateiname. */
function suchtext(b: Beleg): string {
  const d = b.daten
  const teile = [
    b.original.dateiname,
    d?.rechnungsnummer,
    d?.verkaeufer.name,
    d?.verkaeufer.handelsname,
    d?.verkaeufer.email,
    d?.kaeufer.name,
    d?.kaeufer.email,
    b.handerfassung?.lieferantName,
    b.handerfassung?.rechnungsnummer,
    b.quelle.art === 'imap' ? b.quelle.absender : null,
  ]
  return teile
    .filter((t): t is string => !!t)
    .join(' ')
    .toLowerCase()
}

function spalten(b: Beleg, jetzt: string) {
  const datum = belegdatum(b)
  return {
    id: b.id,
    laufnummer: b.laufnummer,
    status: b.status,
    eingang_am: b.eingangAm,
    original_sha256: b.original.sha256,
    xml_sha256: b.format.xmlSha256,
    belegart: b.format.belegart,
    lieferant_schluessel: schluesselVon(b),
    lieferant_id: b.lieferantId,
    rechnungsnummer: b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? null,
    rechnungsdatum: datum,
    brutto_cent: b.handerfassung?.bruttoCent ?? b.daten?.summen.bruttoCent ?? null,
    monat: datum && /^\d{4}-\d{2}/.test(datum) ? datum.slice(0, 7) : null,
    suche: suchtext(b),
    exportlauf_id: b.exportlaufId,
    json: JSON.stringify(b),
    geaendert_am: jetzt,
  }
}

export class Belegspeicher {
  private readonly db: Datenbank

  constructor(db: Datenbank) {
    this.db = db
  }

  naechsteLaufnummer(): number {
    return (this.db.eins<{ n: number | null }>('SELECT max(laufnummer) AS n FROM belege')!.n ?? 0) + 1
  }

  einfuegen(b: Beleg, jetzt: string): void {
    const s = spalten(b, jetzt)
    this.db.aendern(
      `INSERT INTO belege (id, laufnummer, status, eingang_am, original_sha256, xml_sha256, belegart, lieferant_schluessel, lieferant_id, rechnungsnummer, rechnungsdatum, brutto_cent, monat, suche, exportlauf_id, json, geaendert_am)
       VALUES ($id, $laufnummer, $status, $eingang_am, $original_sha256, $xml_sha256, $belegart, $lieferant_schluessel, $lieferant_id, $rechnungsnummer, $rechnungsdatum, $brutto_cent, $monat, $suche, $exportlauf_id, $json, $geaendert_am)`,
      s,
    )
  }

  /**
   * Schreibt den Beleg. Mit `vorher` (dem gelesenen Stand) nur, wenn sich der Beleg seitdem nicht
   * geändert hat; sonst `BelegGeaendert`. So überschreibt eine zweite Anfrage (zweites Fenster,
   * Doppelklick, zweiter Benutzer) nie still einen neueren Stand.
   */
  aktualisieren(b: Beleg, jetzt: string, vorher?: Beleg): void {
    const s = spalten(b, jetzt)
    const r = this.db.aendern(
      `UPDATE belege SET status = $status, xml_sha256 = $xml_sha256, belegart = $belegart, lieferant_schluessel = $lieferant_schluessel, lieferant_id = $lieferant_id,
       rechnungsnummer = $rechnungsnummer, rechnungsdatum = $rechnungsdatum, brutto_cent = $brutto_cent, monat = $monat, suche = $suche, exportlauf_id = $exportlauf_id,
       json = $json, geaendert_am = $geaendert_am WHERE id = $id${vorher ? ' AND json = $vorher' : ''}`,
      {
        id: s.id,
        status: s.status,
        xml_sha256: s.xml_sha256,
        belegart: s.belegart,
        lieferant_schluessel: s.lieferant_schluessel,
        lieferant_id: s.lieferant_id,
        rechnungsnummer: s.rechnungsnummer,
        rechnungsdatum: s.rechnungsdatum,
        brutto_cent: s.brutto_cent,
        monat: s.monat,
        suche: s.suche,
        exportlauf_id: s.exportlauf_id,
        json: s.json,
        geaendert_am: s.geaendert_am,
        ...(vorher ? { vorher: JSON.stringify(vorher) } : {}),
      },
    )
    if (r.changes !== 1) {
      if (vorher && this.hole(b.id)) throw new BelegGeaendert(b.id)
      throw new Error(`Beleg ${b.id} nicht gefunden`)
    }
  }

  hole(id: Uuid): Beleg | null {
    const z = this.db.eins<{ json: string }>('SELECT json FROM belege WHERE id = ?', [id])
    return z ? (JSON.parse(z.json) as Beleg) : null
  }

  mitOriginalHash(sha256: string): { id: Uuid; laufnummer: number } | null {
    return this.db.eins<{ id: Uuid; laufnummer: number }>('SELECT id, laufnummer FROM belege WHERE original_sha256 = ?', [sha256]) ?? null
  }

  liste(filter: Belegfilter = {}): Beleg[] {
    const bedingungen: string[] = []
    const p: Record<string, string | number> = {}
    if (filter.status) {
      bedingungen.push('status = $status')
      p.status = filter.status
    }
    if (filter.offen) bedingungen.push("status IN ('eingegangen', 'geprueft', 'kontiert')")
    if (filter.von) {
      bedingungen.push('rechnungsdatum >= $von')
      p.von = filter.von
    }
    if (filter.bis) {
      bedingungen.push('rechnungsdatum <= $bis')
      p.bis = filter.bis
    }
    if (filter.bruttoCent !== undefined) {
      bedingungen.push('(brutto_cent = $brutto OR brutto_cent = -$brutto)')
      p.brutto = filter.bruttoCent
    }
    if (filter.monat) {
      bedingungen.push('monat = $monat')
      p.monat = filter.monat
    }
    if (filter.suche) {
      bedingungen.push("(suche LIKE $suche ESCAPE '\\' OR rechnungsnummer LIKE $suche ESCAPE '\\')")
      p.suche = `%${filter.suche.toLowerCase().replace(/[\\%_]/g, (z) => `\\${z}`)}%`
    }
    const wo = bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : ''
    return this.db.alle<{ json: string }>(`SELECT json FROM belege ${wo} ORDER BY laufnummer DESC`, p).map((z) => JSON.parse(z.json) as Beleg)
  }

  /** Zähler für die Navigation: offene Belege und freigegebene, noch nicht übergebene. */
  zaehler(): { offen: number; freigegeben: number } {
    const z = this.db.eins<{ offen: number; freigegeben: number }>(
      "SELECT coalesce(sum(status IN ('eingegangen', 'geprueft', 'kontiert')), 0) AS offen, coalesce(sum(status = 'freigegeben'), 0) AS freigegeben FROM belege",
    )!
    return { offen: z.offen, freigegeben: z.freigegeben }
  }

  /** Merkmale aller Belege für die Dublettenprüfung (R9); abgelehnte zählen mit. */
  dublettenMerkmale(): Dublettenmerkmale[] {
    return this.liste().map((b) => merkmaleVon(b))
  }
}

export function merkmaleVon(b: Beleg): Dublettenmerkmale {
  return {
    id: b.id,
    laufnummer: b.laufnummer,
    originalSha256: b.original.sha256,
    xmlSha256: b.format.xmlSha256,
    lieferantSchluessel: schluesselVon(b),
    rechnungsnummer: b.handerfassung?.rechnungsnummer ?? b.daten?.rechnungsnummer ?? null,
    typcode: b.daten?.typcode ?? (b.handerfassung ? '380' : null),
    rechnungsdatum: belegdatum(b),
    bruttoCent: b.handerfassung?.bruttoCent ?? b.daten?.summen.bruttoCent ?? null,
    zahlbetragCent: b.daten?.summen.zahlbetragCent ?? b.handerfassung?.bruttoCent ?? null,
    format: formatBezeichnung(b.format),
  }
}
