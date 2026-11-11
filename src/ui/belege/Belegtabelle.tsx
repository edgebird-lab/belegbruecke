import type { Belegzeile } from '../api.ts'
import { AmpelAnzeige, Statusmarke } from '../gemeinsam/Bausteine.tsx'
import { betrag, datum } from '../kontext.ts'
import { routeZuHash, type Route } from '../route.ts'

/** Tabelle von Belegen; jede Zeile führt in den Beleg-Assistenten oder ins Belegdetail. */
export function Belegtabelle({ belege, titel, ziel = (b) => ({ seite: 'beleg', id: b.id, schritt: null }) }: { belege: Belegzeile[]; titel: string; ziel?: (b: Belegzeile) => Route }) {
  if (belege.length === 0) return null
  return (
    <div className="tabellenrahmen">
      <table className="tabelle belegtabelle">
        <caption className="unsichtbar">{titel}</caption>
        <thead>
          <tr>
            <th scope="col">Beleg</th>
            <th scope="col">Lieferant</th>
            <th scope="col">Rechnung</th>
            <th scope="col">Datum</th>
            <th scope="col" className="zahl">
              Brutto
            </th>
            <th scope="col">Prüfung</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {belege.map((b) => (
            <tr key={b.id}>
              <th scope="row">
                <a href={routeZuHash(ziel(b))}>{b.belegnummer}</a>
                <span className="leise klein block">{b.format}</span>
              </th>
              <td>{b.lieferant ?? <span className="leise">noch nicht erfasst</span>}</td>
              <td>{b.rechnungsnummer ?? '–'}</td>
              <td>{datum(b.rechnungsdatum)}</td>
              <td className="zahl">{betrag(b.bruttoCent, b.waehrung)}</td>
              <td>
                <AmpelAnzeige ampel={b.ampel} />
                {b.dubletten > 0 && <span className="marke-dublette">mögliche Dublette</span>}
              </td>
              <td>
                <Statusmarke wert={b.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
