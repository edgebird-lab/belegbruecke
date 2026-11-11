/**
 * B4 Zuordnen: Dublettenentscheidung („Ist das dieselbe Rechnung wie B-00017?“) mit Vergleich
 * nebeneinander, Lieferant nach Schlüssel (R10) vorschlagen oder neu anlegen, Kreditorenkonto.
 */
import { useState } from 'react'
import type { Belegzeile, LieferantMitStatistik } from '../api.ts'
import { api, fehlerText, useLaden } from '../api.ts'
import { Auswahl, Hinweis, Lernhinweis, Statusmarke, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { betrag, datum, useApp } from '../kontext.ts'
import { routeZuHash } from '../route.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

function Vergleich({ dieser, anderer }: { dieser: Belegzeile; anderer: Belegzeile }) {
  const zeilen: [string, string, string][] = [
    ['Beleg', dieser.belegnummer, anderer.belegnummer],
    ['Lieferant', dieser.lieferant ?? '–', anderer.lieferant ?? '–'],
    ['Rechnungsnummer', dieser.rechnungsnummer ?? '–', anderer.rechnungsnummer ?? '–'],
    ['Rechnungsdatum', datum(dieser.rechnungsdatum), datum(anderer.rechnungsdatum)],
    ['Brutto', betrag(dieser.bruttoCent, dieser.waehrung), betrag(anderer.bruttoCent, anderer.waehrung)],
    ['Format', dieser.format, anderer.format],
    ['Datei', dieser.dateiname, anderer.dateiname],
  ]
  return (
    <table className="tabelle vergleich">
      <caption className="unsichtbar">Vergleich der beiden Belege</caption>
      <thead>
        <tr>
          <th scope="col">Angabe</th>
          <th scope="col">Dieser Beleg</th>
          <th scope="col">
            <a href={routeZuHash({ seite: 'beleg', id: anderer.id, schritt: null })}>{anderer.belegnummer}</a> <Statusmarke wert={anderer.status} />
          </th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([a, x, y]) => (
          <tr key={a} className={x !== y && a !== 'Beleg' ? 'abweichung' : undefined}>
            <th scope="row">{a}</th>
            <td>{x}</td>
            <td>
              {y}
              {x !== y && a !== 'Beleg' && <span className="unsichtbar"> (abweichend)</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function SchrittZuordnen({ d, fertig, gesperrt }: Schrittprops) {
  const { melde } = useApp()
  const b = d.beleg
  const v = d.lieferantenvorschlag
  const nurBeleg = b.daten?.typcode === '389' && !b.handerfassung
  const wer = nurBeleg ? 'Geschäftspartner' : 'Lieferant'
  const alle = useLaden<{ lieferanten: LieferantMitStatistik[] }>('/lieferanten')
  const startArt = d.lieferant ? 'vorhanden' : v?.vorhanden ? 'vorhanden' : 'neu'
  const [art, setArt] = useState<'vorhanden' | 'neu'>(startArt)
  const [lieferantId, setLieferantId] = useState(d.lieferant?.id ?? v?.vorhanden?.id ?? '')
  const [name, setName] = useState(v?.neu.name ?? '')
  // null = nicht von Hand geändert; dann folgt das Feld dem gewählten Lieferanten. Eine Eingabe gilt
  // nur für die Wahl, bei der sie gemacht wurde; sonst bekäme ein anderer Lieferant still ein neues Konto.
  const [kreditorEingabe, setKreditorEingabe] = useState<string | null>(null)
  const waehleArt = (a: 'vorhanden' | 'neu') => {
    setArt(a)
    setKreditorEingabe(null)
  }
  const waehleLieferant = (id: string) => {
    setLieferantId(id)
    setKreditorEingabe(null)
  }
  const [fehler, setFehler] = useState<string | null>(null)
  // Kreditorenkonto zur aktuellen Wahl: das des gewählten Lieferanten, sonst das nächste freie (R10 Punkt 3)
  const gewaehlt =
    art !== 'vorhanden' || !lieferantId
      ? null
      : d.lieferant?.id === lieferantId
        ? d.lieferant
        : v?.vorhanden?.id === lieferantId
          ? v.vorhanden
          : (alle.daten?.lieferanten.find((l) => l.id === lieferantId) ?? null)
  const standardKreditor = gewaehlt?.kreditorKonto ?? d.naechsterKreditor
  const kreditor = kreditorEingabe ?? (standardKreditor !== null ? String(standardKreditor) : '')
  const [sendet, setSendet] = useState(false)
  const offeneDubletten = b.dublettenEntscheidung ? [] : d.dublettenVergleich.filter((x) => x.hinweis.stufe === 'gleiche-rechnung')
  const aehnliche = d.dublettenVergleich.filter((x) => x.hinweis.stufe === 'aehnliche-rechnung')

  const entscheiden = async (ergebnis: 'keine-dublette' | 'dublette') => {
    setFehler(null)
    try {
      await api(`/belege/${b.id}/dublette`, { daten: { ergebnis } })
      melde(ergebnis === 'dublette' ? 'Als Dublette abgelehnt.' : 'Entschieden: keine Dublette.')
      await fertig(ergebnis === 'dublette' ? 'freigeben' : undefined)
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }

  const zuordnen = async () => {
    setFehler(null)
    const konto = kreditor.trim() === '' ? null : Number(kreditor)
    const daten: Record<string, unknown> = art === 'vorhanden' ? { lieferantId } : { neu: { name: name.trim() } }
    // Ein geändertes Kreditorenkonto mitschicken; sonst vergibt die Freigabe das nächste freie (R10)
    if (!nurBeleg && kreditorEingabe !== null && konto !== null && konto !== standardKreditor) daten.kreditorKonto = konto
    if (art === 'vorhanden' && !lieferantId) {
      setFehler(`Wählen Sie einen ${wer}.`)
      return
    }
    setSendet(true)
    try {
      await api(`/belege/${b.id}/lieferant`, { methode: 'PUT', daten })
      melde(`${wer} zugeordnet.`)
      await fertig('kontieren')
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSendet(false)
    }
  }

  const andere = (alle.daten?.lieferanten ?? []).filter((l) => l.id !== v?.vorhanden?.id)
  return (
    <section className="karte" aria-labelledby="b4-titel">
      <h2 id="b4-titel">Zuordnen</h2>
      {gesperrt && <Hinweis>{gesperrt}</Hinweis>}
      {offeneDubletten.map((x) => (
        <section key={x.hinweis.andererBelegId} className="dublettenfrage" aria-labelledby={`dublette-${x.hinweis.andererBelegId}`}>
          <h3 id={`dublette-${x.hinweis.andererBelegId}`}>Ist das dieselbe Rechnung wie {x.anderer?.belegnummer ?? 'ein anderer Beleg'}?</h3>
          <p>{x.hinweis.grund}</p>
          {x.anderer && <Vergleich dieser={d.zusammenfassung} anderer={x.anderer} />}
          {!gesperrt && (
            <div className="knopfreihe">
              <button type="button" className="knopf" onClick={() => void entscheiden('dublette')}>
                Ja, dieselbe Rechnung (ablehnen)
              </button>
              <button type="button" className="knopf" onClick={() => void entscheiden('keine-dublette')}>
                Nein, eine andere Rechnung
              </button>
            </div>
          )}
        </section>
      ))}
      {b.dublettenEntscheidung && <Hinweis>Dublettenfrage entschieden: {b.dublettenEntscheidung.ergebnis === 'dublette' ? 'dieselbe Rechnung' : 'keine Dublette'}.</Hinweis>}
      {aehnliche.map((x) => (
        <Hinweis key={x.hinweis.andererBelegId} art="warnung" titel="Ähnliche Rechnung">
          {x.hinweis.grund}
        </Hinweis>
      ))}
      <Lernhinweis titel="Lieferant und Kreditorenkonto">
        Die Belegbrücke erkennt Lieferanten an der USt-IdNr., sonst an der Steuernummer oder an Name und Postleitzahl. Jeder Lieferant bekommt bei der ersten Freigabe ein eigenes Kreditorenkonto; darüber bucht die Kanzlei die offenen Posten.
      </Lernhinweis>
      {!v ? (
        <Hinweis>Ohne lesbare Rechnungsdaten lässt sich kein {wer} zuordnen.</Hinweis>
      ) : (
        <fieldset className="formular" disabled={!!gesperrt}>
          <legend className="unsichtbar">{wer}</legend>
          {d.lieferant && (
            <p>
              Zugeordnet: <strong>{d.lieferant.name}</strong>
              {d.lieferant.kreditorKonto !== null && ` · Kreditorenkonto ${d.lieferant.kreditorKonto}`}
            </p>
          )}
          <Auswahl
            label={`${wer} für diesen Beleg`}
            wert={art}
            aendern={waehleArt}
            optionen={[
              { wert: 'vorhanden', text: `Vorhandener ${wer}`, beschreibung: v.vorhanden ? `Vorschlag: ${v.vorhanden.name} (gleicher Schlüssel ${v.schluessel})` : 'aus der Liste wählen' },
              { wert: 'neu', text: `Neuer ${wer}`, beschreibung: `mit den Daten aus der Rechnung (Schlüssel ${v.schluessel})` },
            ]}
          />
          {art === 'vorhanden' && (
            <div className="feld">
              <label htmlFor="lieferant-wahl">{wer}</label>
              <select id="lieferant-wahl" value={lieferantId} onChange={(e) => waehleLieferant(e.target.value)}>
                <option value="">bitte wählen</option>
                {v.vorhanden && <option value={v.vorhanden.id}>{v.vorhanden.name} (Vorschlag)</option>}
                {andere.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.kreditorKonto !== null ? ` · ${l.kreditorKonto}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {art === 'neu' && <Textfeld label={`Name des ${nurBeleg ? 'Geschäftspartners' : 'Lieferanten'}`} wert={name} aendern={setName} pflicht />}
          {!nurBeleg && (
            <Textfeld
              label="Kreditorenkonto"
              inputMode="numeric"
              wert={kreditor}
              aendern={(t) => setKreditorEingabe(t.replace(/\D/g, ''))}
              breite="schmal"
              hilfe={
                gewaehlt?.kreditorKonto
                  ? `Kreditorenkonto von ${gewaehlt.name}, schon vergeben; nach der ersten Übergabe nicht mehr änderbar.`
                  : `Vorgeschlagen: ${d.naechsterKreditor ?? 'kein freies Konto'} (nächstes freies Konto); vergeben wird es bei der ersten Freigabe. Sie dürfen es ändern.`
              }
            />
          )}
          {nurBeleg && <p className="leise">Gutschrift über Ihre eigene Leistung: kein Kreditorenkonto, der Beleg geht nur als Beleg an die Kanzlei.</p>}
        </fieldset>
      )}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <Schrittknoepfe
        id={b.id}
        zurueck="ansehen"
        weiter={gesperrt || !v ? 'kontieren' : undefined}
        weiterText={gesperrt || !v ? 'Weiter' : `${wer} zuordnen und weiter`}
        weiterAktion={gesperrt || !v ? undefined : sendet ? () => undefined : () => void zuordnen()}
      />
    </section>
  )
}
