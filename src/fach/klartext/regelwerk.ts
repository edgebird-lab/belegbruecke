/**
 * Klartext zu Regeln der Regelwerke EN 16931 (CEN) und XRechnung (KoSIT), Schritt 1.6.
 *
 * Eigene Worte; übernommen sind nur Regel-IDs, BT-Nummern und kurze Begriffe (Spezifikation 8).
 * Auswahl: alle Regeln aus dem Referenzlauf und dem EXTENDED-Vergleich (Schritte 0.3 und 0.7)
 * und die häufigsten Pflicht- und Summenregeln.
 *
 * `ustRelevant` (R7): fest aus den Quellen sind BR-DE-15 (false, BMF Rn. 35a nennt BT-10) und
 * BR-CO-14, BR-CO-15, BR-CO-17 (true, Steuerbetrag, BMF Rn. 6b). Die übrigen Einordnungen
 * folgen § 14 Abs. 4 UStG: true, wenn die Regel eine Pflichtangabe oder das Entgelt bzw. die
 * Steuer betrifft; false bei rein technischen Angaben; sonst "unklar".
 */
import type { Katalogeintrag } from './katalog.ts'

const KORREKTUR = 'Korrigierte Rechnung anfordern; Vorsteuer nur aus einer richtigen Rechnung.'
const HINWEIS_LIEFERANT = 'Lieferanten auf den Fehler hinweisen; für die Buchung meist ohne Folgen.'
const TECHNISCH = 'Technischer Mangel der Datei. Lieferanten informieren; die Rechnung bleibt inhaltlich prüfbar.'

function regel(titel: string, klartext: string, btBezug: string[], ustRelevant: boolean | 'unklar', handlung: string, rechtsgrundlage?: string): Katalogeintrag {
  return { titel, klartext, btBezug, ustRelevant, handlung, ...(rechtsgrundlage ? { rechtsgrundlage } : {}) }
}

