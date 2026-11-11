/**
 * Schritte des Beleg-Assistenten (Abschnitt 5.3, B4 bis B6) und Statusübergänge (Abschnitt 4):
 * Dublette entscheiden, Lieferant zuordnen, kontieren, von Hand erfassen, freigeben, ablehnen,
 * Freigabe zurücknehmen, Ablehnung aufheben. Jede Änderung mit Protokolleintrag in derselben
 * Transaktion (R17 Punkt 1).
 */
import { randomUUID } from 'node:crypto'
import { aufbewahrenBis } from '../../fach/aufbewahrung.ts'
import { datumInBerlin } from '../../fach/datum.ts'
import { belegnummer, findeDubletten } from '../../fach/dubletten.ts'
import { aktionErlaubt, pruefeFreigabe, statusNachAufhebung, statusNachZuordnung, vorsteuerGefaehrdet, type Belegaktion } from '../../fach/freigabe.ts'
import { pruefeHanderfassung } from '../../fach/handerfassung.ts'
import { kontierungsquelle, kontierungUebernehmen, kontierungVorschlagen, regelnNachFreigabe, regelnNachRuecknahme, type Zeilenwahl } from '../../fach/kontierung.ts'
import { lieferantVorschlagen, naechstesKreditorenkonto, pruefeKreditorenkonto, schluesselHand, type Lieferantenvorschlag } from '../../fach/lieferant.ts'
import { ergaenzeHanderfassung } from '../../fach/pruefbericht.ts'
import type { Akteur, Anschrift, Beleg, Handerfassung, Kontierung, Lieferant, Uuid } from '../../fach/typen.ts'
import { BelegGeaendert, merkmaleVon, schluesselVon } from '../speicher/belege.ts'
import type { Dienste } from './kontext.ts'

export type Schrittergebnis = { ok: true; beleg: Beleg } | { ok: false; status: 400 | 404 | 409; code: string; text: string }

const abgelehnt = (status: 400 | 404 | 409, code: string, text: string): Schrittergebnis => ({ ok: false, status, code, text })

export const GEAENDERT_TEXT = 'Der Beleg wurde inzwischen geändert, etwa in einem anderen Fenster oder von einem anderen Benutzer. Laden Sie die Seite neu und prüfen Sie den aktuellen Stand.'

function pruefeAktion(b: Beleg, aktion: Belegaktion): Schrittergebnis | null {
  const f = aktionErlaubt(b.status, aktion)
  return f ? abgelehnt(409, 'STATUS', f) : null
}

function benutzerId(akteur: Akteur): Uuid {
  return akteur.art === 'benutzer' ? akteur.id : '00000000-0000-4000-8000-000000000000'
}

/** Schreibt `neu`, aber nur, wenn der Beleg noch so in der Datenbank steht wie `vorher` (optimistische Sperre). */
function speichere(d: Dienste, neu: Beleg, vorher: Beleg): void {
  d.belege.aktualisieren(neu, d.uhr().toISOString(), vorher)
}

/**
 * Transaktion eines Schritts. Hat sich der Beleg seit dem Lesen geändert (zweites Fenster, Doppelklick,
 * zweiter Benutzer), rollt sie zurück und meldet 409, statt den neueren Stand still zu überschreiben.
 */
function schreibe(d: Dienste, neu: Beleg, fn: () => void): Schrittergebnis {
  try {
    d.db.transaktion(fn)
  } catch (e) {
    if (e instanceof BelegGeaendert) return abgelehnt(409, 'GEAENDERT', GEAENDERT_TEXT)
    throw e
  }
  return { ok: true, beleg: neu }
}

/** Belege, deren Erfassung von Hand gerade gespeichert wird (je Server), damit zwei Anfragen nicht dieselbe Berichtsnummer belegen. */
const erfassungLaeuft = new WeakMap<Dienste, Set<Uuid>>()

