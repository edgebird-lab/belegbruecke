/**
 * Übergabe-Assistent U1 bis U4 (Spezifikation 5.4, Schritt 4.6): Monat wählen, prüfen, erzeugen,
 * herunterladen; Übergabeprotokoll in der Druckansicht mit Kettenanker. Das DATEV-Format ist bis
 * Schritt 0.6 nicht an der Primärquelle bestätigt; die Oberfläche nennt den Export deshalb „Vorschau“.
 */
import { useState } from 'react'
import type { Exportlauf } from '../../fach/typen.ts'
import { api, fehlerText, useLaden, type Belegzeile, type Sperre, type Uebergabeplan } from '../api.ts'
import { Belegtabelle } from '../belege/Belegtabelle.tsx'
import { Hinweis, Laden, Lernhinweis, Schrittleiste, Seitentitel } from '../gemeinsam/Bausteine.tsx'
import { betrag, datum, groesse, status, useApp, zeit } from '../kontext.ts'
import { routeZuHash } from '../route.ts'

type U = 'zeitraum' | 'pruefen' | 'erzeugen'

function monatText(monat: string): string {
  const [j, m] = monat.split('-')
  return `${m}/${j}`
}

export function Uebergabe({ laufId }: { laufId: string | null }) {
  if (laufId) return <Uebergabeprotokoll laufId={laufId} />
  return <UebergabeAssistent />
}

