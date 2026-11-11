import { useEffect, useState } from 'react'
import { Darstellungswahl } from './gemeinsam/Darstellung.tsx'
import { useDarstellung } from './gemeinsam/useDarstellung.ts'
import './styles.css'

/** Antwort von GET /api/status */
interface Serverstatus {
  version: string
  artefakte: { konfiguration: string; enSchematron: string; xrSchematron: string; visualisierung: string } | null
}

type Verbindung = { art: 'laedt' } | { art: 'ok'; status: Serverstatus } | { art: 'fehler' }

/**
 * Startseite des Entwicklungsstands: Die Oberfläche mit Eingang, Beleg-Assistent, Übergabe und
 * Archiv folgt in Phase 3 (docs/stand.md). Bis dahin zeigt sie, ob der Server läuft.
 */
export default function App() {
  const [darstellung, setDarstellung] = useDarstellung()
  const [verbindung, setVerbindung] = useState<Verbindung>({ art: 'laedt' })

  useEffect(() => {
    let aktiv = true
    fetch('/api/status')
      .then(async (antwort) => {
        if (!antwort.ok) throw new Error(String(antwort.status))
        const status = (await antwort.json()) as Serverstatus
        if (aktiv) setVerbindung({ art: 'ok', status })
      })
      .catch(() => aktiv && setVerbindung({ art: 'fehler' }))
    return () => {
      aktiv = false
    }
  }, [])

  return (
    <div className="seite">
      <header className="kopf">
        <div className="marke">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Belegbrücke</span>
        </div>
        <Darstellungswahl wert={darstellung} aendern={setDarstellung} />
      </header>
      <main className="inhalt">
        <h1>E-Rechnungen annehmen, prüfen, archivieren und übergeben</h1>
        <p className="einleitung">
          Die Belegbrücke prüft eingehende E-Rechnungen nach EN 16931 und XRechnung, erklärt Fehler in Klartext,
          bewahrt das Original unverändert mit Prüfbericht und Hashkette auf und erzeugt monatlich die Übergabe an
          die Steuerkanzlei. Alles bleibt auf diesem Rechner.
        </p>
        <section className="karte" aria-labelledby="status-titel">
          <h2 id="status-titel">Server</h2>
          <Statusanzeige verbindung={verbindung} />
        </section>
        <section className="karte" aria-labelledby="stand-titel">
          <h2 id="stand-titel">Entwicklungsstand</h2>
          <p>
            Fachkern, Prüfung, Archiv und Server entstehen zuerst. Die Assistenten für Eingang, Beleg, Übergabe und
            Archiv folgen in Phase 3; der Stand steht in <code>docs/stand.md</code>.
          </p>
        </section>
      </main>
      <footer className="fuss">
        Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a).
      </footer>
    </div>
  )
}

function Statusanzeige({ verbindung }: { verbindung: Verbindung }) {
  if (verbindung.art === 'laedt') return <p role="status">Verbindung wird geprüft …</p>
  if (verbindung.art === 'fehler') {
    return (
      <p role="status" className="ampel ampel-grau">
        <span aria-hidden="true">○</span> Server nicht erreichbar. Starten Sie ihn mit <code>npm run server</code>.
      </p>
    )
  }
  const { status } = verbindung
  return (
    <div role="status">
      <p className="ampel ampel-gruen">
        <span aria-hidden="true">✓</span> Server läuft, Version {status.version}
      </p>
      {status.artefakte ? (
        <dl className="eckdaten">
          <dt>Prüfkonfiguration</dt>
          <dd>{status.artefakte.konfiguration}</dd>
          <dt>EN 16931</dt>
          <dd>{status.artefakte.enSchematron}</dd>
          <dt>XRechnung</dt>
          <dd>{status.artefakte.xrSchematron}</dd>
          <dt>Ansicht</dt>
          <dd>{status.artefakte.visualisierung}</dd>
        </dl>
      ) : (
        <p>Prüfartefakte fehlen. Laden Sie sie mit <code>npm run vorbereiten</code>.</p>
      )}
    </div>
  )
}
