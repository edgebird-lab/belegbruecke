/** B1 Eingang: Quelle, Datei, Format, SHA-256, Eingangszeit, Aufbewahrung. */
import { Hashwert, Lernhinweis } from '../gemeinsam/Bausteine.tsx'
import { groesse, zeit } from '../kontext.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

export function SchrittEingang({ d }: Schrittprops) {
  const b = d.beleg
  const q = b.quelle
  return (
    <section className="karte" aria-labelledby="b1-titel">
      <h2 id="b1-titel">Eingang</h2>
      <Lernhinweis titel="Unverändert aufbewahrt">
        Das Original liegt schreibgeschützt im Archiv, abgelegt unter seinem SHA-256-Hash. Ändert sich auch nur ein Byte, fällt das bei der Prüfung des Archivs auf.
      </Lernhinweis>
      <dl className="eckdaten">
        <dt>Quelle</dt>
        <dd>{q.art === 'upload' ? 'Upload' : `Postfach: E-Mail von ${q.absender}, Betreff „${q.betreff}“, empfangen ${zeit(q.empfangenAm)}`}</dd>
        <dt>Datei</dt>
        <dd>
          {b.original.dateiname} ({groesse(b.original.groesseBytes)}) ·{' '}
          <a href={`/api/belege/${b.id}/original`} download>
            Original herunterladen
          </a>
        </dd>
        <dt>Format</dt>
        <dd>
          {d.zusammenfassung.format}
          {b.format.eingebettetAls && ` (eingebettet als ${b.format.eingebettetAls})`}
          {b.format.grund && b.format.belegart === 'sonstige-rechnung' && <span className="block leise">{b.format.grund}</span>}
        </dd>
        <dt>SHA-256</dt>
        <dd>
          <Hashwert wert={b.original.sha256} />
        </dd>
        <dt>Eingang</dt>
        <dd>{zeit(b.eingangAm)}</dd>
        <dt>Aufbewahrung</dt>
        <dd>{d.aufbewahrung}</dd>
      </dl>
      <Schrittknoepfe id={b.id} weiter="pruefen" />
    </section>
  )
}
