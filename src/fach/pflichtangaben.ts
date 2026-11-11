/**
 * Pflichtangaben nach § 14 Abs. 4 UStG bzw. §§ 33, 34a UStDV (R8) und Prüfung, ob die eigene
 * Firma Empfänger ist. Läuft auf den ausgelesenen Rechnungsdaten, auch wenn die Schematron-
 * Prüfung Fehler meldet, und auf der Erfassung von Hand (R16).
 */
import { befund } from './befunde.ts'
import { istGueltigesDatum } from './datum.ts'
import type { Befund, Firma, Handerfassung, Pflichtangabe, Pflichtangabenpruefung, Rechnungsdaten, Steuerzeile } from './typen.ts'

type Status = Pflichtangabenpruefung['ergebnisse'][number]['status']
type Ergebnis = Pflichtangabenpruefung['ergebnisse'][number]
type Regelwerk = Pflichtangabenpruefung['regelwerk']

export const KLEINBETRAG_GRENZE_CENT = 25_000

const REGEL_ID: Record<Pflichtangabe, string> = {
  'name-anschrift-leistender': 'USTG-14-4-1-LEISTENDER',
  'name-anschrift-empfaenger': 'USTG-14-4-1-EMPFAENGER',
  'steuernummer-oder-ustid': 'USTG-14-4-2',
  ausstellungsdatum: 'USTG-14-4-3',
  rechnungsnummer: 'USTG-14-4-4',
  'menge-und-art': 'USTG-14-4-5',
  leistungszeitpunkt: 'USTG-14-4-6',
  'entgelt-nach-steuersaetzen': 'USTG-14-4-7',
  'steuersatz-und-betrag': 'USTG-14-4-8',
  'angabe-gutschrift': 'USTG-14-4-10',
}

export const ANGABE_TEXT: Record<Pflichtangabe, string> = {
  'name-anschrift-leistender': 'Name und Anschrift des Leistenden',
  'name-anschrift-empfaenger': 'Name und Anschrift des Empfängers',
  'steuernummer-oder-ustid': 'Steuernummer oder USt-IdNr. des Leistenden',
  ausstellungsdatum: 'Ausstellungsdatum',
  rechnungsnummer: 'Rechnungsnummer',
  'menge-und-art': 'Menge und Art der Leistung',
  leistungszeitpunkt: 'Zeitpunkt der Leistung',
  'entgelt-nach-steuersaetzen': 'Entgelt nach Steuersätzen',
  'steuersatz-und-betrag': 'Steuersatz und Steuerbetrag oder Hinweis auf eine Befreiung',
  'angabe-gutschrift': 'Angabe „Gutschrift“',
}

const NR: Record<Pflichtangabe, string> = {
  'name-anschrift-leistender': '1',
  'name-anschrift-empfaenger': '1',
  'steuernummer-oder-ustid': '2',
  ausstellungsdatum: '3',
  rechnungsnummer: '4',
  'menge-und-art': '5',
  leistungszeitpunkt: '6',
  'entgelt-nach-steuersaetzen': '7',
  'steuersatz-und-betrag': '8',
  'angabe-gutschrift': '10',
}

const BEFREIT = new Set(['E', 'AE', 'K', 'G', 'O'])
const MIT_SATZ = new Set(['S', 'L', 'M'])

const gefuellt = (s: string | null | undefined): boolean => !!s && s.trim() !== ''

// ---------- Name und Firma ----------

const RECHTSFORMEN = new Set(['gmbh', 'mbh', 'ug', 'haftungsbeschrankt', 'haftungsbeschraenkt', 'ag', 'kg', 'ohg', 'gbr', 'ek'])

/** normName (R8): klein, NFKD ohne Akzente, Rechtsformen entfernt, dann nur a–z0–9. */
export function normName(name: string): string {
  const woerter = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const ohne: string[] = []
  for (let i = 0; i < woerter.length; i++) {
    if (woerter[i] === 'e' && woerter[i + 1] === 'k') {
      i++
      continue
    }
    if (!RECHTSFORMEN.has(woerter[i])) ohne.push(woerter[i])
  }
  return ohne.join('')
}