/** Lieferantenvorschlag nach R10 aus E-Rechnung oder Erfassung von Hand; null ohne Daten. */
export function lieferantenvorschlag(d: Dienste, b: Beleg): Lieferantenvorschlag | null {
  const alle = d.lieferanten.alle()
  if (b.handerfassung) {
    const h = b.handerfassung
    const schluessel = schluesselHand(h)
    return {
      schluessel,
      vorhanden: alle.find((l) => l.schluessel === schluessel) ?? null,
      neu: { schluessel, name: h.lieferantName, ustId: h.lieferantUstId, steuernummer: h.lieferantSteuernummer, anschrift: {} },
    }
  }
  return b.daten ? lieferantVorschlagen(b.daten, alle) : null
}

/** Kontierungsvorschlag (R12) mit den Regeln des zugeordneten Lieferanten. */
export function kontierungsvorschlag(d: Dienste, b: Beleg): Kontierung | null {
  const q = kontierungsquelle(b)
  if (!q) return null
  const e = d.einstellungen.lies()
  const lieferant = b.lieferantId ? d.lieferanten.hole(b.lieferantId) : null
  return kontierungVorschlagen(q, {
    lieferantName: lieferant?.name ?? lieferantenvorschlag(d, b)?.neu.name ?? '',
    regeln: lieferant ? d.regeln.fuerLieferant(lieferant.id) : [],
    sachkonten: d.sachkonten.alle(),
    kleinunternehmer: e.firma.kleinunternehmer,
    buSchluessel: e.datev.buSchluessel,
  })
}

/** Kreditorenkonto für B4: das vergebene oder das nächste freie (R10 Punkt 3). */
export function kreditorVorschlag(d: Dienste, lieferant: Lieferant | null): number | null {
  if (lieferant?.kreditorKonto) return lieferant.kreditorKonto
  return naechstesKreditorenkonto(d.lieferanten.vergebeneKreditoren(), d.einstellungen.lies().datev)
}

export function entscheideDublette(d: Dienste, b: Beleg, ergebnis: 'keine-dublette' | 'dublette', akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'dublette')
  if (f) return f
  const hinweise = b.dubletten.filter((h) => h.stufe === 'gleiche-rechnung')
  if (hinweise.length === 0) return abgelehnt(409, 'KEINE-DUBLETTE', 'Für diesen Beleg gibt es keine mögliche Dublette zu entscheiden.')
  const jetzt = d.uhr().toISOString()
  const andere = hinweise.map((h) => {
    const anderer = d.belege.hole(h.andererBelegId)
    return { id: h.andererBelegId, nummer: anderer ? belegnummer(anderer.laufnummer) : '?' }
  })
  const neu: Beleg = { ...b, dublettenEntscheidung: { ergebnis, benutzerId: benutzerId(akteur), am: jetzt } }
  if (ergebnis === 'dublette') {
    neu.status = 'abgelehnt'
    neu.ablehnung = { benutzerId: benutzerId(akteur), am: jetzt, grund: `Dublette von ${andere.map((a) => a.nummer).join(', ')}` }
  }
  return schreibe(d, neu, () => {
    speichere(d, neu, b)
    d.protokoll.anhaengen({ akteur, aktion: 'dublette-entschieden', belegId: b.id, daten: { ergebnis, andere } })
    if (ergebnis === 'dublette') d.protokoll.anhaengen({ akteur, aktion: 'abgelehnt', belegId: b.id, daten: { grund: neu.ablehnung!.grund, vorherigerStatus: b.status } })
  })
}

export interface Zuordnung {
  lieferantId?: Uuid
  neu?: { name: string; ustId?: string | null; steuernummer?: string | null; anschrift?: Anschrift }
  /** Kreditorenkonto von Hand; null = bei der ersten Freigabe vergeben */
  kreditorKonto?: number | null
}

