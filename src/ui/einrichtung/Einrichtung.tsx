/**
 * Einrichtungsassistent E1 bis E5 (Spezifikation 5.2): öffnet sich beim ersten Start; jeder Schritt
 * speichert, bevor es weitergeht. Abschluss setzt `eingerichtetAm`.
 */
import { useState } from 'react'
import type { Einstellungen, Steuerfall } from '../../fach/typen.ts'
import { fehlerText, useLaden, type EinstellungenAntwort, type Systeminfo } from '../api.ts'
import { Haken, Hinweis, Laden, Lernhinweis, Schrittleiste, Seitentitel } from '../gemeinsam/Bausteine.tsx'
import { AufbewahrungInfo, FirmaFormular, KanzleiFormular, Kontenplan, SteuerschluesselFormular } from '../einstellungen/Formulare.tsx'
import { EingangFormular } from '../einstellungen/Postfach.tsx'
import { alsEinstellungen, firmaFehler, kanzleiFehler, speichereEinstellungen, steuerschluesselFehler } from '../einstellungen/pruefen.ts'
import { useApp } from '../kontext.ts'

const SCHRITTE = [
  { id: '1', titel: 'Firma' },
  { id: '2', titel: 'Kanzlei' },
  { id: '3', titel: 'Steuerschlüssel und Konten' },
  { id: '4', titel: 'Eingang' },
  { id: '5', titel: 'Aufbewahrung' },
] as const

export function Einrichtung({ schritt }: { schritt: number }) {
  const { einstellungen } = useApp()
  if (!einstellungen) return <Laden />
  return <Einrichtungsschritte schritt={schritt} start={einstellungen} />
}

function Einrichtungsschritte({ schritt, start }: { schritt: number; start: EinstellungenAntwort }) {
  const { ladeEinstellungen, gehe, melde } = useApp()
  const system = useLaden<Systeminfo>('/system')
  const [entwurf, setEntwurf] = useState<Einstellungen>(() => alsEinstellungen(start))
  const [bewusstLeer, setBewusstLeer] = useState<Record<Steuerfall, boolean>>(() => ({
    'vorsteuer-19': !start.datev.buSchluessel['vorsteuer-19'],
    'vorsteuer-7': !start.datev.buSchluessel['vorsteuer-7'],
    'ohne-vorsteuer': !start.datev.buSchluessel['ohne-vorsteuer'],
    sonderfall: true,
  }))
  const [geprueft, setGeprueft] = useState(false)
  const [bestaetigt, setBestaetigt] = useState(false)
  const [postfachOk, setPostfachOk] = useState(true)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  const fFirma = firmaFehler(entwurf.firma)
  const fKanzlei = kanzleiFehler(entwurf.datev)
  const fSchluessel = steuerschluesselFehler(entwurf.datev.buSchluessel, bewusstLeer)
  const schrittFehler = (n: number): string | null => {
    if (n === 1 && Object.keys(fFirma).length) return 'Bitte Name, Ort und Land der Firma angeben.'
    if (n === 2 && Object.keys(fKanzlei).length) return 'Bitte die markierten Angaben zur Kanzlei korrigieren.'
    if (n === 3) return fSchluessel
    if (n === 4 && !postfachOk) return 'Testen Sie die Verbindung zum Postfach erfolgreich oder wählen Sie „Nur Upload“.'
    if (n === 5 && !bestaetigt) return 'Bitte bestätigen Sie die Hinweise zur Aufbewahrung.'
    return null
  }

  const weiter = async () => {
    setGeprueft(true)
    const f = schrittFehler(schritt)
    if (f) {
      setFehler(f)
      return
    }
    setFehler(null)
    setSendet(true)
    try {
      const abschluss = schritt === 5
      await speichereEinstellungen({ ...entwurf, eingerichtetAm: abschluss ? 'jetzt' : null })
      await ladeEinstellungen()
      setGeprueft(false)
      if (abschluss) {
        melde('Einrichtung abgeschlossen. Laden Sie jetzt Ihre ersten Rechnungen hoch.')
        gehe({ seite: 'eingang' })
      } else gehe({ seite: 'einrichtung', schritt: schritt + 1 })
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSendet(false)
    }
  }

  const titel = SCHRITTE[schritt - 1].titel
  return (
    <div className="seite-schmal">
      <Seitentitel unter={`Einrichtung, Schritt ${schritt} von 5`}>{titel}</Seitentitel>
      <Schrittleiste label="Schritte der Einrichtung" schritte={SCHRITTE.map((s) => ({ id: s.id, titel: s.titel, fertig: Number(s.id) < schritt, gesperrt: Number(s.id) > schritt }))} aktiv={String(schritt) as (typeof SCHRITTE)[number]['id']} waehlen={(s) => gehe({ seite: 'einrichtung', schritt: Number(s) })} />
      <section className="karte">
        {schritt === 1 && (
          <>
            <Lernhinweis titel="Wofür die Angaben dienen">
              Jede eingehende Rechnung muss an Ihre Firma gerichtet sein. Die Belegbrücke vergleicht dazu den Empfänger der Rechnung (BT-44) mit Ihrem Namen und den Schreibweisen. Als Kleinunternehmer ziehen Sie keine Vorsteuer; die Kontierung berücksichtigt das.
            </Lernhinweis>
            <FirmaFormular wert={entwurf.firma} aendern={(firma) => setEntwurf({ ...entwurf, firma })} fehler={geprueft ? fFirma : {}} />
          </>
        )}
        {schritt === 2 && <KanzleiFormular wert={entwurf.datev} aendern={(datev) => setEntwurf({ ...entwurf, datev })} fehler={geprueft ? fKanzlei : {}} />}
        {schritt === 3 && (
          <>
            <SteuerschluesselFormular wert={entwurf.datev.buSchluessel} aendern={(buSchluessel) => setEntwurf({ ...entwurf, datev: { ...entwurf.datev, buSchluessel } })} bewusstLeer={bewusstLeer} setBewusstLeer={setBewusstLeer} />
            <Kontenplan />
          </>
        )}
        {schritt === 4 && <EingangFormular entwurf={entwurf} aendern={setEntwurf} setBereit={setPostfachOk} />}
        {schritt === 5 && (
          <>
            <AufbewahrungInfo einstellungen={entwurf} datenOrdner={system.daten?.datenOrdner ?? null} />
            <Haken an={bestaetigt} aendern={setBestaetigt}>
              Ich habe die Hinweise zu Aufbewahrung, Sicherung und Haftung gelesen.
            </Haken>
          </>
        )}
        {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
        <div className="knopfreihe schrittknoepfe">
          {schritt > 1 && (
            <button type="button" className="knopf" onClick={() => gehe({ seite: 'einrichtung', schritt: schritt - 1 })}>
              Zurück
            </button>
          )}
          <button type="button" className="knopf knopf-haupt" disabled={sendet} onClick={() => void weiter()}>
            {schritt === 5 ? 'Einrichtung abschließen' : 'Speichern und weiter'}
          </button>
        </div>
      </section>
    </div>
  )
}