export const REGELWERK: Record<string, Katalogeintrag> = {
  // ---------- Pflichtfelder (EN 16931) ----------
  'BR-01': regel('Spezifikationskennung fehlt', 'Die Rechnung nennt nicht, nach welcher Spezifikation sie aufgebaut ist (BT-24). Ohne diese Kennung lässt sie sich keinem Prüfszenario zuordnen.', ['BT-24'], false, 'E-Rechnung mit Kennung anfordern.'),
  'BR-02': regel('Rechnungsnummer fehlt', 'Die Rechnung hat keine Rechnungsnummer (BT-1). Die fortlaufende Nummer ist eine Pflichtangabe.', ['BT-1'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 4 UStG'),
  'BR-03': regel('Rechnungsdatum fehlt', 'Die Rechnung hat kein Ausstellungsdatum (BT-2). Das Datum ist eine Pflichtangabe.', ['BT-2'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 3 UStG'),
  'BR-04': regel('Rechnungsart fehlt', 'Die Rechnung nennt keinen Typ (BT-3), etwa Rechnung (380) oder Gutschrift (381).', ['BT-3'], 'unklar', 'Lieferanten um eine vollständige Rechnung bitten.'),
  'BR-05': regel('Währung fehlt', 'Die Rechnung nennt keine Währung (BT-5); die Beträge sind damit nicht eindeutig.', ['BT-5'], 'unklar', KORREKTUR),
  'BR-06': regel('Name des Lieferanten fehlt', 'Der Name des Verkäufers (BT-27) fehlt. Name und Anschrift des Leistenden sind Pflichtangaben.', ['BT-27'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-07': regel('Name des Empfängers fehlt', 'Der Name des Käufers (BT-44) fehlt. Name und Anschrift des Empfängers sind Pflichtangaben.', ['BT-44'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-08': regel('Anschrift des Lieferanten fehlt', 'Die Postanschrift des Verkäufers (BG-5) fehlt.', ['BG-5'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-10': regel('Anschrift des Empfängers fehlt', 'Die Postanschrift des Käufers (BG-8) fehlt.', ['BG-8'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-16': regel('Keine Rechnungsposition', 'Die Rechnung enthält keine einzige Position (BG-25). Menge und Art der Leistung sind Pflichtangaben.', ['BG-25'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 5 UStG'),
  'BR-21': regel('Position ohne Nummer', 'Eine Rechnungsposition hat keine Positionsnummer (BT-126).', ['BT-126'], false, HINWEIS_LIEFERANT),
  'BR-22': regel('Position ohne Menge', 'Eine Rechnungsposition nennt keine Menge (BT-129). Die Menge gehört zu den Pflichtangaben über die Leistung.', ['BT-129'], true, 'Menge in der Rechnung prüfen; bei Bedarf korrigierte Rechnung anfordern.', '§ 14 Abs. 4 Satz 1 Nr. 5 UStG'),
  'BR-23': regel('Position ohne Mengeneinheit', 'Eine Rechnungsposition nennt keine Mengeneinheit (BT-130).', ['BT-130'], false, HINWEIS_LIEFERANT),
  'BR-24': regel('Position ohne Nettobetrag', 'Eine Rechnungsposition hat keinen Nettobetrag (BT-131).', ['BT-131'], 'unklar', KORREKTUR),
  'BR-25': regel('Position ohne Bezeichnung', 'Eine Rechnungsposition hat keine Artikelbezeichnung (BT-153). Die Art der Leistung ist eine Pflichtangabe.', ['BT-153'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 5 UStG'),
  'BR-26': regel('Position ohne Einzelpreis', 'Eine Rechnungsposition nennt keinen Netto-Einzelpreis (BT-146).', ['BT-146'], false, HINWEIS_LIEFERANT),
  'BR-27': regel('Negativer Einzelpreis', 'Der Netto-Einzelpreis einer Position (BT-146) ist negativ. Nachlässe gehören in eigene Abschläge, nicht in einen negativen Preis.', ['BT-146'], false, 'Beträge von Hand prüfen und den Lieferanten informieren.'),
  'BR-CO-04': regel('Position ohne Steuerkategorie', 'Eine Rechnungsposition hat keine Umsatzsteuerkategorie (BT-151); welcher Steuersatz gilt, ist damit offen.', ['BT-151'], 'unklar', KORREKTUR),
  'BR-CO-09': regel('USt-IdNr. ohne Länderkennzeichen', 'Eine Umsatzsteuer-Identifikationsnummer (BT-31, BT-48 oder BT-63) beginnt nicht mit dem Länderkennzeichen, z. B. DE.', ['BT-31', 'BT-48', 'BT-63'], 'unklar', 'Nummer prüfen; bei falscher Nummer korrigierte Rechnung anfordern.', '§ 14 Abs. 4 Satz 1 Nr. 2 UStG'),
  'BR-CO-26': regel('Lieferant nicht eindeutig gekennzeichnet', 'Für den Verkäufer fehlt jede Kennung: weder eigene Kennung (BT-29), Registernummer (BT-30) noch USt-IdNr. (BT-31).', ['BT-29', 'BT-30', 'BT-31'], 'unklar', 'Lieferanten um Angabe der USt-IdNr. oder Steuernummer bitten.'),

  // ---------- Summen und Steuer (EN 16931) ----------
  'BR-CO-10': regel('Summe der Positionen stimmt nicht', 'Die Summe der Positionsbeträge (BT-106) ist nicht die Summe der einzelnen Nettobeträge (BT-131).', ['BT-106', 'BT-131'], true, KORREKTUR),
  'BR-CO-11': regel('Summe der Abschläge stimmt nicht', 'Die Summe der Abschläge auf Belegebene (BT-107) passt nicht zu den einzelnen Abschlägen (BT-92).', ['BT-107', 'BT-92'], true, KORREKTUR),
  'BR-CO-12': regel('Summe der Zuschläge stimmt nicht', 'Die Summe der Zuschläge auf Belegebene (BT-108) passt nicht zu den einzelnen Zuschlägen (BT-99).', ['BT-108', 'BT-99'], true, KORREKTUR),
  'BR-CO-13': regel('Nettosumme stimmt nicht', 'Der Gesamtbetrag ohne Steuer (BT-109) ist nicht Positionssumme minus Abschläge plus Zuschläge.', ['BT-109', 'BT-106', 'BT-107', 'BT-108'], true, KORREKTUR),
  'BR-CO-14': regel('Steuersumme stimmt nicht', 'Der Steuerbetrag der Rechnung (BT-110) ist nicht die Summe der Steuerbeträge je Steuersatz (BT-117). Der ausgewiesene Steuerbetrag ist damit falsch berechnet.', ['BT-110', 'BT-117'], true, KORREKTUR, 'BMF 15.10.2025, Rn. 6b'),
  'BR-CO-15': regel('Bruttosumme stimmt nicht', 'Der Gesamtbetrag mit Steuer (BT-112) ist nicht Nettobetrag (BT-109) plus Steuerbetrag (BT-110).', ['BT-112', 'BT-109', 'BT-110'], true, KORREKTUR, 'BMF 15.10.2025, Rn. 6b'),
  'BR-CO-16': regel('Zahlbetrag stimmt nicht', 'Der fällige Betrag (BT-115) ist nicht Bruttobetrag (BT-112) minus Vorauszahlung (BT-113) plus Rundung (BT-114).', ['BT-115', 'BT-112', 'BT-113', 'BT-114'], false, 'Zahlbetrag von Hand nachrechnen, bevor Sie überweisen.'),
  'BR-CO-17': regel('Steuerbetrag je Satz falsch', 'Der Steuerbetrag für einen Steuersatz (BT-117) passt nicht zur Bemessungsgrundlage. Erwartet: Bemessung (BT-116) × Steuersatz (BT-119) / 100, auf Cent gerundet.', ['BT-117', 'BT-116', 'BT-119'], true, KORREKTUR, 'BMF 15.10.2025, Rn. 6b'),
  'BR-S-01': regel('Steueraufschlüsselung für 19 %/7 % fehlt', 'Positionen sind mit Normalsatz-Kategorie S gekennzeichnet, die Steueraufschlüsselung (BG-23) enthält aber keine Zeile der Kategorie S.', ['BG-23', 'BT-118'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 7 und 8 UStG'),
  'BR-S-02': regel('USt-IdNr. oder Steuernummer fehlt', 'Bei steuerpflichtigen Positionen fehlt die USt-IdNr. (BT-31), die Steuernummer (BT-32) bzw. die USt-IdNr. des Steuervertreters (BT-63) des Lieferanten.', ['BT-31', 'BT-32', 'BT-63'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 2 UStG'),
  'BR-S-08': regel('Bemessungsgrundlage je Satz stimmt nicht', 'Die Bemessungsgrundlage für einen Steuersatz (BT-116) ist nicht die Summe der zugehörigen Positionen, Zu- und Abschläge.', ['BT-116', 'BT-131'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 7 UStG'),
  'BR-S-09': regel('Steuerbetrag für Kategorie S falsch', 'Der Steuerbetrag einer Zeile der Kategorie S (BT-117) ist nicht Bemessung × Steuersatz.', ['BT-117', 'BT-116', 'BT-119'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 8 UStG'),
  'BR-S-10': regel('Befreiungsgrund bei steuerpflichtiger Zeile', 'Eine steuerpflichtige Zeile der Kategorie S nennt einen Grund für eine Steuerbefreiung (BT-120 oder BT-121). Das widerspricht sich.', ['BT-120', 'BT-121'], 'unklar', 'Steuersatz und Befreiung von Hand prüfen; bei Zweifeln korrigierte Rechnung anfordern.'),
  'BR-E-08': regel('Bemessung steuerfreier Umsätze stimmt nicht', 'Die Bemessungsgrundlage der steuerfreien Zeile (Kategorie E, BT-116) ist nicht die Summe der zugehörigen Positionen, Zu- und Abschläge.', ['BT-116'], true, KORREKTUR),
  'BR-AE-08': regel('Bemessung bei Reverse Charge stimmt nicht', 'Die Bemessungsgrundlage der Zeile mit Steuerschuldnerschaft des Leistungsempfängers (Kategorie AE, BT-116) ist nicht die Summe der zugehörigen Beträge.', ['BT-116'], true, KORREKTUR),
  'BR-DEC-23': regel('Positionsbetrag mit mehr als 2 Nachkommastellen', 'Der Nettobetrag einer Position (BT-131) hat mehr als 2 Nachkommastellen.', ['BT-131'], 'unklar', HINWEIS_LIEFERANT),

  // ---------- Codelisten ----------
  'BR-CL-10': regel('Unbekanntes Kennungsschema', 'Eine Kennung nennt ein Schema, das nicht in der Liste ISO 6523 ICD steht.', ['BT-29', 'BT-46', 'BT-60'], false, TECHNISCH),
  'BR-CL-13': regel('Unbekannte Artikelklassifikation', 'Das Schema der Artikelklassifikation (BT-158) steht nicht in der Codeliste UNTDID 7143.', ['BT-158'], false, TECHNISCH),
  'BR-CL-21': regel('Unbekanntes Schema der Artikelkennung', 'Das Schema der Standard-Artikelkennung (BT-157) steht nicht in der Liste ISO 6523 ICD.', ['BT-157'], false, TECHNISCH),
  'BR-CL-23': regel('Unbekannte Mengeneinheit', 'Die Mengeneinheit einer Position (BT-130 oder BT-150) steht nicht in den Codelisten UN/ECE Rec. 20 und 21. In XRechnung zählt das nur als Warnung.', ['BT-130', 'BT-150'], false, 'Menge und Einheit von Hand prüfen; meist ohne Folgen.'),
  'BR-CL-24': regel('Unbekannter MIME-Typ eines Anhangs', 'Ein eingebetteter Anhang (BT-125) hat einen Dateityp, der nicht in der erlaubten Liste steht.', ['BT-125'], false, TECHNISCH),

  // ---------- XRechnung (KoSIT) ----------
  'BR-DE-1': regel('Zahlungsangaben fehlen', 'Die Rechnung enthält keine Zahlungsanweisungen (BG-16), etwa Bankverbindung oder Zahlungsart. XRechnung verlangt sie.', ['BG-16'], false, 'Zahlungsweg mit dem Lieferanten klären.'),
  'BR-DE-2': regel('Kontaktangaben des Lieferanten fehlen', 'Die Gruppe für den Ansprechpartner des Verkäufers (BG-6) fehlt. XRechnung verlangt sie.', ['BG-6'], false, HINWEIS_LIEFERANT),
  'BR-DE-3': regel('Ort des Lieferanten fehlt', 'Der Ort in der Anschrift des Verkäufers (BT-37) fehlt.', ['BT-37'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-DE-4': regel('Postleitzahl des Lieferanten fehlt', 'Die Postleitzahl des Verkäufers (BT-38) fehlt.', ['BT-38'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 1 UStG'),
  'BR-DE-5': regel('Ansprechpartner fehlt', 'Der Ansprechpartner beim Verkäufer (BT-41) fehlt. XRechnung verlangt ihn.', ['BT-41'], false, HINWEIS_LIEFERANT),
  'BR-DE-6': regel('Telefonnummer des Ansprechpartners fehlt', 'Die Telefonnummer des Ansprechpartners beim Verkäufer (BT-42) fehlt.', ['BT-42'], false, HINWEIS_LIEFERANT),
  'BR-DE-7': regel('E-Mail des Ansprechpartners fehlt', 'Die E-Mail-Adresse des Ansprechpartners beim Verkäufer (BT-43) fehlt.', ['BT-43'], false, HINWEIS_LIEFERANT),
  'BR-DE-15': regel('Käuferreferenz fehlt', 'Die Käuferreferenz (BT-10, „Leitweg-ID“) fehlt. XRechnung verlangt sie, das Umsatzsteuerrecht nicht: Der Fehler ist umsatzsteuerlich unbeachtlich.', ['BT-10'], false, 'Für die Buchung ohne Folgen; den Lieferanten bei Gelegenheit informieren.', 'BMF 15.10.2025, Rn. 35a'),
  'BR-DE-16': regel('USt-IdNr. oder Steuernummer fehlt', 'Bei steuerbaren Umsätzen fehlt die USt-IdNr. (BT-31), die Steuernummer (BT-32) oder der Steuervertreter (BG-11) des Lieferanten.', ['BT-31', 'BT-32', 'BG-11'], true, KORREKTUR, '§ 14 Abs. 4 Satz 1 Nr. 2 UStG'),
  'BR-DE-17': regel('Unübliche Rechnungsart', 'Der Rechnungstyp (BT-3) gehört nicht zu den in XRechnung vorgesehenen Codes (z. B. 380 Rechnung, 381 Gutschrift, 384 Korrektur, 389 Gutschrift im Gutschriftverfahren).', ['BT-3'], 'unklar', 'Rechnungsart von Hand prüfen.'),
  'BR-DE-21': regel('Spezifikationskennung nicht XRechnung', 'Die Spezifikationskennung (BT-24) entspricht nicht der Schreibweise von XRechnung.', ['BT-24'], false, HINWEIS_LIEFERANT),
  'BR-DE-23-a': regel('Bankverbindung für Überweisung fehlt', 'Als Zahlungsart ist Überweisung angegeben (BT-81 = 30 oder 58), aber die Bankverbindung (BG-17) fehlt.', ['BT-81', 'BG-17'], false, 'Bankverbindung beim Lieferanten erfragen; nicht aus anderen Quellen übernehmen.'),
  'BR-DE-TMP-32': regel('Leistungsdatum nicht in den Feldern', 'Die Rechnung nennt weder Lieferdatum (BT-72) noch Abrechnungszeitraum (BG-14) noch in jeder Position einen Zeitraum (BG-26). Der Leistungszeitpunkt steht dann womöglich nur im Text; die Belegbrücke prüft ihn bei den Pflichtangaben eigens.', ['BT-72', 'BG-14', 'BG-26'], 'unklar', 'Leistungszeitpunkt in der Ansicht prüfen.', '§ 14 Abs. 4 Satz 1 Nr. 6 UStG'),

  // ---------- Syntaxregeln UBL und CII ----------
  'UBL-CR-470': regel('Nicht vorgesehenes Element: Vorauszahlung', 'Die UBL-Datei enthält eine Vorauszahlung im Element PrepaidPayment, das EN 16931 nicht vorsieht. In der XRechnung-Extension ist das für Zahlungen Dritter erlaubt.', [], false, TECHNISCH),
  'UBL-CR-646': regel('Unterpositionen in UBL', 'Die UBL-Datei enthält Unterpositionen (SubInvoiceLine). Nach EN 16931 sind sie nicht vorgesehen, in der XRechnung-Extension erlaubt; in XRechnung Standard sind sie ein Fehler.', ['BG-DEX-01'], false, 'Positionen und Summen von Hand prüfen.'),
  'CII-SR-439': regel('Zuschlag mehrfach angegeben', 'Ein Zuschlagsbetrag (ChargeAmount) steht in der CII-Datei mehr als einmal.', [], false, TECHNISCH),
  'CII-SR-475': regel('Mehrere Namen für eine Anlage', 'Für eine Anlage mit TypeCode 916 ist mehr als eine Bezeichnung (BT-123) angegeben.', ['BT-123'], false, TECHNISCH),
  'CII-SR-476': regel('Mehrere Dateien für eine Anlage', 'Für eine Anlage mit TypeCode 916 ist mehr als eine eingebettete Datei (BT-125) angegeben.', ['BT-125'], false, TECHNISCH),
  'CII-DT-021': regel('Nicht vorgesehenes Element: Name', 'Die CII-Datei enthält an einer Stelle einen Namen, den EN 16931 dort nicht vorsieht.', [], false, TECHNISCH),
  'CII-DT-027': regel('Nicht vorgesehenes Element: Datumsformat', 'Die CII-Datei enthält ein FormattedIssueDateTime, das EN 16931 nicht vorsieht.', [], false, TECHNISCH),
}