/** B4: vorhandenen oder neuen Lieferanten (bei Typ 389 Geschäftspartner) zuordnen, Kreditorenkonto optional von Hand. */
export function ordneLieferantZu(d: Dienste, b: Beleg, z: Zuordnung, akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'zuordnen')
  if (f) return f
  const vorschlag = lieferantenvorschlag(d, b)
  if (!vorschlag) return abgelehnt(409, 'KEINE-DATEN', 'Der Beleg enthält keine lesbaren Rechnungsdaten.')
  let lieferant: Lieferant
  let angelegt = false
  if (z.lieferantId) {
    const vorhanden = d.lieferanten.hole(z.lieferantId)
    if (!vorhanden) return abgelehnt(404, 'NICHT-GEFUNDEN', 'Diesen Lieferanten gibt es nicht.')
    lieferant = vorhanden
  } else if (z.neu) {
    if (d.lieferanten.nachSchluessel(vorschlag.schluessel)) {
      return abgelehnt(409, 'LIEFERANT-VORHANDEN', 'Ein Lieferant mit diesem Schlüssel (USt-IdNr., Steuernummer oder Name) ist schon angelegt. Wählen Sie ihn aus.')
    }
    lieferant = {
      id: randomUUID().toUpperCase(),
      schluessel: vorschlag.schluessel,
      name: z.neu.name.trim() || vorschlag.neu.name,
      ustId: z.neu.ustId === undefined ? vorschlag.neu.ustId : z.neu.ustId,
      steuernummer: z.neu.steuernummer === undefined ? vorschlag.neu.steuernummer : z.neu.steuernummer,
      anschrift: z.neu.anschrift ?? vorschlag.neu.anschrift,
      kreditorKonto: null,
      angelegtAm: d.uhr().toISOString(),
    }
    angelegt = true
  } else return abgelehnt(400, 'EINGABE', 'Wählen Sie einen vorhandenen Lieferanten oder legen Sie einen neuen an.')

  // Kreditorenkonto von Hand (R10 Punkt 3): Stellen, Kreis, nicht doppelt; nach einer Übergabe nicht mehr änderbar
  if (z.kreditorKonto !== undefined && z.kreditorKonto !== lieferant.kreditorKonto) {
    if (lieferant.kreditorKonto !== null && d.belege.liste({ status: 'exportiert' }).some((x) => x.lieferantId === lieferant.id)) {
      return abgelehnt(409, 'KREDITOR-UEBERGEBEN', `Das Kreditorenkonto ${lieferant.kreditorKonto} ist schon an die Kanzlei übergeben und bleibt.`)
    }
    if (z.kreditorKonto !== null) {
      const fehler = pruefeKreditorenkonto(z.kreditorKonto, d.lieferanten.vergebeneKreditoren(lieferant.id), d.einstellungen.lies().datev)
      if (fehler) return abgelehnt(400, 'KREDITOR', fehler)
    }
    lieferant = { ...lieferant, kreditorKonto: z.kreditorKonto }
  }
  // Ein anderer Lieferant ändert Buchungstext und Historie: Kontierung neu
  const wechsel = b.lieferantId !== lieferant.id
  const neu: Beleg = { ...b, lieferantId: lieferant.id, kontierung: wechsel ? null : b.kontierung }
  neu.status = statusNachZuordnung(neu)
  return schreibe(d, neu, () => {
    if (angelegt) d.lieferanten.anlegen(lieferant)
    else d.lieferanten.aktualisieren(lieferant)
    speichere(d, neu, b)
    d.protokoll.anhaengen({
      akteur,
      aktion: 'lieferant-zugeordnet',
      belegId: b.id,
      daten: { lieferantId: lieferant.id, schluessel: lieferant.schluessel, name: lieferant.name, neu: angelegt, kreditorKonto: lieferant.kreditorKonto, belegSchluessel: schluesselVon(b) },
    })
  })
}

