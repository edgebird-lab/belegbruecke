/**
 * Einstellungen: Firma, Kanzlei, Steuerschlüssel und Konten, Lieferanten, Eingang, Benutzer, System.
 * Jede Änderung erzeugt auf dem Server einen Protokolleintrag mit altem und neuem Wert.
 */
import { useState } from 'react'
import type { Einstellungen, Lieferant, Steuerfall } from '../../fach/typen.ts'
import { api, fehlerText, useLaden, type Benutzerinfo, type EinstellungenAntwort, type LieferantMitStatistik, type Systeminfo } from '../api.ts'
import { Hinweis, Laden, Seitentitel, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { useApp } from '../kontext.ts'
import { routeZuHash, type Einstellungsbereich } from '../route.ts'
import { AufbewahrungInfo, FirmaFormular, KanzleiFormular, Kontenplan, SteuerschluesselFormular } from './Formulare.tsx'
import { EingangFormular } from './Postfach.tsx'
import { alsEinstellungen, firmaFehler, kanzleiFehler, speichereEinstellungen, steuerschluesselFehler } from './pruefen.ts'

const BEREICHE: { id: Einstellungsbereich; titel: string }[] = [
  { id: 'firma', titel: 'Firma' },
  { id: 'kanzlei', titel: 'Kanzlei' },
  { id: 'konten', titel: 'Steuerschlüssel und Konten' },
  { id: 'lieferanten', titel: 'Lieferanten' },
  { id: 'eingang', titel: 'Eingang' },
  { id: 'benutzer', titel: 'Benutzer' },
  { id: 'system', titel: 'System und Aufbewahrung' },
]

export function Einstellungsseite({ bereich }: { bereich: Einstellungsbereich }) {
  const titel = BEREICHE.find((b) => b.id === bereich)!.titel
  return (
    <>
      <Seitentitel unter={titel}>Einstellungen</Seitentitel>
      <nav className="unternavigation" aria-label="Bereiche der Einstellungen">
        <ul>
          {BEREICHE.map((b) => (
            <li key={b.id}>
              <a href={routeZuHash({ seite: 'einstellungen', bereich: b.id })} aria-current={b.id === bereich ? 'page' : undefined}>
                {b.titel}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {(bereich === 'firma' || bereich === 'kanzlei' || bereich === 'konten' || bereich === 'eingang') && <Einstellungsformular bereich={bereich} />}
      {bereich === 'lieferanten' && <Lieferantenliste />}
      {bereich === 'benutzer' && <Benutzerverwaltung />}
      {bereich === 'system' && <System />}
    </>
  )
}

function Einstellungsformular({ bereich }: { bereich: 'firma' | 'kanzlei' | 'konten' | 'eingang' }) {
  const { einstellungen } = useApp()
  if (!einstellungen) return <Laden />
  return <Formularbereich key={bereich} bereich={bereich} start={einstellungen} />
}

function Formularbereich({ bereich, start }: { bereich: 'firma' | 'kanzlei' | 'konten' | 'eingang'; start: EinstellungenAntwort }) {
  const { ladeEinstellungen, melde } = useApp()
  const [entwurf, setEntwurf] = useState<Einstellungen>(() => alsEinstellungen(start))
  const [bewusstLeer, setBewusstLeer] = useState<Record<Steuerfall, boolean>>(() => ({
    'vorsteuer-19': !start.datev.buSchluessel['vorsteuer-19'],
    'vorsteuer-7': !start.datev.buSchluessel['vorsteuer-7'],
    'ohne-vorsteuer': !start.datev.buSchluessel['ohne-vorsteuer'],
    sonderfall: true,
  }))
  const [bereit, setBereit] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [geprueft, setGeprueft] = useState(false)
  const fFirma = firmaFehler(entwurf.firma)
  const fKanzlei = kanzleiFehler(entwurf.datev)
  const speichern = async () => {
    setGeprueft(true)
    setFehler(null)
    const f =
      bereich === 'firma' && Object.keys(fFirma).length
        ? 'Bitte die markierten Angaben korrigieren.'
        : bereich === 'kanzlei' && Object.keys(fKanzlei).length
          ? 'Bitte die markierten Angaben korrigieren.'
          : bereich === 'konten'
            ? steuerschluesselFehler(entwurf.datev.buSchluessel, bewusstLeer)
            : bereich === 'eingang' && !bereit
              ? 'Testen Sie die Verbindung zum Postfach erfolgreich oder schalten Sie das Postfach aus.'
              : null
    if (f) {
      setFehler(f)
      return
    }
    try {
      await speichereEinstellungen(entwurf)
      await ladeEinstellungen()
      melde('Einstellungen gespeichert.')
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }
  return (
    <section className="karte">
      {bereich === 'firma' && <FirmaFormular wert={entwurf.firma} aendern={(firma) => setEntwurf({ ...entwurf, firma })} fehler={geprueft ? fFirma : {}} />}
      {bereich === 'kanzlei' && <KanzleiFormular wert={entwurf.datev} aendern={(datev) => setEntwurf({ ...entwurf, datev })} fehler={geprueft ? fKanzlei : {}} />}
      {bereich === 'konten' && <SteuerschluesselFormular wert={entwurf.datev.buSchluessel} aendern={(buSchluessel) => setEntwurf({ ...entwurf, datev: { ...entwurf.datev, buSchluessel } })} bewusstLeer={bewusstLeer} setBewusstLeer={setBewusstLeer} />}
      {bereich === 'eingang' && <EingangFormular entwurf={entwurf} aendern={setEntwurf} setBereit={setBereit} />}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <div className="knopfreihe schrittknoepfe">
        <button type="button" className="knopf knopf-haupt" onClick={() => void speichern()}>
          Speichern
        </button>
      </div>
      {bereich === 'konten' && <Kontenplan />}
    </section>
  )
}

function Lieferantenzeile({ l, gespeichert }: { l: LieferantMitStatistik; gespeichert: () => void }) {
  const { melde } = useApp()
  const [name, setName] = useState(l.name)
  const [kreditor, setKreditor] = useState(l.kreditorKonto === null ? '' : String(l.kreditorKonto))
  const [fehler, setFehler] = useState<string | null>(null)
  const geaendert = name !== l.name || kreditor !== (l.kreditorKonto === null ? '' : String(l.kreditorKonto))
  const speichern = async () => {
    setFehler(null)
    try {
      const daten: Pick<Lieferant, 'name' | 'ustId' | 'steuernummer' | 'anschrift' | 'kreditorKonto'> = { name: name.trim(), ustId: l.ustId, steuernummer: l.steuernummer, anschrift: l.anschrift, kreditorKonto: kreditor ? Number(kreditor) : null }
      await api(`/lieferanten/${l.id}`, { methode: 'PUT', daten })
      melde(`Lieferant ${name} gespeichert.`)
      gespeichert()
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }
  return (
    <tr>
      <td>
        <input type="text" aria-label={`Name von ${l.name}`} value={name} onChange={(e) => setName(e.target.value)} />
        {fehler && (
          <span className="feld-meldung block" role="alert">
            {fehler}
          </span>
        )}
      </td>
      <td>
        <code>{l.schluessel}</code>
      </td>
      <td>
        <input type="text" inputMode="numeric" className="breite-schmal" aria-label={`Kreditorenkonto von ${l.name}`} value={kreditor} onChange={(e) => setKreditor(e.target.value.replace(/\D/g, ''))} />
      </td>
      <td className="zahl">{l.belege}</td>
      <td>{l.regeln.map((r) => `${r.steuerkategorie} ${r.steuersatz} % → ${r.sachkonto} (${r.anzahl}×)`).join('; ') || '–'}</td>
      <td>
        <button type="button" className="knopf knopf-klein" disabled={!geaendert} onClick={() => void speichern()}>
          Speichern
        </button>
      </td>
    </tr>
  )
}

function Lieferantenliste() {
  const liste = useLaden<{ lieferanten: LieferantMitStatistik[] }>('/lieferanten')
  if (liste.fehler) return <Hinweis art="fehler">{liste.fehler}</Hinweis>
  if (!liste.daten) return <Laden />
  return (
    <section className="karte">
      <p className="leise">Lieferanten entstehen im Schritt „Zuordnen“ eines Belegs. Das Kreditorenkonto vergibt die erste Freigabe; nach der ersten Übergabe bleibt es fest.</p>
      {liste.daten.lieferanten.length === 0 ? (
        <p>Noch keine Lieferanten.</p>
      ) : (
        <div className="tabellenrahmen">
          <table className="tabelle">
            <caption className="unsichtbar">Lieferanten</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Schlüssel</th>
                <th scope="col">Kreditorenkonto</th>
                <th scope="col" className="zahl">
                  Belege
                </th>
                <th scope="col">Kontierungsregeln</th>
                <th scope="col">
                  <span className="unsichtbar">Aktion</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.daten.lieferanten.map((l) => (
                <Lieferantenzeile key={`${l.id}-${l.name}-${l.kreditorKonto}`} l={l} gespeichert={liste.neu} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Benutzerverwaltung() {
  const { melde } = useApp()
  const liste = useLaden<{ benutzer: Benutzerinfo[]; hoechstens: number }>('/benutzer')
  const [neu, setNeu] = useState({ name: '', anmeldename: '', passwort: '' })
  const [fehler, setFehler] = useState<string | null>(null)
  const anlegen = async () => {
    setFehler(null)
    try {
      await api('/benutzer', { daten: neu })
      melde(`Benutzer ${neu.anmeldename} angelegt.`)
      setNeu({ name: '', anmeldename: '', passwort: '' })
      liste.neu()
    } catch (e) {
      setFehler(fehlerText(e))
    }
  }
  if (!liste.daten) return <Laden />
  return (
    <section className="karte">
      <ul>
        {liste.daten.benutzer.map((b) => (
          <li key={b.id}>
            {b.name} ({b.anmeldename})
          </li>
        ))}
      </ul>
      {liste.daten.benutzer.length < liste.daten.hoechstens ? (
        <fieldset className="formular">
          <legend>Benutzer hinzufügen (höchstens {liste.daten.hoechstens})</legend>
          <Textfeld label="Name" wert={neu.name} aendern={(name) => setNeu({ ...neu, name })} />
          <Textfeld label="Anmeldename" wert={neu.anmeldename} aendern={(anmeldename) => setNeu({ ...neu, anmeldename })} autoComplete="off" />
          <Textfeld label="Passwort (mindestens 10 Zeichen)" typ="password" wert={neu.passwort} aendern={(passwort) => setNeu({ ...neu, passwort })} autoComplete="new-password" />
          <div className="knopfreihe">
            <button type="button" className="knopf" onClick={() => void anlegen()}>
              Benutzer anlegen
            </button>
          </div>
        </fieldset>
      ) : (
        <p className="leise">Version 0.1 erlaubt höchstens {liste.daten.hoechstens} Benutzer.</p>
      )}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
    </section>
  )
}

function System() {
  const { einstellungen } = useApp()
  const system = useLaden<Systeminfo>('/system')
  if (!system.daten || !einstellungen) return <Laden />
  const a = system.daten.artefakte
  return (
    <section className="karte">
      <dl className="eckdaten">
        <dt>Version</dt>
        <dd>{system.daten.version}</dd>
        <dt>Prüfkonfiguration</dt>
        <dd>{a ? `${a.konfiguration}; EN 16931 ${a.enSchematron}; XRechnung ${a.xrSchematron}; Ansicht ${a.visualisierung}` : 'Prüfartefakte fehlen (npm run vorbereiten).'}</dd>
      </dl>
      <h2>Aufbewahrung</h2>
      <AufbewahrungInfo einstellungen={alsEinstellungen(einstellungen)} datenOrdner={system.daten.datenOrdner} />
    </section>
  )
}