/** Eigene Firma als Empfänger (bei Typ 389 als Verkäufer). Ohne eingerichtete Firma: unklar. */
export function eigeneFirmaPruefen(daten: Rechnungsdaten, firma: Firma | null): { ergebnis: 'ja' | 'nein' | 'unklar'; befunde: Befund[] } {
  if (!firma || !gefuellt(firma.name)) return { ergebnis: 'unklar', befunde: [] }
  const gutschrift = daten.typcode === '389'
  const partei = gutschrift ? daten.verkaeufer : daten.kaeufer
  const ustIdFirma = firma.ustId?.replace(/\s+/g, '').toUpperCase() ?? null
  if (ustIdFirma && partei.ustId && partei.ustId.toUpperCase() === ustIdFirma) return { ergebnis: 'ja', befunde: [] }
  const namen = new Set([firma.name, ...firma.namensVarianten].map(normName).filter(Boolean))
  if (namen.has(normName(partei.name)) || (partei.handelsname && namen.has(normName(partei.handelsname)))) return { ergebnis: 'ja', befunde: [] }
  const rolle = gutschrift ? 'Aussteller der Gutschrift (Verkäufer)' : 'Rechnungsempfänger'
  return {
    ergebnis: 'nein',
    befunde: [
      befund('USTG-EMPFAENGER', {
        quelle: 'ustg',
        stufe: 'warnung',
        fehlerklasse: 'keine',
        ustRelevant: true,
        btBezug: gutschrift ? ['BT-27', 'BT-31'] : ['BT-44', 'BT-48'],
        klartext: `Als ${rolle} steht „${partei.name}“, nicht Ihre Firma „${firma.name}“. Eine Rechnung an einen anderen Empfänger berechtigt Sie nicht zum Vorsteuerabzug.`,
        handlung: 'Prüfen, ob die Rechnung an Sie gerichtet ist; sonst korrigierte Rechnung anfordern oder Namensvariante in den Einstellungen ergänzen.',
      }),
    ],
  }
}

// ---------- Regelwerk ----------

function istKleinbetrag(bruttoCent: number, steuern: { kategorie: string }[]): boolean {
  return bruttoCent <= KLEINBETRAG_GRENZE_CENT && !steuern.some((s) => s.kategorie === 'AE' || s.kategorie === 'K')
}

/** § 34a UStDV, Heuristik: alle Steuerzeilen Kategorie E und ein Befreiungsgrund nennt § 19 oder Kleinunternehmer. */
function istKleinunternehmer(steuern: Steuerzeile[]): boolean {
  return steuern.length > 0 && steuern.every((s) => s.kategorie === 'E') && steuern.some((s) => /§\s*19\b|kleinunternehmer/i.test(s.befreiungsgrund ?? ''))
}

function nrAcht(steuern: { kategorie: string; satz: string; befreiungsgrund?: string | null; befreiungsCode?: string | null }[]): Status {
  if (steuern.length === 0) return 'fehlt'
  let status: Status = 'erfuellt'
  for (const s of steuern) {
    if (MIT_SATZ.has(s.kategorie)) {
      if (!gefuellt(s.satz)) return 'fehlt'
    } else if (BEFREIT.has(s.kategorie)) {
      if (!gefuellt(s.befreiungsgrund) && !gefuellt(s.befreiungsCode)) return 'fehlt'
    } else {
      // Z (Nullsatz) und Unbekanntes: von Hand prüfen
      status = 'pruefen'
    }
  }
  return status
}

function anschriftVollstaendig(p: Rechnungsdaten['verkaeufer'], strasseUndPlz: boolean): boolean {
  const a = p.anschrift
  if (!gefuellt(p.name) || !gefuellt(a.ort) || !gefuellt(a.land)) return false
  return !strasseUndPlz || (gefuellt(a.zeile1) && gefuellt(a.plz))
}

interface Bewertung {
  regelwerk: Regelwerk
  ergebnisse: Ergebnis[]
}

function bewerte(regelwerk: Regelwerk, alle: Record<Pflichtangabe, { status: Status; fundstelle: string[] }>, gilt: Set<Pflichtangabe>): Bewertung {
  const ergebnisse = (Object.keys(REGEL_ID) as Pflichtangabe[]).map((angabe) =>
    gilt.has(angabe) ? { angabe, ...alle[angabe] } : { angabe, status: 'nicht-anwendbar' as Status, fundstelle: alle[angabe].fundstelle },
  )
  return { regelwerk, ergebnisse }
}

const ALLE: Pflichtangabe[] = Object.keys(REGEL_ID) as Pflichtangabe[]
const GILT_33: Pflichtangabe[] = ['name-anschrift-leistender', 'ausstellungsdatum', 'menge-und-art', 'entgelt-nach-steuersaetzen', 'steuersatz-und-betrag']
const GILT_34A: Pflichtangabe[] = ['name-anschrift-leistender', 'name-anschrift-empfaenger', 'steuernummer-oder-ustid', 'ausstellungsdatum', 'menge-und-art', 'angabe-gutschrift']

