/**
 * B3 Ansehen: links die KoSIT-Ansicht im iframe mit Sandbox (ohne allow-same-origin, Spezifikation 8),
 * rechts die Eckdaten. Bei ZUGFeRD zusätzlich der Reiter „PDF“ mit dem Hinweis, dass der XML-Teil gilt.
 */
import { useState } from 'react'
import { Hinweis } from '../gemeinsam/Bausteine.tsx'
import { Eckdaten } from './Eckdaten.tsx'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

export function SchrittAnsehen({ d }: Schrittprops) {
  const b = d.beleg
  const zugferd = b.format.container === 'pdf-mit-xml'
  const [reiter, setReiter] = useState<'ansicht' | 'pdf'>('ansicht')
  return (
    <section className="karte" aria-labelledby="b3-titel">
      <h2 id="b3-titel">Ansehen</h2>
      <div className="ansicht-raster">
        <div className="ansicht-links">
          {zugferd && (
            <div className="reiter" role="tablist" aria-label="Darstellung">
              <button type="button" role="tab" aria-selected={reiter === 'ansicht'} onClick={() => setReiter('ansicht')}>
                E-Rechnung (XML)
              </button>
              <button type="button" role="tab" aria-selected={reiter === 'pdf'} onClick={() => setReiter('pdf')}>
                PDF
              </button>
            </div>
          )}
          {reiter === 'ansicht' && b.format.syntax && <iframe className="ansicht-rahmen" title="Ansicht der E-Rechnung" sandbox="allow-scripts allow-downloads" src={`/api/belege/${b.id}/ansicht`} />}
          {reiter === 'ansicht' && !b.format.syntax && <Hinweis>Für diese Datei gibt es keine Ansicht der E-Rechnung.</Hinweis>}
          {reiter === 'pdf' && (
            <>
              <Hinweis art="warnung">Maßgeblich ist der XML-Teil. Weicht die PDF davon ab, gilt der strukturierte Teil (UStAE 14.4 Abs. 3).</Hinweis>
              <iframe className="ansicht-rahmen" title="PDF der Rechnung" src={`/api/belege/${b.id}/original?anzeige=1`} />
            </>
          )}
        </div>
        <div className="ansicht-rechts">
          <h3>Eckdaten</h3>
          {b.daten ? <Eckdaten r={b.daten} /> : <p>Die Rechnungsdaten sind nicht lesbar.</p>}
        </div>
      </div>
      <Schrittknoepfe id={b.id} zurueck="pruefen" weiter="zuordnen" />
    </section>
  )
}
