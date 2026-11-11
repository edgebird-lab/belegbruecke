/** Eingaben der API, mit zod geprüft (Spezifikation 7.6). */
import { z } from 'zod'

const anschrift = z
  .object({
    zeile1: z.string().max(200).optional(),
    zeile2: z.string().max(200).optional(),
    plz: z.string().max(20).optional(),
    ort: z.string().max(200).optional(),
    land: z
      .string()
      .regex(/^[A-Z]{2}$/, 'Ländercode mit zwei Großbuchstaben, z. B. DE')
      .optional(),
  })
  .strict()

const buSchluessel = z.string().regex(/^\d{1,4}$/, 'BU-Schlüssel aus 1 bis 4 Ziffern').nullable()

export const einstellungenSchema = z
  .object({
    formatVersion: z.literal(1),
    firma: z
      .object({
        name: z.string().max(200),
        namensVarianten: z.array(z.string().max(200)).max(20),
        anschrift,
        ustId: z
          .string()
          .regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/, 'USt-IdNr. ohne Leerzeichen, z. B. DE123456789')
          .optional(),
        steuernummer: z.string().max(30).optional(),
        kleinunternehmer: z.boolean(),
      })
      .strict(),
    datev: z
      .object({
        beraternummer: z.number().int().min(1001).max(9999999),
        mandantennummer: z.number().int().min(1).max(99999),
        wjBeginnMonatTag: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format MM-TT'),
        sachkontenlaenge: z.number().int().min(4).max(8),
        kontenrahmen: z.enum(['SKR03', 'SKR04']),
        kreditorenVon: z.number().int().positive(),
        kreditorenBis: z.number().int().positive(),
        buSchluessel: z.object({ 'vorsteuer-19': buSchluessel, 'vorsteuer-7': buSchluessel, 'ohne-vorsteuer': buSchluessel, sonderfall: buSchluessel }).strict(),
        exportmodus: z.enum(['buchungsstapel-und-belege', 'nur-belege']),
        duoPaket: z.literal(false, 'Das DUO-Paket ist erst nach Bestätigung des Formats verfügbar (Schritt 0.6).'),
        exportiertVon: z.string().max(25),
        zeichensatz: z.enum(['windows-1252', 'utf-8']),
      })
      .strict()
      .refine((d) => d.kreditorenVon <= d.kreditorenBis, { message: 'Kreditorenkreis: „von“ muss kleiner als „bis“ sein', path: ['kreditorenBis'] })
      .refine((d) => String(d.kreditorenVon).length === d.sachkontenlaenge + 1 && String(d.kreditorenBis).length === d.sachkontenlaenge + 1, {
        message: 'Kreditorenkonten haben eine Stelle mehr als die Sachkontenlänge',
        path: ['kreditorenVon'],
      }),
    postfach: z
      .object({
        aktiv: z.boolean(),
        server: z.string().max(253),
        port: z.literal(993),
        benutzer: z.string().max(200),
        passwortVerschluesselt: z.string(),
        ordner: z.string().min(1).max(200),
        zielOrdner: z.string().min(1).max(200),
        intervallMinuten: z.number().int().min(5).max(1440),
        nurVonAbsendern: z.array(z.string().max(200)).max(50),
        emlAufbewahren: z.boolean(),
      })
      .strict(),
    aufbewahrung: z
      .object({ id: z.literal('buchungsbeleg'), jahre: z.number().int().min(8).max(30), rechtsgrundlage: z.string().max(200), gueltigAb: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .strict(),
    eingerichtetAm: z.string().nullable(),
  })
  .strict()

export const anmeldungSchema = z.object({ anmeldename: z.string().min(1).max(64), passwort: z.string().min(1).max(200) }).strict()

export const neuerBenutzerSchema = z
  .object({
    anmeldename: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, 'Anmeldename nur aus Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich'),
    name: z.string().min(1).max(100),
    passwort: z.string().min(10, 'Passwort mit mindestens 10 Zeichen').max(200),
  })
  .strict()

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum im Format JJJJ-MM-TT')
const monat = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Monat im Format JJJJ-MM')
const uuid = z.string().regex(/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/, 'Kennung (UUID)')
const cent = z.number().int('Betrag in ganzen Cent').min(-1e13).max(1e13)

