import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ABGEMELDET, api, type EinstellungenAntwort, type Sitzung } from './api.ts'
import { Anmeldung } from './anmeldung/Anmeldung.tsx'
import { Archiv } from './archiv/Archiv.tsx'
import { BelegAssistent } from './beleg/BelegAssistent.tsx'
import { Belege } from './belege/Belege.tsx'
import { Eingang } from './eingang/Eingang.tsx'
import { Einrichtung } from './einrichtung/Einrichtung.tsx'
import { Einstellungsseite } from './einstellungen/Einstellungsseite.tsx'
import { Laden, Schalter } from './gemeinsam/Bausteine.tsx'
import { Darstellungswahl } from './gemeinsam/Darstellung.tsx'
import { useDarstellung } from './gemeinsam/useDarstellung.ts'
import { AppKontext, type AppApi } from './kontext.ts'
import { routeZuHash, useRoute, type Route } from './route.ts'
import { Uebergabe } from './uebergabe/Uebergabe.tsx'
import './styles.css'

const ERKLAERUNGEN = 'belegbruecke.erklaerungen'

function gespeicherteErklaerungen(): boolean {
  try {
    return localStorage.getItem(ERKLAERUNGEN) !== 'aus'
  } catch {
    return true
  }
}

/** Sitzung laden; ohne Anmeldung die Anmeldung bzw. das Anlegen des ersten Benutzers. */
export default function App() {
  const [sitzung, setSitzung] = useState<Sitzung | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  // Hinweis auf der Anmeldung, wenn die Sitzung während der Arbeit abgelaufen ist
  const [abgelaufen, setAbgelaufen] = useState(false)
  const angemeldet = useRef(false)
  const laden = useCallback(() => {
    api<Sitzung>('/sitzung')
      .then((s) => {
        angemeldet.current = s.angemeldet
        setSitzung(s)
        setFehler(null)
        if (s.angemeldet) setAbgelaufen(false)
      })
      .catch(() => setFehler('Der Server der Belegbrücke ist nicht erreichbar. Starten Sie ihn mit start.cmd oder npm run server.'))
  }, [])
  useEffect(() => laden(), [laden])
  useEffect(() => {
    const abgemeldet = () => {
      // Nur während der Arbeit; nach dem Abmelden oder auf der Anmeldung ist nichts abgelaufen
      if (!angemeldet.current) return
      angemeldet.current = false
      setAbgelaufen(true)
      laden()
    }
    window.addEventListener(ABGEMELDET, abgemeldet)
    return () => window.removeEventListener(ABGEMELDET, abgemeldet)
  }, [laden])

  if (fehler) {
    return (
      <Rahmenlos>
        <h1>Belegbrücke</h1>
        <p role="alert">{fehler}</p>
      </Rahmenlos>
    )
  }
  if (!sitzung) {
    return (
      <Rahmenlos>
        <Laden />
      </Rahmenlos>
    )
  }
  if (!sitzung.angemeldet || !sitzung.benutzer) {
    return (
      <Rahmenlos>
        <Anmeldung ersterBenutzer={sitzung.einrichtungNoetig} angemeldet={laden} abgelaufen={abgelaufen && !sitzung.einrichtungNoetig} />
      </Rahmenlos>
    )
  }
  const abmelden = async () => {
    // Antworten, die nach dem Abmelden noch mit 401 zurückkommen, sind kein Ablauf der Sitzung
    angemeldet.current = false
    await api('/abmelden', { daten: {} }).catch(() => undefined)
    laden()
  }
  return <Hauptfenster sitzung={sitzung as Sitzung & { benutzer: NonNullable<Sitzung['benutzer']> }} abmelden={abmelden} />
}

function Rahmenlos({ children }: { children: ReactNode }) {
  const [darstellung, setDarstellung] = useDarstellung()
  return (
    <div className="app">
      <header className="kopf">
        <Marke />
        <div className="kopf-aktionen">
          <Darstellungswahl wert={darstellung} aendern={setDarstellung} />
        </div>
      </header>
      <main id="inhalt" className="anmeldeflaeche">
        {children}
      </main>
      <Fuss />
    </div>
  )
}

function Marke() {
  return (
    <div className="marke">
      <img src="/favicon.svg" alt="" width={28} height={28} />
      <span>Belegbrücke</span>
    </div>
  )
}

function Fuss() {
  return <footer className="fuss">Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a). Keine Steuer- oder Rechtsberatung.</footer>
}

const NAVIGATION: { seite: Route['seite']; text: string; route: Route }[] = [
  { seite: 'eingang', text: 'Eingang', route: { seite: 'eingang' } },
  { seite: 'belege', text: 'Belege', route: { seite: 'belege' } },
  { seite: 'uebergabe', text: 'Übergabe', route: { seite: 'uebergabe', laufId: null } },
  { seite: 'archiv', text: 'Archiv', route: { seite: 'archiv', id: null } },
  { seite: 'einstellungen', text: 'Einstellungen', route: { seite: 'einstellungen', bereich: 'firma' } },
]

