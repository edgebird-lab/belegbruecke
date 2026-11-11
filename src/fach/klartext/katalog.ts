/**
 * Klartext-Katalog (R7): deutsche Erklärung, Handlungsvorschlag und umsatzsteuerliche Einordnung
 * je Regel-ID. Die Texte sind eigene Formulierungen; aus den Normen stammen nur Regel-IDs,
 * BT-Nummern und kurze Begriffe. Nicht katalogisierte Schematron-Regeln erhalten einen
 * allgemeinen Text, `ustRelevant` "unklar" und den Originaltext des Regelwerks.
 */
import type { Befundquelle, Fehlerklasse, Stufe } from '../typen.ts'

export interface Katalogeintrag {
  /** Kurzer Titel für Listen */
  titel: string
  klartext: string
  handlung: string
  ustRelevant: boolean | 'unklar'
  btBezug: string[]
  /** Nur für eigene Regeln; Schematron-Regeln erhalten Quelle und Stufe aus dem Regelwerk */
  quelle?: Befundquelle
  stufe?: Stufe
  fehlerklasse?: Fehlerklasse
  /** Fundstelle für „Jeder Befund nennt seine Quelle“ */
  rechtsgrundlage?: string
}

const SONSTIGE_RECHNUNG =
  'Die Datei ist keine E-Rechnung, sondern eine sonstige Rechnung (BMF-Schreiben vom 15.10.2025, Rn. 6a). Fordern Sie eine E-Rechnung an. Ausnahmen: Kleinbetrag bis 250 €, Rechnung eines Kleinunternehmers, Fahrausweis und die Übergangszeit für Umsätze bis Ende 2026 (bei höchstens 800.000 € Vorjahresumsatz des Ausstellers bis Ende 2027).'