export const belegfilterSchema = z
  .object({
    status: z.enum(['eingegangen', 'geprueft', 'kontiert', 'freigegeben', 'exportiert', 'abgelehnt']).optional(),
    offen: z.enum(['1']).optional(),
    monat: monat.optional(),
    suche: z.string().max(200).optional(),
    von: datum.optional(),
    bis: datum.optional(),
    /** Betrag wie eingegeben, z. B. „336,90“, „1.234,56“ oder „336.90“ */
    betrag: z.string().max(30).optional(),
  })
  .strict()

export const dubletteSchema = z.object({ ergebnis: z.enum(['keine-dublette', 'dublette']) }).strict()

export const zuordnungSchema = z
  .object({
    lieferantId: uuid.optional(),
    neu: z
      .object({
        name: z.string().min(1, 'Name des Lieferanten fehlt').max(200),
        ustId: z.string().max(20).nullable().optional(),
        steuernummer: z.string().max(30).nullable().optional(),
        anschrift: anschrift.optional(),
      })
      .strict()
      .optional(),
    kreditorKonto: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine((z) => !!z.lieferantId !== !!z.neu, { message: 'Entweder einen vorhandenen Lieferanten (lieferantId) oder einen neuen (neu) angeben' })

export const kontierungSchema = z
  .object({
    zeilen: z
      .array(
        z
          .object({
            sachkonto: z.number().int().positive().nullable(),
            buSchluessel: buSchluessel.optional(),
            buchungstext: z.string().max(60, 'Buchungstext höchstens 60 Zeichen').optional(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()

export const handerfassungSchema = z
  .object({
    lieferantName: z.string().max(200),
    lieferantUstId: z
      .string()
      .regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/, 'USt-IdNr. ohne Leerzeichen, z. B. DE123456789')
      .nullable(),
    lieferantSteuernummer: z.string().max(30).nullable(),
    rechnungsnummer: z.string().max(100),
    rechnungsdatum: z.string().max(10),
    leistungsdatum: z.string().max(10).nullable(),
    steuern: z
      .array(z.object({ kategorie: z.enum(['S', 'E', 'AE']), satz: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/, 'Steuersatz als Zahl, z. B. 19'), bemessungCent: cent, steuerCent: cent }).strict())
      .max(10),
    bruttoCent: cent,
  })
  .strict()

export const freigabeSchema = z.object({ inhaltGeprueft: z.boolean(), begruendung: z.string().max(1000).nullable().optional() }).strict()
export const ablehnungSchema = z.object({ grund: z.string().max(1000) }).strict()
export const ruecknahmeSchema = z.object({ grund: z.string().max(1000).nullable().optional() }).strict()

export const lieferantSchema = z
  .object({
    name: z.string().min(1).max(200),
    ustId: z.string().max(20).nullable(),
    steuernummer: z.string().max(30).nullable(),
    anschrift,
    kreditorKonto: z.number().int().positive().nullable(),
  })
  .strict()

export const sachkontoSchema = z
  .object({ nummer: z.number().int().positive(), bezeichnung: z.string().trim().min(1, 'Bezeichnung fehlt').max(100), automatikkonto: z.boolean(), aktiv: z.boolean() })
  .strict()

export const kontenimportSchema = z.object({ csv: z.string().min(1, 'Die CSV-Datei ist leer').max(1_000_000) }).strict()

export const monatSchema = z.object({ monat }).strict()

export const prueferexportSchema = z.object({ von: datum.nullable().optional(), bis: datum.nullable().optional() }).strict()

export const kettenpruefungSchema = z
  .object({
    anker: z
      .array(z.object({ nr: z.number().int().positive(), hash: z.string().regex(/^[0-9a-f]{64}$/) }).strict())
      .max(500)
      .optional(),
  })
  .strict()

/** Fehlermeldung von zod in einem deutschen Satz. */
export function zodText(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.') || 'Eingabe'}: ${i.message}`).join('; ')
}
