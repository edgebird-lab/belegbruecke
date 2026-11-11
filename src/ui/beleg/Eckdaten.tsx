/** Eckdaten einer Rechnung (B3 und Belegdetail): Lieferant, Nummer, Datum, Leistung, Beträge, Steuern, Zahlung. */
import type { Rechnungsdaten } from '../../fach/typen.ts'
import { betrag, datum } from '../kontext.ts'

export function Eckdaten({ r }: { r: Rechnungsdaten }) {
  const lieferant = r.typcode === '389' ? r.kaeufer : r.verkaeufer
  const leistung = r.lieferdatum
    ? datum(r.lieferdatum)
    : r.abrechnungszeitraum
      ? `${datum(r.abrechnungszeitraum.von)} bis ${datum(r.abrechnungszeitraum.bis)}`
      : r.positionen.some((p) => p.zeitraum)
        ? 'nur in einzelnen Positionen angegeben'
        : 'nicht angegeben'
  return (
    <dl className="eckdaten">
      <dt>{r.typcode === '389' ? 'Geschäftspartner (Gutschrift)' : 'Lieferant'}</dt>
      <dd>
        {lieferant.name}
        {lieferant.ustId && <span className="block leise">USt-IdNr. {lieferant.ustId}</span>}
        {lieferant.steuernummer && <span className="block leise">Steuernummer {lieferant.steuernummer}</span>}
        {(lieferant.anschrift.ort || lieferant.anschrift.plz) && (
          <span className="block leise">
            {[lieferant.anschrift.zeile1, [lieferant.anschrift.plz, lieferant.anschrift.ort].filter(Boolean).join(' '), lieferant.anschrift.land].filter(Boolean).join(', ')}
          </span>
        )}
      </dd>
      <dt>Rechnungsnummer</dt>
      <dd>{r.rechnungsnummer}</dd>
      <dt>Rechnungsdatum</dt>
      <dd>{datum(r.rechnungsdatum)}</dd>
      <dt>Leistungszeitpunkt</dt>
      <dd>{leistung}</dd>
      <dt>Brutto</dt>
      <dd className="zahl-links">{betrag(r.summen.bruttoCent, r.waehrung)}</dd>
      <dt>Steuern je Satz</dt>
      <dd>
        <ul className="liste-schlicht">
          {r.steuern.map((s, i) => (
            <li key={i}>
              {s.kategorie} {s.satz} %: {betrag(s.bemessungCent, r.waehrung)} netto, {betrag(s.steuerCent, r.waehrung)} Steuer
              {s.befreiungsgrund && <span className="block leise">{s.befreiungsgrund}</span>}
            </li>
          ))}
        </ul>
      </dd>
      {r.summen.vorausbezahltCent !== 0 && (
        <>
          <dt>Bereits gezahlt</dt>
          <dd>{betrag(r.summen.vorausbezahltCent, r.waehrung)}</dd>
        </>
      )}
      <dt>Zahlbetrag</dt>
      <dd>{betrag(r.summen.zahlbetragCent, r.waehrung)}</dd>
      <dt>Fällig am</dt>
      <dd>{datum(r.faelligAm)}</dd>
      <dt>IBAN</dt>
      <dd>{r.zahlung.iban ?? '–'}</dd>
      {r.anhaenge.length > 0 && (
        <>
          <dt>Anhänge</dt>
          <dd>
            <ul className="liste-schlicht">
              {r.anhaenge.map((a, i) => (
                <li key={i}>
                  {a.dateiname ?? a.kennung}
                  {a.beschreibung && ` – ${a.beschreibung}`}
                  {a.externeAdresse && <span className="block leise">Externer Verweis (wird nicht geöffnet): {a.externeAdresse}</span>}
                </li>
              ))}
            </ul>
            <span className="leise klein">Eingebettete Anhänge lassen sich in der Ansicht links herunterladen.</span>
          </dd>
        </>
      )}
    </dl>
  )
}
