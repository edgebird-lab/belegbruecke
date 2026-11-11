/**
 * Eingang eines Belegs (R1, R9, R15, R17; Ablauf aus Abschnitt 5.3 B1/B2): Annahme prüfen,
 * identische Datei verwerfen, Original ablegen, Beleg anlegen, prüfen, Prüfbericht ablegen,
 * Dubletten der Stufen 2 und 3 suchen. Jeder Schritt mit Protokolleintrag in derselben Transaktion.
 */
import { createHash, randomUUID } from 'node:crypto'
import { bereinigeDateiname, ENDUNG, pruefeAnnahme, type Dateiart } from '../../fach/annahme.ts'
import { aufbewahrenBis } from '../../fach/aufbewahrung.ts'
import { datumInBerlin } from '../../fach/datum.ts'
import { belegnummer, findeDubletten } from '../../fach/dubletten.ts'
import { formatBezeichnung } from '../../fach/formaterkennung.ts'
import { ampel, erstellePruefergebnis, type Ampel } from '../../fach/pruefbericht.ts'
import type { Akteur, Beleg, Belegstatus, Dublettenhinweis, Formaterkennung, Quelle, Uuid } from '../../fach/typen.ts'
import { artefaktversionen } from '../../pruefung/artefakte.ts'
import { verarbeiteDatei } from '../../pruefung/eingang.ts'
import { merkmaleVon } from '../speicher/belege.ts'
import type { Dienste } from './kontext.ts'

