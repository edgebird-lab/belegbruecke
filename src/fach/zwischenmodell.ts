/**
 * Datenextraktion aus dem KoSIT-Zwischenmodell `xr:invoice` (Spezifikation 7.2): Die erste Stufe
 * der XRechnung-Visualisierung bildet UBL und CII auf ein Modell mit BT-Bezug ab; hier wird nur
 * dieses Modell gelesen. Damit gibt es eine Abbildung statt drei.
 */
import { XMLParser } from 'fast-xml-parser'
import { parseBetrag } from './betrag.ts'
import { befund } from './befunde.ts'
import type { Anhang, Anschrift, Befund, Cent, Partei, Position, Rechnungsdaten, Steuerzeile } from './typen.ts'

type Knoten = Record<string, unknown>

const WIEDERHOLT = new Set([
  'INVOICE_NOTE',
  'Invoice_note',
  'PRECEDING_INVOICE_REFERENCE',
  'Seller_identifier',
  'Buyer_identifier',
  'PAYMENT_INSTRUCTIONS',
  'CREDIT_TRANSFER',
  'DOCUMENT_LEVEL_ALLOWANCES',
  'DOCUMENT_LEVEL_CHARGES',
  'VAT_BREAKDOWN',
  'ADDITIONAL_SUPPORTING_DOCUMENTS',
  'INVOICE_LINE',
  'SUB_INVOICE_LINE',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => WIEDERHOLT.has(name),
})

function knoten(k: unknown, name: string): Knoten | null {
  if (!k || typeof k !== 'object') return null
  const w = (k as Knoten)[name]
  const erster = Array.isArray(w) ? w[0] : w
  return erster && typeof erster === 'object' ? (erster as Knoten) : null
}

function liste(k: unknown, name: string): unknown[] {
  if (!k || typeof k !== 'object') return []
  const w = (k as Knoten)[name]
  return w === undefined ? [] : Array.isArray(w) ? w : [w]
}

/** Text eines Elements; Elemente mit Attributen kommen als Objekt mit #text. */
function text(k: unknown, name: string): string | null {
  const w = liste(k, name)[0]
  if (w === undefined || w === null) return null
  if (typeof w === 'string') return w
  if (typeof w === 'object') {
    const t = (w as Knoten)['#text']
    return typeof t === 'string' ? t : t === undefined ? '' : String(t)
  }
  return String(w)
}

function texte(k: unknown, name: string): string[] {
  return liste(k, name)
    .map((w) => (typeof w === 'string' ? w : w && typeof w === 'object' ? String((w as Knoten)['#text'] ?? '') : String(w)))
    .filter((t) => t !== '')
}

function attribut(k: unknown, name: string, attr: string): string | null {
  const w = liste(k, name)[0]
  if (!w || typeof w !== 'object') return null
  const a = (w as Knoten)[`@_${attr}`]
  return typeof a === 'string' ? a : null
}

/** Steuersatz normalisieren: "19.00" → "19", "5.50" → "5.5", fehlend → "". */
export function normalisiereSatz(satz: string | null): string {
  if (satz === null || satz.trim() === '') return ''
  const t = /^\s*([+-]?)(\d*)(?:\.(\d*))?\s*$/.exec(satz)
  if (!t) return satz.trim()
  const ganz = (t[2] || '0').replace(/^0+(?=\d)/, '')
  const nachkomma = (t[3] ?? '').replace(/0+$/, '')
  const wert = nachkomma ? `${ganz}.${nachkomma}` : ganz
  return wert === '0' ? '0' : `${t[1] === '-' ? '-' : ''}${wert}`
}

/** USt-IdNr. ohne Leerraum, wie in R10 und Partei.ustId verlangt. */
export function ohneLeerraum(wert: string | null): string | null {
  if (wert === null) return null
  const w = wert.replace(/\s+/g, '')
  return w === '' ? null : w
}

class Leser {
  befunde: Befund[] = []

  betrag(k: unknown, name: string, bt: string, standard: Cent = 0): Cent {
    const roh = text(k, name)
    if (roh === null || roh === '') return standard
    const r = parseBetrag(roh)
    if (r.ok) return r.cent
    this.befunde.push(befund('BETRAG-FORMAT', { btBezug: [bt], zusatz: `${bt}: „${roh}“.` }))
    return r.cent ?? standard
  }
}