function befundeAus(b: Bewertung, rechtsgrundlage: string): Befund[] {
  const liste: Befund[] = []
  for (const e of b.ergebnisse) {
    if (e.status !== 'fehlt' && e.status !== 'pruefen') continue
    const text = ANGABE_TEXT[e.angabe]
    const regelId = REGEL_ID[e.angabe]
    if (e.status === 'fehlt') {
      liste.push(
        befund(regelId, {
          quelle: 'ustg',
          stufe: 'fehler',
          fehlerklasse: 'inhaltsfehler',
          ustRelevant: true,
          btBezug: e.fundstelle,
          klartext: `Pflichtangabe fehlt: ${text} (${rechtsgrundlage}${b.regelwerk === '§ 14 Abs. 4 UStG' ? `, Nr. ${NR[e.angabe]}` : ''}). Vorsteuerabzug gefährdet.`,
          handlung: 'Korrigierte Rechnung anfordern; Vorsteuer nur aus einer vollständigen Rechnung.',
        }),
      )
    } else {
      const leistung = e.angabe === 'leistungszeitpunkt'
      liste.push(
        befund(regelId, {
          quelle: 'ustg',
          stufe: leistung ? 'warnung' : 'hinweis',
          fehlerklasse: 'keine',
          ustRelevant: 'unklar',
          btBezug: e.fundstelle,
          klartext: leistung
            ? `${text} steht in keinem Datenfeld (BT-72, BG-14 oder BG-26 in jeder Position); er steht evtl. nur im Bemerkungstext.`
            : `${text}: bitte von Hand prüfen.`,
          handlung: leistung ? 'Leistungszeitpunkt in der Ansicht suchen; fehlt er ganz, korrigierte Rechnung anfordern.' : 'Angabe in der Ansicht prüfen.',
        }),
      )
    }
  }
  return liste
}

export interface Pflichtangabenergebnis {
  pruefung: Pflichtangabenpruefung
  befunde: Befund[]
}

/** R8 auf den Daten einer E-Rechnung. */
export function pruefePflichtangaben(d: Rechnungsdaten, firma: Firma | null): Pflichtangabenergebnis {
  const v = d.verkaeufer
  const k = d.kaeufer
  const deV = (v.anschrift.land ?? '').toUpperCase() === 'DE'
  const deK = (k.anschrift.land ?? '').toUpperCase() === 'DE'
  const positionenMitZeitraum = d.positionen.length > 0 && d.positionen.every((p) => p.zeitraum && (p.zeitraum.von || p.zeitraum.bis))
  const alle: Record<Pflichtangabe, { status: Status; fundstelle: string[] }> = {
    'name-anschrift-leistender': { status: anschriftVollstaendig(v, deV) ? 'erfuellt' : 'fehlt', fundstelle: deV ? ['BT-27', 'BT-35', 'BT-37', 'BT-38', 'BT-40'] : ['BT-27', 'BT-37', 'BT-40'] },
    'name-anschrift-empfaenger': { status: anschriftVollstaendig(k, deK) ? 'erfuellt' : 'fehlt', fundstelle: deK ? ['BT-44', 'BT-50', 'BT-52', 'BT-53', 'BT-55'] : ['BT-44', 'BT-52', 'BT-55'] },
    'steuernummer-oder-ustid': { status: gefuellt(v.ustId) || gefuellt(v.steuernummer) || gefuellt(d.steuervertreterUstId) ? 'erfuellt' : 'fehlt', fundstelle: ['BT-31', 'BT-32', 'BT-63'] },
    ausstellungsdatum: { status: istGueltigesDatum(d.rechnungsdatum) ? 'erfuellt' : 'fehlt', fundstelle: ['BT-2'] },
    rechnungsnummer: { status: gefuellt(d.rechnungsnummer) ? 'erfuellt' : 'fehlt', fundstelle: ['BT-1'] },
    'menge-und-art': { status: d.positionen.some((p) => gefuellt(p.bezeichnung) && gefuellt(p.menge)) ? 'erfuellt' : 'fehlt', fundstelle: ['BT-153', 'BT-129'] },
    leistungszeitpunkt: { status: gefuellt(d.lieferdatum) || !!d.abrechnungszeitraum || positionenMitZeitraum ? 'erfuellt' : 'pruefen', fundstelle: ['BT-72', 'BG-14', 'BG-26'] },
    'entgelt-nach-steuersaetzen': { status: d.steuern.length > 0 ? 'erfuellt' : 'fehlt', fundstelle: ['BG-23', 'BT-116'] },
    'steuersatz-und-betrag': { status: nrAcht(d.steuern), fundstelle: ['BT-119', 'BT-117', 'BT-120', 'BT-121'] },
    'angabe-gutschrift': {
      status: d.typcode === '389' ? (d.bemerkungen.some((b) => /gutschrift/i.test(b)) ? 'erfuellt' : 'pruefen') : 'nicht-anwendbar',
      fundstelle: ['BT-3', 'BT-22'],
    },
  }
  let bewertung: Bewertung
  let rechtsgrundlage: string
  const zusatz: Befund[] = []
  if (istKleinbetrag(d.summen.bruttoCent, d.steuern)) {
    bewertung = bewerte('§ 33 UStDV', alle, new Set(GILT_33))
    rechtsgrundlage = '§ 33 UStDV'
  } else if (istKleinunternehmer(d.steuern)) {
    bewertung = bewerte('§ 34a UStDV', alle, new Set(GILT_34A))
    rechtsgrundlage = '§ 34a UStDV'
    zusatz.push(
      befund('USTDV-34A', {
        quelle: 'ustg',
        stufe: 'hinweis',
        fehlerklasse: 'keine',
        ustRelevant: 'unklar',
        btBezug: ['BT-118', 'BT-120'],
        klartext: 'Rechnung eines Kleinunternehmers erkannt (alle Steuerzeilen steuerfrei mit Hinweis auf § 19 UStG); es gelten die Pflichtangaben nach § 34a UStDV. Die Erkennung ist eine Heuristik.',
        handlung: 'Prüfen, ob der Lieferant Kleinunternehmer ist; eine solche Rechnung berechtigt nicht zum Vorsteuerabzug.',
      }),
    )
  } else {
    bewertung = bewerte('§ 14 Abs. 4 UStG', alle, new Set(ALLE))
    rechtsgrundlage = '§ 14 Abs. 4 Satz 1 UStG'
  }
  const empfaenger = eigeneFirmaPruefen(d, firma)
  return {
    pruefung: { regelwerk: bewertung.regelwerk, ergebnisse: bewertung.ergebnisse, eigeneFirmaAlsEmpfaenger: empfaenger.ergebnis },
    befunde: [...befundeAus(bewertung, rechtsgrundlage), ...zusatz, ...empfaenger.befunde],
  }
}