/** B5: Sachkonto je Zeile (und Buchungstext, BU-Schlüssel bei Sonderfällen) übernehmen. */
export function kontiere(d: Dienste, b: Beleg, wahl: Zeilenwahl[], akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'kontieren')
  if (f) return f
  if (!b.lieferantId) return abgelehnt(409, 'LIEFERANT-FEHLT', 'Ordnen Sie zuerst den Lieferanten zu (Schritt „Zuordnen“).')
  const vorschlag = kontierungsvorschlag(d, b)
  if (!vorschlag) return abgelehnt(409, 'KEINE-DATEN', 'Der Beleg enthält keine lesbaren Rechnungsdaten.')
  const r = kontierungUebernehmen(vorschlag, wahl, d.sachkonten.alle(), d.einstellungen.lies().datev.buSchluessel)
  if (!r.ok) return abgelehnt(400, 'KONTIERUNG', r.fehler)
  const neu: Beleg = { ...b, kontierung: r.kontierung }
  neu.status = statusNachZuordnung(neu)
  return schreibe(d, neu, () => {
    speichere(d, neu, b)
    d.protokoll.anhaengen({
      akteur,
      aktion: 'kontiert',
      belegId: b.id,
      daten: {
        nurBeleg: r.kontierung.nurBeleg,
        sollHaben: r.kontierung.sollHaben,
        herkunft: r.kontierung.herkunft,
        zeilen: r.kontierung.zeilen.map((z) => ({ bruttoCent: z.bruttoCent, kategorie: z.steuerkategorie, satz: z.steuersatz, steuerfall: z.steuerfall, sachkonto: z.sachkonto, buSchluessel: z.buSchluessel, buchungstext: z.buchungstext })),
        manuellPruefen: r.kontierung.manuellPruefen,
      },
    })
  })
}

/** B3 bei sonstigen Rechnungen (R16): Werte von Hand erfassen; danach gelten R8 bis R15. */
export async function erfasseVonHand(d: Dienste, b: Beleg, h: Handerfassung, akteur: Akteur): Promise<Schrittergebnis> {
  const f = pruefeAktion(b, 'handerfassung')
  if (f) return f
  if (b.format.belegart !== 'sonstige-rechnung') return abgelehnt(409, 'E-RECHNUNG', 'Bei einer E-Rechnung gilt der XML-Teil; eine Erfassung von Hand ist nicht vorgesehen.')
  const laufend = erfassungLaeuft.get(d) ?? new Set<Uuid>()
  erfassungLaeuft.set(d, laufend)
  if (laufend.has(b.id)) return abgelehnt(409, 'LAEUFT', 'Die Erfassung dieses Belegs wird gerade gespeichert. Bitte einen Moment warten und die Seite neu laden.')
  laufend.add(b.id)
  try {
    return await speichereErfassung(d, b, h, akteur)
  } finally {
    laufend.delete(b.id)
  }
}