function anschrift(k: Knoten | null, felder: [string, string, string, string, string]): Anschrift {
  const [z1, z2, plz, ort, land] = felder
  const a: Anschrift = {}
  const setze = (schluessel: keyof Anschrift, name: string) => {
    const t = text(k, name)
    if (t) a[schluessel] = t
  }
  setze('zeile1', z1)
  setze('zeile2', z2)
  setze('plz', plz)
  setze('ort', ort)
  setze('land', land)
  return a
}

function verkaeufer(x: Knoten): Partei {
  const s = knoten(x, 'SELLER')
  return {
    name: text(s, 'Seller_name') ?? '',
    handelsname: text(s, 'Seller_trading_name'),
    kennungen: texte(s, 'Seller_identifier'),
    ustId: ohneLeerraum(text(s, 'Seller_VAT_identifier')),
    steuernummer: text(s, 'Seller_tax_registration_identifier'),
    anschrift: anschrift(knoten(s, 'SELLER_POSTAL_ADDRESS'), ['Seller_address_line_1', 'Seller_address_line_2', 'Seller_post_code', 'Seller_city', 'Seller_country_code']),
    email: text(knoten(s, 'SELLER_CONTACT'), 'Seller_contact_email_address'),
  }
}

function kaeufer(x: Knoten): Partei {
  const b = knoten(x, 'BUYER')
  return {
    name: text(b, 'Buyer_name') ?? '',
    handelsname: text(b, 'Buyer_trading_name'),
    kennungen: texte(b, 'Buyer_identifier'),
    ustId: ohneLeerraum(text(b, 'Buyer_VAT_identifier')),
    steuernummer: null,
    anschrift: anschrift(knoten(b, 'BUYER_POSTAL_ADDRESS'), ['Buyer_address_line_1', 'Buyer_address_line_2', 'Buyer_post_code', 'Buyer_city', 'Buyer_country_code']),
    email: text(knoten(b, 'BUYER_CONTACT'), 'Buyer_contact_email_address'),
  }
}

function zeitraum(k: Knoten | null, von: string, bis: string): { von: string | null; bis: string | null } | null {
  if (!k) return null
  const z = { von: text(k, von), bis: text(k, bis) }
  return z.von || z.bis ? z : null
}

/** Base64-Länge in Bytes, ohne zu dekodieren. */
function base64Bytes(b64: string | null): number | null {
  if (!b64) return null
  const sauber = b64.replace(/\s+/g, '')
  const auffuellung = sauber.endsWith('==') ? 2 : sauber.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((sauber.length * 3) / 4) - auffuellung)
}

export interface Extraktion {
  daten: Rechnungsdaten
  befunde: Befund[]
  /** Zahl zusätzlicher Unterpositionen (XRechnung-Extension, EXTENDED), nur zur Information */
  unterpositionen: number
}

