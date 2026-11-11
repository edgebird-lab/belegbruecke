/**
 * B2 Prüfen: Ampel, Befunde gruppiert nach Formatfehler, Geschäftsregelfehler, Pflichtangaben und
 * Hinweise; je Befund Klartext, Regel-ID, BT-Bezug, Originaltext und Handlung. Prüfbericht drucken,
 * Text für die Rückfrage an den Lieferanten kopieren.
 */
import { ANGABE_TEXT } from '../../fach/pflichtangaben.ts'
import { zusatzUst } from '../../fach/pruefbericht.ts'
import { GRUPPENTITEL, gruppiereBefunde, rueckfrageText } from '../../fach/rueckfrage.ts'
import type { Befund } from '../../fach/typen.ts'
import { AmpelAnzeige, Hinweis, Lernhinweis } from '../gemeinsam/Bausteine.tsx'
import { useApp, zeit } from '../kontext.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

const STATUS_TEXT = { erfuellt: 'erfüllt', fehlt: 'fehlt', pruefen: 'prüfen', 'nicht-anwendbar': 'nicht anwendbar' } as const
const STATUS_SYMBOL = { erfuellt: '✓', fehlt: '✕', pruefen: '!', 'nicht-anwendbar': '–' } as const
const STUFE_TEXT = { fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' } as const

function Befundkarte({ b }: { b: Befund }) {
  const zusatz = zusatzUst(b)
  return (
    <li className={`befund befund-${b.stufe}`}>
      <p className="befund-kopf">
        <span className={`stufe stufe-${b.stufe}`}>{STUFE_TEXT[b.stufe]}</span> <code>{b.regelId}</code>
        {b.btBezug.length > 0 && <span className="leise"> · {b.btBezug.join(', ')}</span>}
        {zusatz && <span className="marke-leise"> · {zusatz}</span>}
        {b.ustRelevant === true && b.stufe === 'fehler' && <span className="marke-warnung"> · Vorsteuerabzug gefährdet</span>}
      </p>
      <p>{b.klartext}</p>
      <p className="befund-handlung">
        <strong>Was tun:</strong> {b.handlung}
      </p>
      {(b.originaltext || b.ort) && (
        <details>
          <summary>Meldung des Regelwerks</summary>
          {b.originaltext && <p className="originaltext">{b.originaltext}</p>}
          {b.ort && (
            <p className="leise klein">
              Fundstelle: <code>{b.ort}</code>
            </p>
          )}
        </details>
      )}
    </li>
  )
}

export function SchrittPruefen({ d }: Schrittprops) {
  const { melde, einstellungen } = useApp()
  const b = d.beleg
  const p = b.pruefung
  const kopieren = async () => {
    const text = rueckfrageText(b, einstellungen?.firma.name || 'Ihr Kunde')
    try {
      await navigator.clipboard.writeText(text)
      melde('Text für die Rückfrage in die Zwischenablage kopiert.')
    } catch {
      melde('Kopieren nicht möglich; der Browser erlaubt keinen Zugriff auf die Zwischenablage.')
    }
  }
  return (
    <section className="karte pruefbericht" aria-labelledby="b2-titel">
      <h2 id="b2-titel">Prüfen</h2>
      <p className="ampelzeile">
        <AmpelAnzeige ampel={d.zusammenfassung.ampel} gross />
      </p>
      <Lernhinweis titel="So liest man die Ampel">
        Grün: gültige E-Rechnung ohne Fehler und Warnungen. Gelb: angenommen, aber mit Warnungen (z. B. Pflichtangaben prüfen). Rot: nicht angenommen oder eine Pflichtangabe fehlt. Grau: keine E-Rechnung, sondern eine sonstige Rechnung, die Sie von Hand erfassen. Formatfehler machen eine Datei zur sonstigen Rechnung (BMF Rn. 6a), Geschäftsregelfehler betreffen die Regeln der EN 16931 (Rn. 6b).
      </Lernhinweis>
      {!p && <Hinweis>Die Prüfung läuft noch oder wurde unterbrochen; sie wird beim nächsten Start des Servers nachgeholt.</Hinweis>}
      {p && (
        <>
          <dl className="eckdaten">
            <dt>Prüfszenario</dt>
            <dd>{p.szenario ?? 'keins (keine E-Rechnung oder unbekannte Kennung)'}</dd>
            <dt>Ergebnis</dt>
            <dd>
              {p.angenommen ? 'angenommen' : 'nicht angenommen'}
              {p.eingeschraenktGeprueft && ' (eingeschränkt geprüft)'}
            </dd>
            <dt>Geprüft</dt>
            <dd>
              {zeit(p.zeitpunkt)} mit {p.pruefprogramm}; Konfiguration {p.artefakte.konfiguration}, EN 16931 {p.artefakte.enSchematron}, XRechnung {p.artefakte.xrSchematron}
            </dd>
          </dl>
          {p.befunde.length === 0 && <Hinweis art="erfolg">Keine Befunde.</Hinweis>}
          {gruppiereBefunde(p.befunde).map((g) => (
            <section key={g.gruppe} className="befundgruppe" aria-labelledby={`gruppe-${g.gruppe}`}>
              <h3 id={`gruppe-${g.gruppe}`}>
                {GRUPPENTITEL[g.gruppe]} ({g.befunde.length})
              </h3>
              <ul className="befundliste">
                {g.befunde.map((x, i) => (
                  <Befundkarte key={`${x.regelId}-${i}`} b={x} />
                ))}
              </ul>
            </section>
          ))}
          {p.pflichtangaben && (
            <section aria-labelledby="pflicht-titel">
              <h3 id="pflicht-titel">Pflichtangaben nach {p.pflichtangaben.regelwerk}</h3>
              <table className="tabelle">
                <caption className="unsichtbar">Pflichtangaben</caption>
                <thead>
                  <tr>
                    <th scope="col">Angabe</th>
                    <th scope="col">Ergebnis</th>
                  </tr>
                </thead>
                <tbody>
                  {p.pflichtangaben.ergebnisse.map((e) => (
                    <tr key={e.angabe}>
                      <th scope="row">{ANGABE_TEXT[e.angabe]}</th>
                      <td className={`pflicht-${e.status}`}>
                        <span aria-hidden="true">{STATUS_SYMBOL[e.status]}</span> {STATUS_TEXT[e.status]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="leise klein">Empfänger ist die eigene Firma: {p.pflichtangaben.eigeneFirmaAlsEmpfaenger}</p>
            </section>
          )}
          <p className="leise klein">Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a).</p>
          <div className="knopfreihe nicht-drucken">
            <button type="button" className="knopf" onClick={() => window.print()}>
              Prüfbericht drucken
            </button>
            <button type="button" className="knopf" onClick={() => void kopieren()}>
              Text für Rückfrage an den Lieferanten kopieren
            </button>
            <a className="knopf" href={`/api/belege/${b.id}/bericht`} download>
              Prüfbericht herunterladen (JSON)
            </a>
          </div>
        </>
      )}
      <Schrittknoepfe id={b.id} zurueck="eingang" weiter="ansehen" />
    </section>
  )
}
