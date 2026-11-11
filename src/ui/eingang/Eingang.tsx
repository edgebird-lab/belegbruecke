/** Eingang (Schritte 3.3 und 5.4): Dateien hochladen (Ziehen und Ablegen oder Auswahl, mehrere), Postfach, offene Belege. */
import { useRef, useState, type DragEvent } from 'react'
import { api, fehlerText, useLaden, type Belegzeile, type Eingangsergebnis } from '../api.ts'
import { Belegtabelle } from '../belege/Belegtabelle.tsx'
import { AmpelAnzeige, Hinweis, Laden, Lernhinweis, Seitentitel } from '../gemeinsam/Bausteine.tsx'
import { useApp } from '../kontext.ts'
import { routeZuHash } from '../route.ts'
import { Postfachstatus } from './Postfachstatus.tsx'

export function Eingang() {
  const { aktualisiereZaehler, melde } = useApp()
  const offen = useLaden<{ belege: Belegzeile[] }>('/belege?offen=1')
  const [ergebnisse, setErgebnisse] = useState<Eingangsergebnis[]>([])
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [ueber, setUeber] = useState(false)
  const feld = useRef<HTMLInputElement>(null)

  const hochladen = async (dateien: File[]) => {
    if (dateien.length === 0) return
    setLaeuft(true)
    setFehler(null)
    try {
      const fd = new FormData()
      for (const f of dateien) fd.append('dateien', f, f.name)
      const r = await api<{ ergebnisse: Eingangsergebnis[] }>('/belege', { formular: fd })
      setErgebnisse(r.ergebnisse)
      const ok = r.ergebnisse.filter((e) => e.ok).length
      melde(`${ok} von ${r.ergebnisse.length} Dateien angenommen und geprüft.`)
      offen.neu()
      aktualisiereZaehler()
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setLaeuft(false)
    }
  }

  const ablegen = (e: DragEvent) => {
    e.preventDefault()
    setUeber(false)
    void hochladen([...e.dataTransfer.files])
  }

  return (
    <>
      <Seitentitel unter="Rechnungen annehmen, prüfen und bearbeiten">Eingang</Seitentitel>
      <Lernhinweis titel="Was beim Hochladen passiert">
        Die Belegbrücke erkennt das Format (XRechnung, ZUGFeRD, PDF, Bild), prüft E-Rechnungen mit den offiziellen Regeln der KoSIT und des CEN und legt das Original unverändert und schreibgeschützt ab. Jede Datei bekommt eine Belegnummer und einen Eintrag im Protokoll.
      </Lernhinweis>
      <section
        className={`ablagezone${ueber ? ' ueber' : ''}`}
        aria-labelledby="ablage-titel"
        onDragOver={(e) => {
          e.preventDefault()
          setUeber(true)
        }}
        onDragLeave={() => setUeber(false)}
        onDrop={ablegen}
      >
        <h2 id="ablage-titel">Rechnungen hochladen</h2>
        <p>Dateien hierher ziehen oder auswählen: E-Rechnungen (XML), PDF mit oder ohne eingebettete E-Rechnung, Fotos und Scans (JPG, PNG).</p>
        <button type="button" className="knopf knopf-haupt" disabled={laeuft} onClick={() => feld.current?.click()}>
          Dateien auswählen …
        </button>
        <input
          ref={feld}
          type="file"
          multiple
          accept=".xml,.pdf,.jpg,.jpeg,.png,application/xml,text/xml,application/pdf,image/jpeg,image/png"
          className="unsichtbar"
          aria-label="Rechnungsdateien auswählen"
          tabIndex={-1}
          onChange={(e) => {
            const dateien = [...(e.target.files ?? [])]
            e.target.value = ''
            void hochladen(dateien)
          }}
        />
        {laeuft && <Laden text="Dateien werden geprüft …" />}
        {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      </section>

      <Postfachstatus
        abgerufen={() => {
          offen.neu()
          aktualisiereZaehler()
        }}
      />

      {ergebnisse.length > 0 && (
        <section className="karte" aria-labelledby="ergebnis-titel">
          <h2 id="ergebnis-titel">Ergebnis des Uploads</h2>
          <ul className="ergebnisliste">
            {ergebnisse.map((e, i) => (
              <li key={`${e.dateiname}-${i}`}>
                <span className="dateiname">{e.dateiname}</span>
                {e.ok && e.belegId ? (
                  <>
                    <a href={routeZuHash({ seite: 'beleg', id: e.belegId, schritt: null })}>B-{String(e.laufnummer).padStart(5, '0')}</a>
                    <span className="leise">{e.format}</span>
                    {e.ampel && <AmpelAnzeige ampel={e.ampel} />}
                    {e.dubletten?.some((d) => d.stufe !== 'identische-datei') && <span className="marke-dublette">mögliche Dublette</span>}
                  </>
                ) : (
                  <span className="ampel ampel-rot">
                    <span aria-hidden="true">✕</span> {e.text}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="offen-titel">
        <h2 id="offen-titel">Offene Belege</h2>
        {offen.fehler && <Hinweis art="fehler">{offen.fehler}</Hinweis>}
        {!offen.daten && !offen.fehler && <Laden />}
        {offen.daten && offen.daten.belege.length === 0 && <p className="leise">Keine offenen Belege. Alles bearbeitet.</p>}
        {offen.daten && <Belegtabelle belege={offen.daten.belege} titel="Offene Belege" />}
      </section>
    </>
  )
}