async function speichereErfassung(d: Dienste, b: Beleg, h: Handerfassung, akteur: Akteur): Promise<Schrittergebnis> {
  const jetzt = d.uhr()
  const pruefung = pruefeHanderfassung(h, datumInBerlin(jetzt))
  if (pruefung.fehler.length) return abgelehnt(400, 'HANDERFASSUNG', pruefung.fehler.join(' '))
  if (!b.pruefung) return abgelehnt(409, 'PRUEFUNG-FEHLT', 'Die Prüfung des Belegs ist noch nicht abgeschlossen.')
  const ergebnis = ergaenzeHanderfassung(b.pruefung, h, pruefung.befunde)
  const einstellungen = d.einstellungen.lies()
  const neu: Beleg = {
    ...b,
    handerfassung: h,
    pruefung: { ...ergebnis, zeitpunkt: jetzt.toISOString() },
    // Neue Werte ändern Steuerzeilen und Buchungstext: Kontierung neu
    kontierung: null,
    status: 'geprueft',
    aufbewahrenBis: aufbewahrenBis(einstellungen.aufbewahrung, { rechnungsdatum: h.rechnungsdatum, eingangAm: b.eingangAm }),
  }
  neu.dubletten = findeDubletten(
    merkmaleVon(neu),
    d.belege.dublettenMerkmale().filter((m) => m.id !== b.id),
  )
  if (neu.dublettenEntscheidung && !neu.dubletten.some((x) => x.stufe === 'gleiche-rechnung')) neu.dublettenEntscheidung = null
  const nummer = d.db.eins<{ n: number }>("SELECT count(*) AS n FROM dateien WHERE art = 'bericht' AND pfad LIKE ?", [`berichte/${b.id}/%`])!.n + 1
  const bericht = await d.ablage.speichereBericht(b.id, nummer, JSON.stringify(neu.pruefung, null, 2))
  neu.pruefberichtSha256 = bericht.sha256
  const zeit = jetzt.toISOString()
  const ergebnisSchritt = schreibe(d, neu, () => {
    speichere(d, neu, b)
    d.db.aendern('INSERT INTO dateien (pfad, sha256, art, mime_typ, bytes, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [bericht.pfad, bericht.sha256, 'bericht', 'application/json', bericht.bytes, zeit])
    d.protokoll.anhaengen({
      akteur,
      aktion: 'pruefung',
      belegId: b.id,
      daten: {
        art: 'handerfassung',
        handerfassung: h as unknown as Record<string, unknown>,
        angenommen: neu.pruefung!.angenommen,
        szenario: neu.pruefung!.szenario,
        befunde: neu.pruefung!.befunde.length,
        berichtSha256: bericht.sha256,
        bericht: bericht.pfad,
        dubletten: neu.dubletten.map((x) => ({ stufe: x.stufe, andererBelegId: x.andererBelegId })),
      },
    })
  })
  // Gescheitert (Beleg inzwischen geändert): Der Bericht ist nirgends verbucht und käme sonst als
  // „Datei ohne Protokolleintrag“ in die Kettenprüfung.
  if (!ergebnisSchritt.ok) await d.ablage.verwerfeUnverbucht(bericht.pfad)
  return ergebnisSchritt
}

/** B6: Freigabe (R14); vergibt beim ersten Mal das Kreditorenkonto (R10) und schreibt die Kontierungsregeln fort (R12 Punkt 8). */
export function gibFrei(d: Dienste, b: Beleg, eingabe: { inhaltGeprueft: boolean; begruendung: string | null }, akteur: Akteur): Schrittergebnis {
  const f = pruefeFreigabe(b, eingabe)
  if (f) return abgelehnt(409, 'FREIGABE', f)
  const lieferant = d.lieferanten.hole(b.lieferantId!)
  if (!lieferant) return abgelehnt(409, 'LIEFERANT-FEHLT', 'Der zugeordnete Lieferant fehlt.')
  const kontierung = b.kontierung!
  const einstellungen = d.einstellungen.lies()
  let kreditor = lieferant.kreditorKonto
  if (!kontierung.nurBeleg && kreditor === null) {
    kreditor = naechstesKreditorenkonto(d.lieferanten.vergebeneKreditoren(), einstellungen.datev)
    if (kreditor === null) return abgelehnt(409, 'KREDITORENKREIS-VOLL', `Im Kreditorenkreis ${einstellungen.datev.kreditorenVon} bis ${einstellungen.datev.kreditorenBis} ist kein Konto mehr frei.`)
  }
  const jetzt = d.uhr().toISOString()
  const regeln = regelnNachFreigabe(d.regeln.fuerLieferant(lieferant.id), lieferant.id, kontierung, jetzt)
  const begruendung = eingabe.begruendung?.trim() || null
  const neu: Beleg = {
    ...b,
    status: 'freigegeben',
    inhaltGeprueft: true,
    freigabe: { benutzerId: benutzerId(akteur), am: jetzt, begruendung },
    aufbewahrenBis: aufbewahrenBis(einstellungen.aufbewahrung, { rechnungsdatum: b.handerfassung?.rechnungsdatum ?? b.daten?.rechnungsdatum ?? null, eingangAm: b.eingangAm, freigabeAm: jetzt }),
  }
  return schreibe(d, neu, () => {
    if (kreditor !== lieferant.kreditorKonto) d.lieferanten.aktualisieren({ ...lieferant, kreditorKonto: kreditor })
    for (const r of regeln) d.regeln.speichern(r)
    speichere(d, neu, b)
    d.protokoll.anhaengen({
      akteur,
      aktion: 'freigegeben',
      belegId: b.id,
      daten: {
        kreditorKonto: kontierung.nurBeleg ? null : kreditor,
        nurBeleg: kontierung.nurBeleg,
        zeilen: kontierung.zeilen.map((z) => ({ bruttoCent: z.bruttoCent, sachkonto: z.sachkonto, buSchluessel: z.buSchluessel })),
        inhaltGeprueft: true,
        begruendung,
        vorsteuerGefaehrdet: vorsteuerGefaehrdet(b),
        aufbewahrenBis: neu.aufbewahrenBis,
      },
    })
  })
}

export function nimmFreigabeZurueck(d: Dienste, b: Beleg, grund: string | null, akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'freigabe-zuruecknehmen')
  if (f) return f
  const neu: Beleg = { ...b, status: 'kontiert', freigabe: null, inhaltGeprueft: false }
  const r = b.lieferantId && b.kontierung ? regelnNachRuecknahme(d.regeln.fuerLieferant(b.lieferantId), b.lieferantId, b.kontierung) : { aendern: [], entfernen: [] }
  return schreibe(d, neu, () => {
    for (const x of r.aendern) d.regeln.speichern(x)
    for (const x of r.entfernen) d.regeln.entfernen(x)
    speichere(d, neu, b)
    d.protokoll.anhaengen({ akteur, aktion: 'freigabe-zurueckgenommen', belegId: b.id, daten: { grund: grund?.trim() || null, freigabeVom: b.freigabe?.am ?? null } })
  })
}