function UebergabeAssistent() {
  const { gehe, aktualisiereZaehler, melde } = useApp()
  const laeufe = useLaden<{ laeufe: Exportlauf[]; vorschlag: string | null }>('/uebergaben')
  const [schritt, setSchritt] = useState<U>('zeitraum')
  const [monat, setMonat] = useState<string | null>(null)
  const gewaehlt = monat ?? laeufe.daten?.vorschlag ?? ''
  const gueltig = /^\d{4}-(0[1-9]|1[0-2])$/.test(gewaehlt)
  const plan = useLaden<Uebergabeplan>(gueltig ? `/uebergaben/plan?monat=${gewaehlt}` : null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sperren, setSperren] = useState<Sperre[]>([])
  const [sendet, setSendet] = useState(false)

  const erzeugen = async () => {
    setFehler(null)
    setSperren([])
    setSendet(true)
    try {
      const r = await api<{ lauf: Exportlauf }>('/uebergaben', { daten: { monat: gewaehlt } })
      melde(`Übergabe ${monatText(gewaehlt)} erzeugt.`)
      aktualisiereZaehler()
      gehe({ seite: 'uebergabe', laufId: r.lauf.id })
    } catch (e) {
      setFehler(fehlerText(e))
      const antwort = (e as { antwort?: { sperren?: Sperre[] } }).antwort
      setSperren(antwort?.sperren ?? [])
    } finally {
      setSendet(false)
    }
  }

  const p = plan.daten
  const bereit = !!p && p.belege.length > 0 && p.sperren.length === 0
  return (
    <>
      <Seitentitel unter="Monatliche Übergabe an die Steuerkanzlei (Vorschau des DATEV-Formats)">Übergabe</Seitentitel>
      <Schrittleiste
        label="Schritte der Übergabe"
        aktiv={schritt}
        waehlen={setSchritt}
        schritte={[
          { id: 'zeitraum', titel: 'Zeitraum', fertig: schritt !== 'zeitraum' },
          { id: 'pruefen', titel: 'Prüfen', fertig: schritt === 'erzeugen', gesperrt: !gueltig },
          { id: 'erzeugen', titel: 'Erzeugen', gesperrt: !bereit },
        ]}
      />
      <Hinweis art="warnung" titel="Vorschau">
        Das Format des Buchungsstapels folgt einer quelloffenen Beschreibung und ist noch nicht mit der Kanzlei erprobt (Probeimport offen). Prüfen Sie die erste Übergabe gemeinsam mit Ihrer Kanzlei.
      </Hinweis>
      {schritt === 'zeitraum' && (
        <section className="karte" aria-labelledby="u1-titel">
          <h2 id="u1-titel">Zeitraum</h2>
          <Lernhinweis titel="Welcher Monat?">
            Gruppiert wird nach dem Rechnungsdatum. Vorgeschlagen ist der älteste Monat mit freigegebenen, noch nicht übergebenen Belegen. Kommen nach der Übergabe weitere Belege für den Monat hinzu, entsteht ein Nachtrag (N1, N2 …).
          </Lernhinweis>
          <div className="feld">
            <label htmlFor="u-monat">Monat (Rechnungsdatum)</label>
            <input id="u-monat" type="month" value={gewaehlt} onChange={(e) => setMonat(e.target.value)} />
          </div>
          {laeufe.daten && !laeufe.daten.vorschlag && <p className="leise">Zurzeit gibt es keine freigegebenen, noch nicht übergebenen Belege.</p>}
          {plan.laedt && <Laden />}
          {p && (
            <>
              <table className="tabelle">
                <caption>Belege im {monatText(p.monat)} je Status</caption>
                <tbody>
                  {Object.entries(p.anzahlJeStatus).map(([s, n]) => (
                    <tr key={s}>
                      <th scope="row">{status(s as keyof typeof p.anzahlJeStatus)}</th>
                      <td className="zahl">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {p.offen.length > 0 && (
                <Hinweis art="warnung" titel={`${p.offen.length} Beleg${p.offen.length === 1 ? ' ist' : 'e sind'} in diesem Monat noch nicht freigegeben`}>
                  Sie gehen erst mit einem Nachtrag an die Kanzlei.
                  <ul>
                    {p.offen.map((b) => (
                      <li key={b.id}>
                        <a href={routeZuHash({ seite: 'beleg', id: b.id, schritt: null })}>{b.belegnummer}</a> {b.lieferant ?? ''} ({status(b.status)})
                      </li>
                    ))}
                  </ul>
                </Hinweis>
              )}
            </>
          )}
          <div className="knopfreihe schrittknoepfe">
            <button type="button" className="knopf knopf-haupt" disabled={!gueltig} onClick={() => setSchritt('pruefen')}>
              Weiter
            </button>
          </div>
        </section>
      )}
      {schritt === 'pruefen' && p && (
        <section className="karte" aria-labelledby="u2-titel">
          <h2 id="u2-titel">
            Prüfen: {monatText(p.monat)}
            {p.nachtragNr > 0 && ` (Nachtrag ${p.nachtragNr})`}
          </h2>
          {p.belege.length === 0 ? (
            <Hinweis>Für diesen Monat gibt es keine freigegebenen, noch nicht übergebenen Belege.</Hinweis>
          ) : (
            <>
              <p>
                {p.belege.length} Beleg{p.belege.length === 1 ? '' : 'e'}, {p.mitBuchungsstapel ? `${p.buchungen} Buchungszeile${p.buchungen === 1 ? '' : 'n'} im Buchungsstapel` : 'nur Belege (Exportmodus „Nur Belege“)'}.
              </p>
              <Belegtabelle belege={p.belege} titel="Belege dieser Übergabe" />
              <Summen summen={p.summen} gesamt={p.summeBruttoCent} />
              {p.nurBeleg.length > 0 && <p>Nur als Beleg, Buchung durch die Kanzlei: {p.belege.filter((b) => p.nurBeleg.includes(b.id)).map((b) => b.belegnummer).join(', ')}.</p>}
            </>
          )}
          {p.sperren.length > 0 && <Sperrliste sperren={p.sperren} />}
          <div className="knopfreihe schrittknoepfe">
            <button type="button" className="knopf" onClick={() => setSchritt('zeitraum')}>
              Zurück
            </button>
            <button type="button" className="knopf knopf-haupt" disabled={!bereit} onClick={() => setSchritt('erzeugen')}>
              Weiter
            </button>
          </div>
        </section>
      )}
      {schritt === 'erzeugen' && p && (
        <section className="karte" aria-labelledby="u3-titel">
          <h2 id="u3-titel">Erzeugen</h2>
          <p>
            Jetzt die Übergabe für {monatText(p.monat)}
            {p.nachtragNr > 0 ? ` (Nachtrag ${p.nachtragNr})` : ''} mit {p.belege.length} Beleg{p.belege.length === 1 ? '' : 'en'} erzeugen? Danach sind diese Belege übergeben und lassen sich nicht mehr ändern.
          </p>
          {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
          {sperren.length > 0 && <Sperrliste sperren={sperren} />}
          <div className="knopfreihe schrittknoepfe">
            <button type="button" className="knopf" onClick={() => setSchritt('pruefen')}>
              Zurück
            </button>
            <button type="button" className="knopf knopf-haupt" disabled={sendet} onClick={() => void erzeugen()}>
              Jetzt erzeugen
            </button>
          </div>
        </section>
      )}
      <section aria-labelledby="laeufe-titel">
        <h2 id="laeufe-titel">Bisherige Übergaben</h2>
        {laeufe.daten && laeufe.daten.laeufe.length === 0 && <p className="leise">Noch keine Übergabe.</p>}
        {laeufe.daten && laeufe.daten.laeufe.length > 0 && (
          <ul className="laufliste">
            {laeufe.daten.laeufe.map((l) => (
              <li key={l.id}>
                <a href={routeZuHash({ seite: 'uebergabe', laufId: l.id })}>
                  {monatText(l.monat)}
                  {l.nachtragNr > 0 && ` N${l.nachtragNr}`}
                </a>{' '}
                · {l.belegIds.length} Belege · erzeugt {zeit(l.erzeugtAm)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function Summen({ summen, gesamt }: { summen: Uebergabeplan['summen']; gesamt: number }) {
  if (summen.length === 0) return null
  return (
    <table className="tabelle summen">
      <caption>Summen der Buchungen je Steuersatz (brutto)</caption>
      <thead>
        <tr>
          <th scope="col">Kategorie und Satz</th>
          <th scope="col" className="zahl">
            Brutto
          </th>
        </tr>
      </thead>
      <tbody>
        {summen.map((s) => (
          <tr key={`${s.kategorie}-${s.satz}`}>
            <th scope="row">
              {s.kategorie} {s.satz} %
            </th>
            <td className="zahl">{betrag(s.bruttoCent)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Summe</th>
          <td className="zahl">{betrag(gesamt)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function Sperrliste({ sperren }: { sperren: Sperre[] }) {
  return (
    <Hinweis art="fehler" titel="Übergabe gesperrt">
      <ul>
        {sperren.map((s, i) => (
          <li key={i}>
            {s.belegId ? <a href={routeZuHash({ seite: 'beleg', id: s.belegId, schritt: 'kontieren' })}>{s.grund}</a> : s.grund}
          </li>
        ))}
      </ul>
    </Hinweis>
  )
}

/** U4: Downloads und Übergabeprotokoll in der Druckansicht (R21 Punkt 5). */
function Uebergabeprotokoll({ laufId }: { laufId: string }) {
  const lauf = useLaden<{ lauf: Exportlauf; belege: Belegzeile[]; benutzer: string | null }>(`/uebergaben/${laufId}`)
  if (lauf.fehler) return <Hinweis art="fehler">{lauf.fehler}</Hinweis>
  if (!lauf.daten) return <Laden />
  const { lauf: l, belege, benutzer } = lauf.daten
  const nurBeleg = belege.filter((b) => l.nurBelegIds?.includes(b.id))
  return (
    <>
      <Seitentitel unter="Übergabe an die Kanzlei">
        Übergabeprotokoll {monatText(l.monat)}
        {l.nachtragNr > 0 && ` N${l.nachtragNr}`}
      </Seitentitel>
      <section className="karte nicht-drucken" aria-labelledby="u4-titel">
        <h2 id="u4-titel">Dateien herunterladen</h2>
        <ul className="dateiliste">
          {l.dateien.map((f) => (
            <li key={f.name}>
              <a className="knopf" href={`/api/uebergaben/${l.id}/dateien/${encodeURIComponent(f.name)}`} download>
                {f.name}
              </a>{' '}
              <span className="leise">{groesse(f.bytes)}</span>
            </li>
          ))}
        </ul>
        <p className="leise">Geben Sie die Dateien und dieses Protokoll an Ihre Kanzlei. Ein erneuter Download liefert dieselben Dateien bytegleich.</p>
        <div className="knopfreihe">
          <button type="button" className="knopf knopf-haupt" onClick={() => window.print()}>
            Übergabeprotokoll drucken
          </button>
          <a className="knopf" href={routeZuHash({ seite: 'uebergabe', laufId: null })}>
            Zur Übersicht
          </a>
        </div>
      </section>
      <article className="karte protokoll-druck" aria-labelledby="protokoll-titel">
        <h2 id="protokoll-titel">Übergabeprotokoll</h2>
        <dl className="eckdaten">
          <dt>Mandant</dt>
          <dd>
            Beraternummer {l.beraternummer ?? '–'}, Mandantennummer {l.mandantennummer ?? '–'}
          </dd>
          <dt>Zeitraum</dt>
          <dd>
            {monatText(l.monat)} (Rechnungsdatum){l.nachtragNr > 0 && `, Nachtrag ${l.nachtragNr}`}
          </dd>
          <dt>Erzeugt</dt>
          <dd>
            {zeit(l.erzeugtAm)}
            {benutzer && ` von ${benutzer}`}
          </dd>
          <dt>Inhalt</dt>
          <dd>{l.exportmodus === 'nur-belege' ? 'nur Belege' : 'Buchungsstapel und Belege'} (Vorschau des DATEV-Formats)</dd>
          <dt>Anzahl Belege</dt>
          <dd>{l.belegIds.length}</dd>
          <dt>Kettenanker</dt>
          <dd>
            Protokolleintrag Nr. {l.kettenanker.nr}
            <code className="hash-voll">{l.kettenanker.hash}</code>
            <span className="block leise klein">Bewahren Sie Nummer und Hash auf; damit lässt sich später prüfen, dass das Protokoll bis hierher unverändert ist.</span>
          </dd>
        </dl>
        <Summen summen={l.summenJeSteuersatz} gesamt={l.summeBruttoCent} />
        <table className="tabelle">
          <caption>Dateien</caption>
          <thead>
            <tr>
              <th scope="col">Datei</th>
              <th scope="col" className="zahl">
                Größe
              </th>
              <th scope="col">SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {l.dateien.map((f) => (
              <tr key={f.name}>
                <th scope="row">{f.name}</th>
                <td className="zahl">{groesse(f.bytes)}</td>
                <td>
                  <code className="hash-voll">{f.sha256}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="tabelle">
          <caption>Belege</caption>
          <thead>
            <tr>
              <th scope="col">Beleg</th>
              <th scope="col">Lieferant</th>
              <th scope="col">Rechnung</th>
              <th scope="col">Datum</th>
              <th scope="col" className="zahl">
                Brutto
              </th>
            </tr>
          </thead>
          <tbody>
            {belege.map((b) => (
              <tr key={b.id}>
                <th scope="row">{b.belegnummer}</th>
                <td>{b.lieferant}</td>
                <td>{b.rechnungsnummer}</td>
                <td>{datum(b.rechnungsdatum)}</td>
                <td className="zahl">{betrag(b.bruttoCent, b.waehrung)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {nurBeleg.length > 0 && (
          <section aria-labelledby="nurbeleg-titel">
            <h3 id="nurbeleg-titel">Nur Beleg, Buchung durch die Kanzlei</h3>
            <ul>
              {nurBeleg.map((b) => (
                <li key={b.id}>
                  {b.belegnummer} {b.lieferant} {b.rechnungsnummer} ({betrag(b.bruttoCent, b.waehrung)})
                </li>
              ))}
            </ul>
          </section>
        )}
        {(l.hinweise?.length ?? 0) > 0 && (
          <section aria-labelledby="hinweise-titel">
            <h3 id="hinweise-titel">Hinweise des Exports</h3>
            <ul>
              {l.hinweise!.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </section>
        )}
        <p className="leise klein">Erzeugt mit der Belegbrücke. Technische Aufbereitung ohne Gewähr; keine Steuer- oder Rechtsberatung.</p>
      </article>
    </>
  )
}
