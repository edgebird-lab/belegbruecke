import { useState, type FormEvent } from 'react'
import { api, fehlerText } from '../api.ts'
import { Hinweis, Textfeld } from '../gemeinsam/Bausteine.tsx'

/** Anmeldung; beim allerersten Start legt man hier den ersten Benutzer an (bis zu 3 Benutzer). */
export function Anmeldung({ ersterBenutzer, angemeldet }: { ersterBenutzer: boolean; angemeldet: () => void }) {
  const [name, setName] = useState('')
  const [anmeldename, setAnmeldename] = useState('')
  const [passwort, setPasswort] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  const senden = async (e: FormEvent) => {
    e.preventDefault()
    setFehler(null)
    if (ersterBenutzer && passwort !== wiederholung) {
      setFehler('Die beiden Passwörter stimmen nicht überein.')
      return
    }
    setSendet(true)
    try {
      if (ersterBenutzer) await api('/einrichtung/benutzer', { daten: { name: name.trim(), anmeldename: anmeldename.trim(), passwort } })
      else await api('/anmelden', { daten: { anmeldename: anmeldename.trim(), passwort } })
      angemeldet()
    } catch (x) {
      setFehler(fehlerText(x))
      setSendet(false)
    }
  }

  return (
    <section className="karte anmeldung" aria-labelledby="anmeldung-titel">
      <h1 id="anmeldung-titel">{ersterBenutzer ? 'Willkommen bei der Belegbrücke' : 'Anmelden'}</h1>
      {ersterBenutzer && (
        <p className="leise">
          Legen Sie zuerst Ihren Benutzer an. Danach führt ein Assistent durch die Einrichtung: Firma, Kanzlei, Steuerschlüssel und Aufbewahrung. Alle Daten bleiben auf diesem Rechner.
        </p>
      )}
      <form onSubmit={(e) => void senden(e)} className="formular">
        {ersterBenutzer && <Textfeld label="Ihr Name" wert={name} aendern={setName} pflicht autoComplete="name" />}
        <Textfeld label="Anmeldename" wert={anmeldename} aendern={setAnmeldename} pflicht autoComplete="username" hilfe={ersterBenutzer ? 'Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich, z. B. robin' : undefined} />
        <Textfeld label="Passwort" typ="password" wert={passwort} aendern={setPasswort} pflicht autoComplete={ersterBenutzer ? 'new-password' : 'current-password'} hilfe={ersterBenutzer ? 'Mindestens 10 Zeichen.' : undefined} />
        {ersterBenutzer && <Textfeld label="Passwort wiederholen" typ="password" wert={wiederholung} aendern={setWiederholung} pflicht autoComplete="new-password" />}
        {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
        <div className="knopfreihe">
          <button type="submit" className="knopf knopf-haupt" disabled={sendet}>
            {ersterBenutzer ? 'Benutzer anlegen' : 'Anmelden'}
          </button>
        </div>
      </form>
    </section>
  )
}