/** R8 auf einer Erfassung von Hand (R16): Nicht erfasste Angaben stehen auf dem Beleg und sind von Hand zu prüfen. */
export function pruefePflichtangabenHand(h: Handerfassung): Pflichtangabenergebnis {
  const alle: Record<Pflichtangabe, { status: Status; fundstelle: string[] }> = {
    'name-anschrift-leistender': { status: gefuellt(h.lieferantName) ? 'pruefen' : 'fehlt', fundstelle: [] },
    'name-anschrift-empfaenger': { status: 'pruefen', fundstelle: [] },
    'steuernummer-oder-ustid': { status: gefuellt(h.lieferantUstId) || gefuellt(h.lieferantSteuernummer) ? 'erfuellt' : 'fehlt', fundstelle: [] },
    ausstellungsdatum: { status: istGueltigesDatum(h.rechnungsdatum) ? 'erfuellt' : 'fehlt', fundstelle: [] },
    rechnungsnummer: { status: gefuellt(h.rechnungsnummer) ? 'erfuellt' : 'fehlt', fundstelle: [] },
    'menge-und-art': { status: 'pruefen', fundstelle: [] },
    leistungszeitpunkt: { status: istGueltigesDatum(h.leistungsdatum) ? 'erfuellt' : 'pruefen', fundstelle: [] },
    'entgelt-nach-steuersaetzen': { status: h.steuern.length > 0 ? 'erfuellt' : 'fehlt', fundstelle: [] },
    'steuersatz-und-betrag': {
      status: h.steuern.length === 0 ? 'fehlt' : h.steuern.every((s) => s.kategorie !== 'S' || gefuellt(s.satz)) ? (h.steuern.some((s) => s.kategorie !== 'S') ? 'pruefen' : 'erfuellt') : 'fehlt',
      fundstelle: [],
    },
    'angabe-gutschrift': { status: 'nicht-anwendbar', fundstelle: [] },
  }
  const klein = istKleinbetrag(h.bruttoCent, h.steuern)
  const bewertung = klein ? bewerte('§ 33 UStDV', alle, new Set(GILT_33)) : bewerte('§ 14 Abs. 4 UStG', alle, new Set(ALLE))
  return {
    pruefung: { regelwerk: bewertung.regelwerk, ergebnisse: bewertung.ergebnisse, eigeneFirmaAlsEmpfaenger: 'unklar' },
    befunde: befundeAus(bewertung, klein ? '§ 33 UStDV' : '§ 14 Abs. 4 Satz 1 UStG'),
  }
}
