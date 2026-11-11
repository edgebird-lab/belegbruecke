/**
 * B6 Freigeben (R14): Zusammenfassung, Hindernisse, Häkchen „Leistung erhalten, Preise und Mengen
 * geprüft“ (BMF Rn. 35a), Begründung bei Fehlern, Ablehnen mit Grund; danach Rücknahme bzw. Aufheben.
 */
import { useState } from 'react'
import { STEUERFALL_TEXT } from '../../fach/kontierung.ts'
import { api, fehlerText } from '../api.ts'
import { Feld, Haken, Hinweis, Lernhinweis } from '../gemeinsam/Bausteine.tsx'
import { betrag, datum, useApp, zeit } from '../kontext.ts'
import { routeZuHash } from '../route.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

export function SchrittFreigeben({ d, fertig }: Schrittprops) {
  const { melde } = useApp()
  const b = d.beleg
  const z = d.zusammenfassung
  const [geprueft, setGeprueft] = useState(false)
  const [begruendung, setBegruendung] = useState('')
  const [ablehnen, setAblehnen] = useState(false)
  const [grund, setGrund] = useState('')
  const [ruecknahmeGrund, setRuecknahmeGrund] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const kt = b.kontierung

  const senden = async (pfad: string, daten: unknown, meldung: string) => {
    setFehler(null)
    setSendet(true)
    try {
      await api(`/belege/${b.id}/${pfad}`, { daten })
      melde(meldung)
      setAblehnen(false)
      await fertig()
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSendet(false)
    }
  }

  const kreditor = d.lieferant?.kreditorKonto ?? null
  return (
    <section className="karte" aria-labelledby="b6-titel">
      <h2 id="b6-titel">Freigeben</h2>
      <dl className="eckdaten">
        <dt>{kt?.nurBeleg ? 'Geschäftspartner' : 'Lieferant'}</dt>
        <dd>{d.lieferant?.name ?? <span className="leise">noch nicht zugeordnet</span>}</dd>
        {!kt?.nurBeleg && (
          <>
            <dt>Kreditorenkonto</dt>
            {/* Ohne zugeordneten Lieferanten gibt es noch kein Konto; der Vorschlag wäre der eines anderen Lieferanten */}
            <dd>{kreditor ?? (d.lieferant && d.kreditorVorschlag ? `wird bei der Freigabe vergeben: ${d.kreditorVorschlag}` : '–')}</dd>
          </>
        )}
        <dt>Rechnung</dt>
        <dd>
          {z.rechnungsnummer ?? '–'} vom {datum(z.rechnungsdatum)}, {betrag(z.bruttoCent, z.waehrung)}
        </dd>
        <dt>Kontierung</dt>
        <dd>
          {!kt && <span className="leise">noch nicht kontiert</span>}
          {kt?.nurBeleg && 'nur Beleg, Buchung durch die Kanzlei'}
          {kt && !kt.nurBeleg && (
            <ul className="liste-schlicht">
              {kt.zeilen.map((x, i) => (
                <li key={i}>
                  {betrag(x.bruttoCent)} auf {x.sachkonto ?? '–'} ({STEUERFALL_TEXT[x.steuerfall]}, BU {x.buSchluessel ?? 'leer'})
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>Aufbewahrung</dt>
        <dd>{d.aufbewahrung}</dd>
      </dl>

      {b.status === 'exportiert' && (
        <Hinweis art="erfolg" titel="An die Kanzlei übergeben">
          Freigegeben am {zeit(b.freigabe?.am)}; übergeben mit dem Lauf {d.exportlauf?.monat}
          {d.exportlauf && d.exportlauf.nachtragNr > 0 ? ` (Nachtrag ${d.exportlauf.nachtragNr})` : ''}.{' '}
          {d.exportlauf && <a href={routeZuHash({ seite: 'uebergabe', laufId: d.exportlauf.id })}>Übergabeprotokoll ansehen</a>}
        </Hinweis>
      )}

      {b.status === 'freigegeben' && (
        <>
          <Hinweis art="erfolg" titel="Freigegeben">
            am {zeit(b.freigabe?.am)}
            {b.freigabe?.begruendung && `; Begründung: ${b.freigabe.begruendung}`}. Daten und Kontierung sind eingefroren; der Beleg geht mit der nächsten Übergabe an die Kanzlei.
          </Hinweis>
          <details className="aufklapper">
            <summary>Freigabe zurücknehmen …</summary>
            <Feld label="Grund (freiwillig)">{(id) => <input id={id} type="text" value={ruecknahmeGrund} onChange={(e) => setRuecknahmeGrund(e.target.value)} />}</Feld>
            <button type="button" className="knopf" disabled={sendet} onClick={() => void senden('freigabe-zuruecknehmen', { grund: ruecknahmeGrund || null }, 'Freigabe zurückgenommen.')}>
              Freigabe zurücknehmen
            </button>
          </details>
        </>
      )}

      {b.status === 'abgelehnt' && (
        <>
          <Hinweis art="warnung" titel="Abgelehnt">
            am {zeit(b.ablehnung?.am)}: {b.ablehnung?.grund}
          </Hinweis>
          <button type="button" className="knopf" disabled={sendet} onClick={() => void senden('ablehnung-aufheben', {}, 'Ablehnung aufgehoben.')}>
            Ablehnung aufheben
          </button>
        </>
      )}

      {['eingegangen', 'geprueft', 'kontiert'].includes(b.status) && (
        <>
          <Lernhinweis titel="Was die Freigabe bedeutet">
            Mit der Freigabe bestätigen Sie, dass die Leistung erbracht ist und Preise und Mengen stimmen. Die technische Prüfung ersetzt das nicht (BMF-Schreiben vom 15.10.2025, Rn. 35a). Danach sind Daten und Kontierung eingefroren.
          </Lernhinweis>
          {d.freigabe.hindernisse.length > 0 && (
            <Hinweis art="warnung" titel="Noch nicht freigabebereit">
              <ul>
                {d.freigabe.hindernisse.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
            </Hinweis>
          )}
          {d.freigabe.vorsteuerGefaehrdet && (
            <Hinweis art="fehler" titel="Vorsteuerabzug gefährdet">
              Die Prüfung hat einen umsatzsteuerlich relevanten Fehler gefunden. Fordern Sie besser eine korrigierte Rechnung an.
            </Hinweis>
          )}
          {b.status === 'kontiert' && (
            <div className="formular">
              <Haken an={geprueft} aendern={setGeprueft}>
                Leistung erhalten, Preise und Mengen geprüft
              </Haken>
              {d.freigabe.begruendungNoetig && (
                <Feld label="Begründung für die Freigabe trotz Fehler (Pflicht, mindestens 10 Zeichen)">
                  {(id) => <textarea id={id} rows={2} value={begruendung} onChange={(e) => setBegruendung(e.target.value)} />}
                </Feld>
              )}
            </div>
          )}
          {ablehnen && (
            <div className="formular ablehnen">
              <Feld label="Grund der Ablehnung (Pflicht)">{(id) => <textarea id={id} rows={2} value={grund} onChange={(e) => setGrund(e.target.value)} />}</Feld>
              <div className="knopfreihe">
                <button type="button" className="knopf knopf-gefahr" disabled={sendet} onClick={() => void senden('ablehnen', { grund }, 'Beleg abgelehnt.')}>
                  Ablehnung bestätigen
                </button>
                <button type="button" className="knopf" onClick={() => setAblehnen(false)}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
          {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
          <div className="knopfreihe schrittknoepfe">
            {!ablehnen && (
              <button type="button" className="knopf knopf-gefahr" onClick={() => setAblehnen(true)}>
                Ablehnen …
              </button>
            )}
            <button type="button" className="knopf knopf-haupt" disabled={sendet || b.status !== 'kontiert'} onClick={() => void senden('freigeben', { inhaltGeprueft: geprueft, begruendung: begruendung || null }, 'Beleg freigegeben.')}>
              Freigeben
            </button>
          </div>
        </>
      )}
      {fehler && !['eingegangen', 'geprueft', 'kontiert'].includes(b.status) && <Hinweis art="fehler">{fehler}</Hinweis>}
      <Schrittknoepfe id={b.id} zurueck="kontieren" />
    </section>
  )
}