/** Liest Rechnungsdaten aus dem serialisierten Zwischenmodell. */
export function leseZwischenmodell(xr: string): Extraktion {
  const wurzel = knoten(parser.parse(xr), 'invoice')
  if (!wurzel) throw new Error('Zwischenmodell ohne xr:invoice')
  const l = new Leser()
  const summen = knoten(wurzel, 'DOCUMENT_TOTALS')
  const lieferung = knoten(wurzel, 'DELIVERY_INFORMATION')
  const zahlung = knoten(wurzel, 'PAYMENT_INSTRUCTIONS')

  const steuern: Steuerzeile[] = liste(wurzel, 'VAT_BREAKDOWN').map((v) => ({
    kategorie: text(v, 'VAT_category_code') ?? '',
    satz: normalisiereSatz(text(v, 'VAT_category_rate')),
    bemessungCent: l.betrag(v, 'VAT_category_taxable_amount', 'BT-116'),
    steuerCent: l.betrag(v, 'VAT_category_tax_amount', 'BT-117'),
    befreiungsgrund: text(v, 'VAT_exemption_reason_text'),
    befreiungsCode: text(v, 'VAT_exemption_reason_code'),
  }))

  let unterpositionen = 0
  const positionen: Position[] = liste(wurzel, 'INVOICE_LINE').map((p) => {
    unterpositionen += liste(p, 'SUB_INVOICE_LINE').length
    const steuer = knoten(p, 'LINE_VAT_INFORMATION')
    return {
      nr: text(p, 'Invoice_line_identifier') ?? '',
      bezeichnung: text(knoten(p, 'ITEM_INFORMATION'), 'Item_name') ?? '',
      menge: text(p, 'Invoiced_quantity') ?? '',
      einheit: text(p, 'Invoiced_quantity_unit_of_measure_code') ?? '',
      nettoCent: l.betrag(p, 'Invoice_line_net_amount', 'BT-131'),
      steuerkategorie: text(steuer, 'Invoiced_item_VAT_category_code') ?? '',
      steuersatz: text(steuer, 'Invoiced_item_VAT_rate') === null ? null : normalisiereSatz(text(steuer, 'Invoiced_item_VAT_rate')),
      zeitraum: zeitraum(knoten(p, 'INVOICE_LINE_PERIOD'), 'Invoice_line_period_start_date', 'Invoice_line_period_end_date'),
    }
  })

  const anhaenge: Anhang[] = liste(wurzel, 'ADDITIONAL_SUPPORTING_DOCUMENTS').map((a) => ({
    kennung: text(a, 'Supporting_document_reference') ?? '',
    beschreibung: text(a, 'Supporting_document_description'),
    dateiname: attribut(a, 'Attached_document', 'filename'),
    mimeTyp: attribut(a, 'Attached_document', 'mime_code'),
    groesseBytes: base64Bytes(text(a, 'Attached_document')),
    externeAdresse: text(a, 'External_document_location'),
  }))

  const daten: Rechnungsdaten = {
    rechnungsnummer: text(wurzel, 'Invoice_number') ?? '',
    rechnungsdatum: text(wurzel, 'Invoice_issue_date') ?? '',
    typcode: text(wurzel, 'Invoice_type_code') ?? '',
    waehrung: text(wurzel, 'Invoice_currency_code') ?? '',
    faelligAm: text(wurzel, 'Payment_due_date'),
    kaeuferreferenz: text(wurzel, 'Buyer_reference'),
    bestellreferenz: text(wurzel, 'Purchase_order_reference'),
    vorherigeRechnung: text(knoten(wurzel, 'PRECEDING_INVOICE_REFERENCE'), 'Preceding_Invoice_reference'),
    bemerkungen: liste(wurzel, 'INVOICE_NOTE').flatMap((n) => texte(n, 'Invoice_note')),
    zahlungsbedingungen: text(wurzel, 'Payment_terms'),
    verkaeufer: verkaeufer(wurzel),
    kaeufer: kaeufer(wurzel),
    steuervertreterUstId: ohneLeerraum(text(knoten(wurzel, 'SELLER_TAX_REPRESENTATIVE_PARTY'), 'Seller_tax_representative_VAT_identifier')),
    lieferdatum: text(lieferung, 'Actual_delivery_date'),
    abrechnungszeitraum: zeitraum(knoten(wurzel, 'INVOICING_PERIOD'), 'Invoicing_period_start_date', 'Invoicing_period_end_date'),
    positionen,
    steuern,
    summen: {
      positionenNettoCent: l.betrag(summen, 'Sum_of_Invoice_line_net_amount', 'BT-106'),
      abschlaegeCent: l.betrag(summen, 'Sum_of_allowances_on_document_level', 'BT-107'),
      zuschlaegeCent: l.betrag(summen, 'Sum_of_charges_on_document_level', 'BT-108'),
      nettoCent: l.betrag(summen, 'Invoice_total_amount_without_VAT', 'BT-109'),
      steuerCent: l.betrag(summen, 'Invoice_total_VAT_amount', 'BT-110'),
      bruttoCent: l.betrag(summen, 'Invoice_total_amount_with_VAT', 'BT-112'),
      vorausbezahltCent: l.betrag(summen, 'Paid_amount', 'BT-113'),
      rundungCent: l.betrag(summen, 'Rounding_amount', 'BT-114'),
      zahlbetragCent: l.betrag(summen, 'Amount_due_for_payment', 'BT-115'),
    },
    zahlung: {
      artCode: text(zahlung, 'Payment_means_type_code'),
      iban: ohneLeerraum(text(knoten(zahlung, 'CREDIT_TRANSFER'), 'Payment_account_identifier')),
    },
    anhaenge,
  }
  return { daten, befunde: l.befunde, unterpositionen }
}