export const ABLEHNUNG_MIN = 5

export function lehneAb(d: Dienste, b: Beleg, grund: string, akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'ablehnen')
  if (f) return f
  // Solange die Prüfung im Worker läuft, schriebe ihr Ergebnis die Ablehnung wieder über
  if (b.status === 'eingegangen' && b.pruefung === null) return abgelehnt(409, 'PRUEFUNG-LAEUFT', 'Die Prüfung dieses Belegs läuft noch. Bitte einen Moment warten und dann erneut ablehnen.')
  const text = grund.trim()
  if (text.length < ABLEHNUNG_MIN) return abgelehnt(400, 'GRUND', `Geben Sie einen Grund mit mindestens ${ABLEHNUNG_MIN} Zeichen an.`)
  const neu: Beleg = { ...b, status: 'abgelehnt', ablehnung: { benutzerId: benutzerId(akteur), am: d.uhr().toISOString(), grund: text } }
  return schreibe(d, neu, () => {
    speichere(d, neu, b)
    d.protokoll.anhaengen({ akteur, aktion: 'abgelehnt', belegId: b.id, daten: { grund: text, vorherigerStatus: b.status } })
  })
}

export function hebeAblehnungAuf(d: Dienste, b: Beleg, akteur: Akteur): Schrittergebnis {
  const f = pruefeAktion(b, 'ablehnung-aufheben')
  if (f) return f
  // Eine als Dublette verworfene Rechnung wird neu entschieden
  const neu: Beleg = { ...b, status: statusNachAufhebung(b), ablehnung: null, dublettenEntscheidung: b.dublettenEntscheidung?.ergebnis === 'dublette' ? null : b.dublettenEntscheidung }
  return schreibe(d, neu, () => {
    speichere(d, neu, b)
    d.protokoll.anhaengen({ akteur, aktion: 'ablehnung-aufgehoben', belegId: b.id, daten: { grund: b.ablehnung?.grund ?? null, neuerStatus: neu.status } })
  })
}