export interface Eingangsergebnis {
  dateiname: string
  ok: boolean
  code?: 'DATEI-LEER' | 'DATEI-TYP' | 'DATEI-GROESSE' | 'DUBLETTE-IDENTISCH'
  text?: string
  belegId?: Uuid
  laufnummer?: number
  status?: Belegstatus
  format?: string
  ampel?: Ampel
  dubletten?: Dublettenhinweis[]
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

function dateiartVon(mime: Beleg['original']['mimeTyp']): Dateiart {
  return mime === 'application/xml' ? 'xml' : mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpeg'
}

function vorlaeufigesFormat(art: Dateiart, sha: string): Formaterkennung {
  return {
    belegart: art === 'xml' ? 'e-rechnung' : 'sonstige-rechnung',
    container: art === 'xml' ? 'xml' : art === 'pdf' ? 'pdf-ohne-xml' : 'bild',
    syntax: null,
    profil: null,
    spezifikationsKennung: null,
    eingebettetAls: null,
    xmlSha256: art === 'xml' ? sha : null,
    zeichensatz: null,
    grund: 'Prüfung steht aus',
  }
}

function quelleText(q: Quelle): string {
  return q.art
}

/** Nimmt eine Datei an und prüft sie. Abgelehnte Dateien erzeugen keinen Beleg, nur einen Protokolleintrag. */
export async function nimmAn(d: Dienste, datei: { name: string; bytes: Uint8Array }, quelle: Quelle, akteur: Akteur): Promise<Eingangsergebnis> {
  const dateiname = bereinigeDateiname(datei.name)
  const sha = sha256(datei.bytes)
  const annahme = pruefeAnnahme(datei.bytes)
  const grunddaten = { dateiname, groesseBytes: datei.bytes.length, sha256: sha, quelle: quelleText(quelle) }
  if (!annahme.ok) {
    d.protokoll.anhaengen({ akteur, aktion: 'eingang-verworfen', belegId: null, daten: { ...grunddaten, grund: annahme.code } })
    return { dateiname, ok: false, code: annahme.code, text: annahme.text }
  }
  const vorhanden = d.belege.mitOriginalHash(sha)
  if (vorhanden) {
    d.protokoll.anhaengen({ akteur, aktion: 'eingang-verworfen', belegId: null, daten: { ...grunddaten, grund: 'identische-datei', andererBelegId: vorhanden.id } })
    return {
      dateiname,
      ok: false,
      code: 'DUBLETTE-IDENTISCH',
      text: `Diese Datei liegt bereits als ${belegnummer(vorhanden.laufnummer)} im Archiv; es wurde kein neuer Beleg angelegt.`,
      belegId: vorhanden.id,
      laufnummer: vorhanden.laufnummer,
    }
  }

  const abgelegt = await d.ablage.speichereInhalt(datei.bytes, ENDUNG[annahme.art])
  const jetzt = d.uhr().toISOString()
  const einstellungen = d.einstellungen.lies()
  const beleg: Beleg = {
    formatVersion: 1,
    id: randomUUID().toUpperCase(),
    laufnummer: 0,
    status: 'eingegangen',
    quelle,
    eingangAm: jetzt,
    original: { sha256: sha, dateiname, mimeTyp: annahme.mimeTyp, groesseBytes: datei.bytes.length, speicherpfad: abgelegt.pfad },
    format: vorlaeufigesFormat(annahme.art, sha),
    daten: null,
    handerfassung: null,
    pruefung: null,
    pruefberichtSha256: null,
    dubletten: [],
    dublettenEntscheidung: null,
    lieferantId: null,
    kontierung: null,
    inhaltGeprueft: false,
    freigabe: null,
    ablehnung: null,
    exportlaufId: null,
    aufbewahrenBis: aufbewahrenBis(einstellungen.aufbewahrung, { rechnungsdatum: null, eingangAm: jetzt }),
  }
  d.db.transaktion(() => {
    beleg.laufnummer = d.belege.naechsteLaufnummer()
    d.belege.einfuegen(beleg, jetzt)
    d.db.aendern('INSERT OR IGNORE INTO dateien (pfad, sha256, art, mime_typ, bytes, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [abgelegt.pfad, sha, 'original', annahme.mimeTyp, datei.bytes.length, jetzt])
    d.protokoll.anhaengen({ akteur, aktion: 'eingang', belegId: beleg.id, daten: { ...grunddaten, pfad: abgelegt.pfad, laufnummer: beleg.laufnummer } })
  })
  return pruefeBeleg(d, beleg, datei.bytes)
}

/** Prüft einen eingegangenen Beleg (auch erneut nach einem Abbruch) und legt den Prüfbericht ab. */
export async function pruefeBeleg(d: Dienste, beleg: Beleg, bytes?: Uint8Array): Promise<Eingangsergebnis> {
  const inhalt = bytes ?? (await d.ablage.lies(beleg.original.speicherpfad))
  const teil = await verarbeiteDatei(inhalt, dateiartVon(beleg.original.mimeTyp), d.pruefer)
  const einstellungen = d.einstellungen.lies()
  const jetzt = d.uhr()
  const versionen = artefaktversionen()
  const pruefung = erstellePruefergebnis(teil, {
    firma: einstellungen.firma.name.trim() ? einstellungen.firma : null,
    heute: datumInBerlin(jetzt),
    zeitpunkt: jetzt.toISOString(),
    pruefprogramm: `belegbruecke ${d.version}`,
    artefakte: { konfiguration: versionen?.konfiguration ?? 'fehlt', enSchematron: versionen?.enSchematron ?? 'fehlt', xrSchematron: versionen?.xrSchematron ?? 'fehlt' },
  })
  const nummer = d.db.eins<{ n: number }>("SELECT count(*) AS n FROM dateien WHERE art = 'bericht' AND pfad LIKE ?", [`berichte/${beleg.id}/%`])!.n + 1
  const bericht = await d.ablage.speichereBericht(beleg.id, nummer, JSON.stringify(pruefung, null, 2))

  const geprueft: Beleg = {
    ...beleg,
    format: teil.format,
    daten: teil.daten,
    pruefung,
    pruefberichtSha256: bericht.sha256,
    // Sonstige Rechnungen bleiben „eingegangen“ bis zur Erfassung von Hand (R16)
    status: teil.format.belegart === 'e-rechnung' ? 'geprueft' : 'eingegangen',
    aufbewahrenBis: aufbewahrenBis(einstellungen.aufbewahrung, { rechnungsdatum: teil.daten?.rechnungsdatum ?? null, eingangAm: beleg.eingangAm }),
  }
  geprueft.dubletten = findeDubletten(
    merkmaleVon(geprueft),
    d.belege.dublettenMerkmale().filter((m) => m.id !== geprueft.id),
  )
  const zeit = jetzt.toISOString()
  d.db.transaktion(() => {
    d.belege.aktualisieren(geprueft, zeit)
    d.db.aendern('INSERT INTO dateien (pfad, sha256, art, mime_typ, bytes, angelegt_am) VALUES (?, ?, ?, ?, ?, ?)', [bericht.pfad, bericht.sha256, 'bericht', 'application/json', bericht.bytes, zeit])
    d.protokoll.anhaengen({
      akteur: { art: 'system', dienst: 'pruefung' },
      aktion: 'pruefung',
      belegId: geprueft.id,
      daten: {
        angenommen: pruefung.angenommen,
        szenario: pruefung.szenario,
        format: formatBezeichnung(geprueft.format),
        befunde: pruefung.befunde.length,
        berichtSha256: bericht.sha256,
        bericht: bericht.pfad,
        dubletten: geprueft.dubletten.map((h) => ({ stufe: h.stufe, andererBelegId: h.andererBelegId })),
      },
    })
  })
  return {
    dateiname: geprueft.original.dateiname,
    ok: true,
    belegId: geprueft.id,
    laufnummer: geprueft.laufnummer,
    status: geprueft.status,
    format: formatBezeichnung(geprueft.format),
    ampel: ampel(geprueft.format, pruefung),
    dubletten: geprueft.dubletten,
  }
}

/** Belege, deren Prüfung unterbrochen wurde (z. B. Neustart), erneut prüfen. */
export async function pruefeOffene(d: Dienste): Promise<number> {
  const offen = d.belege.liste({ status: 'eingegangen' }).filter((b) => b.pruefung === null)
  for (const b of offen) await pruefeBeleg(d, b)
  return offen.length
}