function Hauptfenster({ sitzung, abmelden }: { sitzung: Sitzung & { benutzer: NonNullable<Sitzung['benutzer']> }; abmelden: () => Promise<void> }) {
  const [darstellung, setDarstellung] = useDarstellung()
  const [route, gehe] = useRoute()
  const [erklaerungen, setErklaerungenRoh] = useState(gespeicherteErklaerungen)
  const [meldung, setMeldung] = useState('')
  const [zaehler, setZaehler] = useState({ offen: 0, freigegeben: 0 })
  const [einstellungen, setEinstellungen] = useState<EinstellungenAntwort | null>(null)
  const meldungsZeit = useRef<number | undefined>(undefined)
  const ersterAufruf = useRef(true)

  const melde = useCallback((text: string) => {
    setMeldung(text)
    window.clearTimeout(meldungsZeit.current)
    meldungsZeit.current = window.setTimeout(() => setMeldung(''), 8000)
  }, [])
  const setErklaerungen = useCallback((an: boolean) => {
    setErklaerungenRoh(an)
    try {
      localStorage.setItem(ERKLAERUNGEN, an ? 'an' : 'aus')
    } catch {
      // ohne Speicher gilt die Wahl bis zum Neuladen
    }
  }, [])
  const aktualisiereZaehler = useCallback(() => {
    api<{ offen: number; freigegeben: number }>('/zaehler')
      .then(setZaehler)
      .catch(() => undefined)
  }, [])
  const ladeEinstellungen = useCallback(async () => {
    setEinstellungen(await api<EinstellungenAntwort>('/einstellungen'))
  }, [])

  useEffect(() => {
    api<{ offen: number; freigegeben: number }>('/zaehler')
      .then(setZaehler)
      .catch(() => undefined)
    api<EinstellungenAntwort>('/einstellungen')
      .then(setEinstellungen)
      .catch(() => undefined)
  }, [])

  // Beim ersten Start öffnet sich der Einrichtungsassistent (Spezifikation 5.1)
  const einrichtungOffen = einstellungen !== null && einstellungen.eingerichtetAm === null
  useEffect(() => {
    if (einrichtungOffen && route.seite !== 'einrichtung') gehe({ seite: 'einrichtung', schritt: 1 })
  }, [einrichtungOffen, route.seite, gehe])

  // Nach einem Seitenwechsel bekommt die Überschrift den Fokus (Tastatur und Bildschirmleser)
  const hash = routeZuHash(route)
  useEffect(() => {
    if (ersterAufruf.current) {
      ersterAufruf.current = false
      return
    }
    const t = window.setTimeout(() => document.querySelector<HTMLElement>('[data-seitentitel]')?.focus(), 50)
    window.scrollTo({ top: 0 })
    return () => window.clearTimeout(t)
  }, [hash])


  const apiWert = useMemo<AppApi>(
    () => ({ benutzer: sitzung.benutzer, erklaerungen, setErklaerungen, melde, zaehler, aktualisiereZaehler, gehe, einstellungen, ladeEinstellungen }),
    [sitzung.benutzer, erklaerungen, setErklaerungen, melde, zaehler, aktualisiereZaehler, gehe, einstellungen, ladeEinstellungen],
  )

  return (
    <AppKontext.Provider value={apiWert}>
      <div className="app">
        <a
          className="sprungmarke"
          href="#inhalt"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('inhalt')?.focus()
          }}
        >
          Zum Inhalt springen
        </a>
        <header className="kopf">
          <Marke />
          <p className="meldung" role="status" aria-live="polite">
            {meldung}
          </p>
          <div className="kopf-aktionen">
            <Schalter an={erklaerungen} aendern={setErklaerungen}>
              Erklärungen
            </Schalter>
            <Darstellungswahl wert={darstellung} aendern={setDarstellung} />
            <span className="benutzername">{sitzung.benutzer.name}</span>
            <button type="button" className="knopf knopf-klein" onClick={() => void abmelden()}>
              Abmelden
            </button>
          </div>
        </header>
        <div className={einrichtungOffen ? 'rahmen ohne-navigation' : 'rahmen'}>
          {!einrichtungOffen && (
            <nav className="navigation" aria-label="Hauptnavigation">
              <ul>
                {NAVIGATION.map((n) => (
                  <li key={n.seite}>
                    <a href={routeZuHash(n.route)} aria-current={route.seite === n.seite || (n.seite === 'belege' && route.seite === 'beleg') ? 'page' : undefined}>
                      <span>{n.text}</span>
                      {n.seite === 'eingang' && zaehler.offen > 0 && (
                        <span className="zaehler">
                          {zaehler.offen}
                          <span className="unsichtbar"> offen</span>
                        </span>
                      )}
                      {n.seite === 'uebergabe' && zaehler.freigegeben > 0 && (
                        <span className="zaehler zaehler-leise">
                          {zaehler.freigegeben}
                          <span className="unsichtbar"> freigegeben, noch nicht übergeben</span>
                        </span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <main id="inhalt" tabIndex={-1} className="inhalt">
            <Seite route={route} />
          </main>
        </div>
        <Fuss />
      </div>
    </AppKontext.Provider>
  )
}

function Seite({ route }: { route: Route }) {
  switch (route.seite) {
    case 'eingang':
      return <Eingang />
    case 'belege':
      return <Belege />
    case 'beleg':
      return <BelegAssistent key={route.id} id={route.id} schritt={route.schritt} />
    case 'uebergabe':
      return <Uebergabe laufId={route.laufId} />
    case 'archiv':
      return <Archiv id={route.id} />
    case 'einstellungen':
      return <Einstellungsseite bereich={route.bereich} />
    case 'einrichtung':
      return <Einrichtung schritt={route.schritt} />
  }
}
