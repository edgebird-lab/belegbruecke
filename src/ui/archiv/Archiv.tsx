/**
 * Archiv (Spezifikation 5.5, Schritt 3.8): Suche nach Lieferant, Rechnungsnummer, Betrag, Zeitraum,
 * Status und Volltext in Name und E-Mail; Belegdetail mit Protokoll; „Archiv prüfen“ mit Kettenbericht
 * in der Druckansicht; Prüferexport (R22).
 */
import { useState, type FormEvent } from 'react'
import type { Belegstatus, Protokolleintrag } from '../../fach/typen.ts'
import { api, fehlerText, herunterladen, useLaden, type Belegdetail, type Belegzeile, type Kettenbericht } from '../api.ts'
import { Belegtabelle } from '../belege/Belegtabelle.tsx'
import { Eckdaten } from '../beleg/Eckdaten.tsx'
import { AmpelAnzeige, Feld, Hashwert, Hinweis, Laden, Lernhinweis, Seitentitel, Statusmarke, Tabellenrahmen, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { betrag, datum, groesse, status, useApp, zeit } from '../kontext.ts'
import { routeZuHash } from '../route.ts'

const STATUS: Belegstatus[] = ['eingegangen', 'geprueft', 'kontiert', 'freigegeben', 'exportiert', 'abgelehnt']

export function Archiv({ id }: { id: string | null }) {
  return id ? <Belegakte id={id} /> : <Archivsuche />
}

function Archivsuche() {
  const { melde } = useApp()
  const [eingabe, setEingabe] = useState({ suche: '', betrag: '', von: '', bis: '', status: '' as Belegstatus | '' })
  const [abfrage, setAbfrage] = useState<string | null>(null)
  const ergebnis = useLaden<{ belege: Belegzeile[] }>(abfrage)
  const [kette, setKette] = useState<{ bericht: Kettenbericht; text: string } | null>(null)
  const [anker, setAnker] = useState({ nr: '', hash: '' })
  const [prueft, setPrueft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [export_, setExport] = useState({ von: '', bis: '' })

  const suchen = (e: FormEvent) => {
    e.preventDefault()
    const p = new URLSearchParams()
    if (eingabe.suche.trim()) p.set('suche', eingabe.suche.trim())
    if (eingabe.betrag.trim()) p.set('betrag', eingabe.betrag.trim())
    if (eingabe.von) p.set('von', eingabe.von)
    if (eingabe.bis) p.set('bis', eingabe.bis)
    if (eingabe.status) p.set('status', eingabe.status)
    setAbfrage(`/belege?${p}`)
  }

  const pruefen = async () => {
    setFehler(null)
    setPrueft(true)
    try {
      const a = anker.nr && anker.hash ? [{ nr: Number(anker.nr), hash: anker.hash.trim().toLowerCase() }] : []
      setKette(await api<{ bericht: Kettenbericht; text: string }>('/archiv/pruefen', { daten: { anker: a } }))
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setPrueft(false)
    }
  }

  const prueferexport = async () => {
    setFehler(null)
    try {
      const name = await herunterladen('/archiv/prueferexport', { daten: { von: export_.von || null, bis: export_.bis || null } }, 'Prueferexport.zip')
      melde(`Prüferexport ${name} gespeichert.`)
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }

  return (
    <>
      <Seitentitel unter="Belege finden, Archiv prüfen, Daten für die Betriebsprüfung">Archiv</Seitentitel>
      <form className="karte suchformular" role="search" aria-label="Archiv durchsuchen" onSubmit={suchen}>
        <div className="feldreihe">
          <Textfeld label="Suche (Lieferant, Name, E-Mail, Rechnungsnummer, Datei)" typ="search" wert={eingabe.suche} aendern={(suche) => setEingabe({ ...eingabe, suche })} />
          <Textfeld label="Betrag" wert={eingabe.betrag} aendern={(b) => setEingabe({ ...eingabe, betrag: b })} placeholder="336,90" breite="schmal" />
          <Textfeld label="Rechnungsdatum von" typ="date" wert={eingabe.von} aendern={(von) => setEingabe({ ...eingabe, von })} />
          <Textfeld label="bis" typ="date" wert={eingabe.bis} aendern={(bis) => setEingabe({ ...eingabe, bis })} />
          <Feld label="Status">
            {(fid) => (
              <select id={fid} value={eingabe.status} onChange={(e) => setEingabe({ ...eingabe, status: e.target.value as Belegstatus | '' })}>
                <option value="">alle</option>
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {status(s)}
                  </option>
                ))}
              </select>
            )}
          </Feld>
        </div>
        <div className="knopfreihe">
          <button type="submit" className="knopf knopf-haupt">
            Suchen
          </button>
        </div>
      </form>
      {ergebnis.fehler && <Hinweis art="fehler">{ergebnis.fehler}</Hinweis>}
      {ergebnis.laedt && <Laden />}
      {ergebnis.daten && (
        <section aria-labelledby="treffer-titel">
          <h2 id="treffer-titel">
            {ergebnis.daten.belege.length} Treffer
          </h2>
          <Belegtabelle belege={ergebnis.daten.belege} titel="Suchergebnis" ziel={(b) => ({ seite: 'archiv', id: b.id })} />
        </section>
      )}

      <section className="karte" aria-labelledby="kette-titel">
        <h2 id="kette-titel">Archiv prüfen</h2>
        <Lernhinweis titel="Hashkette">
          Jeder Protokolleintrag enthält den SHA-256-Hash seines Vorgängers. Die Prüfung rechnet die Kette nach und vergleicht jede Datei unter originale/ und berichte/ mit dem Hash aus dem Protokoll. Ein Kettenanker aus einem Übergabeprotokoll zeigt zusätzlich, dass bis dahin nichts neu geschrieben wurde.
        </Lernhinweis>
        {/* Im Druck nicht: Der Kettenbericht nennt die abgeglichenen Anker selbst */}
        <fieldset className="feldreihe nicht-drucken">
          <legend>Kettenanker aus einem Übergabeprotokoll (freiwillig)</legend>
          <Textfeld label="Nummer" inputMode="numeric" wert={anker.nr} aendern={(nr) => setAnker({ ...anker, nr: nr.replace(/\D/g, '') })} breite="schmal" />
          <Textfeld label="Hash" wert={anker.hash} aendern={(hash) => setAnker({ ...anker, hash })} />
        </fieldset>
        <div className="knopfreihe">
          <button type="button" className="knopf knopf-haupt" disabled={prueft} onClick={() => void pruefen()}>
            Archiv prüfen
          </button>
          {kette && (
            <button type="button" className="knopf" onClick={() => window.print()}>
              Kettenbericht drucken
            </button>
          )}
        </div>
        {prueft && <Laden text="Archiv wird geprüft …" />}
        {kette && (
          <div className="kettenbericht">
            <Hinweis art={kette.bericht.ok ? 'erfolg' : 'fehler'} titel={kette.bericht.ok ? 'In Ordnung' : 'Fehler gefunden'}>
              {kette.bericht.eintraege} Protokolleinträge und {kette.bericht.dateien} Dateien geprüft.
              {kette.bericht.fehler.length > 0 && (
                <ul>
                  {kette.bericht.fehler.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </Hinweis>
            <pre className="kettenbericht-text">{kette.text}</pre>
          </div>
        )}
      </section>

      <section className="karte nicht-drucken" aria-labelledby="pruefer-titel">
        <h2 id="pruefer-titel">Prüferexport</h2>
        <p>ZIP für den Datenzugriff der Betriebsprüfung: Originale, Prüfberichte, alle Belegdaten als CSV, das vollständige Protokoll und der Kettenbericht. Der Export wird protokolliert.</p>
        <div className="feldreihe">
          <Textfeld label="Rechnungsdatum von" typ="date" wert={export_.von} aendern={(von) => setExport({ ...export_, von })} />
          <Textfeld label="bis" typ="date" wert={export_.bis} aendern={(bis) => setExport({ ...export_, bis })} />
        </div>
        <div className="knopfreihe">
          <button type="button" className="knopf" onClick={() => void prueferexport()}>
            Prüferexport herunterladen
          </button>
        </div>
      </section>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
    </>
  )
}

const AKTION: Record<Protokolleintrag['aktion'], string> = {
  eingang: 'Eingang',
  'eingang-verworfen': 'Eingang verworfen',
  pruefung: 'Prüfung',
  'dublette-entschieden': 'Dublette entschieden',
  'lieferant-zugeordnet': 'Lieferant zugeordnet',
  kontiert: 'Kontiert',
  freigegeben: 'Freigegeben',
  'freigabe-zurueckgenommen': 'Freigabe zurückgenommen',
  abgelehnt: 'Abgelehnt',
  'ablehnung-aufgehoben': 'Ablehnung aufgehoben',
  exportiert: 'Übergeben',
  'einstellungen-geaendert': 'Einstellungen geändert',
  'kette-geprueft': 'Kette geprüft',
  prueferexport: 'Prüferexport',
}

/** Belegdetail: alle Daten, Prüfbericht, Original und Protokoll des Belegs. */
function Belegakte({ id }: { id: string }) {
  const detail = useLaden<Belegdetail>(`/belege/${id}`)
  if (detail.fehler) return <Hinweis art="fehler">{detail.fehler}</Hinweis>
  if (!detail.daten) return <Laden />
  const { beleg: b, zusammenfassung: z, protokoll } = detail.daten
  return (
    <>
      <Seitentitel unter={<>{z.format} · <AmpelAnzeige ampel={z.ampel} /> · <Statusmarke wert={b.status} /></>}>
        {z.belegnummer}
        {z.lieferant ? ` · ${z.lieferant}` : ''}
      </Seitentitel>
      <div className="knopfreihe nicht-drucken">
        <a className="knopf" href={`/api/belege/${b.id}/original`} download>
          Original herunterladen
        </a>
        <a className="knopf" href={`/api/belege/${b.id}/bericht`} download>
          Prüfbericht (JSON)
        </a>
        <a className="knopf" href={routeZuHash({ seite: 'beleg', id: b.id, schritt: 'pruefen' })}>
          Im Assistenten öffnen
        </a>
        <a className="knopf" href={routeZuHash({ seite: 'archiv', id: null })}>
          Zur Suche
        </a>
      </div>
      <section className="karte" aria-labelledby="akte-daten">
        <h2 id="akte-daten">Daten</h2>
        <dl className="eckdaten">
          <dt>Datei</dt>
          <dd>
            {b.original.dateiname} ({groesse(b.original.groesseBytes)})
          </dd>
          <dt>SHA-256</dt>
          <dd>
            <Hashwert wert={b.original.sha256} />
          </dd>
          <dt>Eingang</dt>
          <dd>
            {zeit(b.eingangAm)} per {b.quelle.art === 'upload' ? 'Upload' : `E-Mail von ${b.quelle.absender}`}
          </dd>
          <dt>Aufbewahrung</dt>
          <dd>{detail.daten.aufbewahrung}</dd>
          {b.freigabe && (
            <>
              <dt>Freigabe</dt>
              <dd>
                {zeit(b.freigabe.am)}
                {b.freigabe.begruendung && ` – ${b.freigabe.begruendung}`}
              </dd>
            </>
          )}
          {b.ablehnung && (
            <>
              <dt>Ablehnung</dt>
              <dd>
                {zeit(b.ablehnung.am)} – {b.ablehnung.grund}
              </dd>
            </>
          )}
        </dl>
        {b.daten && <Eckdaten r={b.daten} />}
        {b.handerfassung && (
          <dl className="eckdaten">
            <dt>Von Hand erfasst</dt>
            <dd>
              {b.handerfassung.lieferantName}, Rechnung {b.handerfassung.rechnungsnummer} vom {datum(b.handerfassung.rechnungsdatum)}, {betrag(b.handerfassung.bruttoCent)}
            </dd>
          </dl>
        )}
      </section>
      <section className="karte" aria-labelledby="akte-protokoll">
        <h2 id="akte-protokoll">Protokoll des Belegs</h2>
        <Tabellenrahmen label="Protokoll des Belegs" bedienbar>
        <table className="tabelle">
          <caption className="unsichtbar">Protokolleinträge</caption>
          <thead>
            <tr>
              <th scope="col">Nr.</th>
              <th scope="col">Zeitpunkt</th>
              <th scope="col">Aktion</th>
              <th scope="col">Von</th>
              <th scope="col">Hash</th>
            </tr>
          </thead>
          <tbody>
            {protokoll.map((e) => (
              <tr key={e.nr}>
                <td className="zahl">{e.nr}</td>
                <td>{zeit(e.zeitpunkt)}</td>
                <td>{AKTION[e.aktion]}</td>
                <td>{e.akteur.art === 'benutzer' ? 'Benutzer' : `System (${e.akteur.dienst})`}</td>
                <td>
                  <Hashwert wert={e.hash} label="Hash des Eintrags" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Tabellenrahmen>
      </section>
    </>
  )
}