/** Eigene Regeln der Belegbrücke (Annahme, Format, Prüfablauf, PDF, Pflichtangaben, Plausibilität). */
export const EIGENE_REGELN: Record<string, Katalogeintrag> = {
  'SICHERHEIT-DTD': {
    titel: 'DTD oder Entity in der Datei',
    klartext: `Die Datei enthält eine Dokumenttyp-Deklaration (DOCTYPE) oder Entity. E-Rechnungen brauchen das nie; die Belegbrücke lehnt solche Dateien aus Sicherheitsgründen ab, bevor sie gelesen werden. ${SONSTIGE_RECHNUNG}`,
    handlung: 'Lieferanten um eine E-Rechnung ohne DOCTYPE bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'sicherheit',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  'XML-ZEICHENSATZ': {
    titel: 'Zeichensatz nicht lesbar',
    klartext: `Die Datei lässt sich mit dem angegebenen Zeichensatz nicht fehlerfrei lesen, oder der Zeichensatz wird nicht unterstützt (unterstützt: UTF-8, UTF-16, ISO-8859-1, Windows-1252). ${SONSTIGE_RECHNUNG}`,
    handlung: 'Lieferanten um eine korrekt kodierte E-Rechnung (UTF-8) bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'xml',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  'XML-WOHLGEFORMT': {
    titel: 'Kein gültiges XML',
    klartext: `Die Datei ist kein wohlgeformtes XML, zum Beispiel weil sie abgeschnitten ist oder Tags nicht geschlossen sind. ${SONSTIGE_RECHNUNG}`,
    handlung: 'Lieferanten um eine vollständige, gültige E-Rechnung bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'xml',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  'FORMAT-UNBEKANNT': {
    titel: 'Format nicht als E-Rechnung anerkannt',
    klartext: `Das XML hat kein Wurzelelement einer E-Rechnung nach EN 16931 (UBL Invoice, UBL CreditNote oder CII), zum Beispiel ZUGFeRD 1.0. ${SONSTIGE_RECHNUNG}`,
    handlung: 'Rechnung von Hand erfassen und künftig eine E-Rechnung anfordern.',
    ustRelevant: 'unklar',
    btBezug: ['BT-24'],
    quelle: 'szenario',
    stufe: 'warnung',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'UStAE 14.1 Abs. 14',
  },
  'PROFIL-KEINE-ERECHNUNG': {
    titel: 'Profil ist keine E-Rechnung',
    klartext: `Die Rechnung nutzt das ZUGFeRD-Profil MINIMUM oder BASIC WL. Diese Profile enthalten nicht alle Pflichtangaben und gelten nicht als E-Rechnung (UStAE 14.1 Abs. 14). ${SONSTIGE_RECHNUNG}`,
    handlung: 'Rechnung von Hand erfassen und eine E-Rechnung im Profil EN 16931 oder XRECHNUNG anfordern.',
    ustRelevant: 'unklar',
    btBezug: ['BT-24'],
    quelle: 'szenario',
    stufe: 'warnung',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'UStAE 14.1 Abs. 14',
  },
  'SZENARIO-FEHLT': {
    titel: 'Unbekannte Spezifikationskennung',
    klartext: `Die Spezifikationskennung (BT-24) passt zu keinem Prüfszenario der KoSIT-Konfiguration und keinem Factur-X-Profil. Die Rechnung kann nicht nach EN 16931 geprüft werden und wird nicht angenommen. ${SONSTIGE_RECHNUNG}`,
    handlung: 'Lieferanten um eine E-Rechnung im Format XRechnung oder ZUGFeRD (EN 16931) bitten.',
    ustRelevant: 'unklar',
    btBezug: ['BT-24'],
    quelle: 'szenario',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  XSD: {
    titel: 'Verstoß gegen das XML-Schema',
    klartext: `Die Datei verletzt das XML-Schema ihrer Syntax (UBL 2.1 bzw. CII D16B): ein Element fehlt, steht an falscher Stelle oder hat einen unzulässigen Wert. ${SONSTIGE_RECHNUNG}`,
    handlung: 'Lieferanten den Befund mit Zeile und Spalte schicken und eine korrigierte E-Rechnung anfordern.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'xsd',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  'PRUEFUNG-VERARBEITUNG': {
    titel: 'Prüfung abgebrochen',
    klartext: 'Die Prüfung mit dem offiziellen Regelwerk ist mit einem Verarbeitungsfehler abgebrochen; ein Ergebnis liegt nicht vor. Wie beim KoSIT-Validator gilt die Rechnung damit als nicht angenommen.',
    handlung: 'Rechnung mit einem anderen Prüfwerkzeug prüfen oder eine E-Rechnung im Profil XRECHNUNG bzw. EN 16931 anfordern.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'szenario',
    stufe: 'fehler',
    fehlerklasse: 'keine',
  },
  'PRUEFUNG-ZEITLIMIT': {
    titel: 'Prüfung dauerte zu lange',
    klartext: 'Die Prüfung wurde nach Ablauf des Zeitlimits abgebrochen. Die Rechnung gilt als nicht angenommen.',
    handlung: 'Prüfung später wiederholen; bei sehr großen Dateien den Lieferanten um eine kleinere Datei bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'szenario',
    stufe: 'fehler',
    fehlerklasse: 'keine',
  },
  'PRUEFUNG-SPEICHER': {
    titel: 'Prüfung brauchte zu viel Speicher',
    klartext: 'Die Prüfung wurde abgebrochen, weil sie mehr Arbeitsspeicher brauchte als erlaubt. Die Rechnung gilt als nicht angenommen.',
    handlung: 'Lieferanten um eine kleinere Datei bitten oder die Rechnung von Hand erfassen.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'szenario',
    stufe: 'fehler',
    fehlerklasse: 'keine',
  },
  'PRUEFUNG-EINGESCHRAENKT': {
    titel: 'Eingeschränkt geprüft (EXTENDED)',
    klartext: 'Die Rechnung nutzt das Profil EXTENDED, eine Erweiterung von EN 16931. Geprüft wurde gegen das XML-Schema CII D16B und die CEN-Regeln; Regeln, die bei gültigen EXTENDED-Rechnungen regelmäßig anschlagen, zählen nur als Warnung. Die Erweiterungen selbst prüft die Belegbrücke nicht.',
    handlung: 'Beträge und Steuern besonders sorgfältig von Hand nachprüfen.',
    ustRelevant: false,
    btBezug: ['BT-24'],
    quelle: 'szenario',
    stufe: 'hinweis',
    fehlerklasse: 'keine',
  },
  'PDF-LESEN': {
    titel: 'PDF nicht lesbar',
    klartext: 'Die PDF-Datei lässt sich nicht lesen; sie ist beschädigt oder verschlüsselt.',
    handlung: 'Lieferanten um eine neue, unverschlüsselte Datei bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'pdf',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
  },
  'PDF-OHNE-XML': {
    titel: 'PDF ohne eingebettete E-Rechnung',
    klartext: `Die PDF-Datei enthält keine eingebettete E-Rechnung (factur-x.xml, xrechnung.xml oder zugferd-invoice.xml). ${SONSTIGE_RECHNUNG}`,
    handlung: 'Rechnungsdaten von Hand erfassen und künftig eine E-Rechnung anfordern.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'pdf',
    stufe: 'warnung',
    fehlerklasse: 'formatfehler',
    rechtsgrundlage: 'BMF 15.10.2025, Rn. 6a',
  },
  'PDF-XML-ANDERER-NAME': {
    titel: 'XML-Anhang mit unüblichem Namen',
    klartext: 'Die PDF enthält eine XML-Datei mit unüblichem Namen. Laden Sie sie einzeln hoch, falls sie die Rechnung ist.',
    handlung: 'Anhang herunterladen und einzeln hochladen.',
    ustRelevant: false,
    btBezug: [],
    quelle: 'pdf',
    stufe: 'hinweis',
    fehlerklasse: 'keine',
  },
  'PDF-XML-MEHRERE': {
    titel: 'Mehrere Rechnungs-XML in der PDF',
    klartext: 'Die PDF enthält mehr als eine XML-Datei mit einem Rechnungsnamen. Geprüft wurde die erste nach der Reihenfolge factur-x.xml, xrechnung.xml, zugferd-invoice.xml.',
    handlung: 'Prüfen, ob die geprüfte Datei die maßgebliche Rechnung ist.',
    ustRelevant: false,
    btBezug: [],
    quelle: 'pdf',
    stufe: 'hinweis',
    fehlerklasse: 'keine',
  },
  'PDF-XML-ZU-GROSS': {
    titel: 'Eingebettetes XML zu groß',
    klartext: 'Die in der PDF eingebettete XML-Datei ist größer als 20 MB und wird nicht verarbeitet.',
    handlung: 'Lieferanten um eine kleinere Datei bitten.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'pdf',
    stufe: 'fehler',
    fehlerklasse: 'formatfehler',
  },
  'BETRAG-FORMAT': {
    titel: 'Betrag mit mehr als 2 Nachkommastellen',
    klartext: 'Ein Betrag auf Belegebene hat mehr als 2 Nachkommastellen oder ist kein Dezimalwert. EN 16931 erlaubt dort höchstens 2 Stellen; die Regeln BR-DEC melden das ebenfalls.',
    handlung: 'Betrag von Hand prüfen; korrigierte Rechnung anfordern, falls er abweicht.',
    ustRelevant: 'unklar',
    btBezug: [],
    quelle: 'plausibilitaet',
    stufe: 'warnung',
    fehlerklasse: 'keine',
  },
}
