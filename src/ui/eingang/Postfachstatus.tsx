/** Statusanzeige des Postfachs im Eingang (Schritt 5.4): letzter und nächster Abruf, Ergebnis, „Jetzt abrufen“. */
import { useState } from 'react'
import { api, fehlerText, useLaden } from '../api.ts'
import { Hinweis } from '../gemeinsam/Bausteine.tsx'
import { useApp, zeit } from '../kontext.ts'
import { routeZuHash } from '../route.ts'

interface Mailergebnis {
  messageId: string
  absender: string
  betreff: string
  art: 'belege' | 'bekannt' | 'ohne-beleg' | 'gefiltert' | 'fehler'
  text: string
}

interface Abrufbericht {
  zeitpunkt: string
  ok: boolean
  fehler: string | null
  nachrichten: number
  belege: number
  mails: Mailergebnis[]
}

interface Status {
  aktiv: boolean
  eingerichtet: boolean
  laeuft: boolean
  letzterAbruf: Abrufbericht | null
  naechsterAbruf: string | null
}

export function Postfachstatus({ abgerufen }: { abgerufen: () => void }) {
  const { melde } = useApp()
  const status = useLaden<Status>('/postfach/status')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const s = status.daten
  if (!s || !s.aktiv) return null

  const abrufen = async () => {
    setLaeuft(true)
    setFehler(null)
    try {
      const r = await api<{ bericht: Abrufbericht }>('/postfach/abrufen', { daten: {} })
      melde(r.bericht.ok ? `Postfach abgerufen: ${r.bericht.belege} Beleg${r.bericht.belege === 1 ? '' : 'e'} übernommen.` : 'Abruf des Postfachs fehlgeschlagen.')
      status.neu()
      abgerufen()
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setLaeuft(false)
    }
  }

  const l = s.letzterAbruf
  return (
    <section className="karte postfachstatus" aria-labelledby="postfach-titel">
      <h2 id="postfach-titel">Postfach</h2>
      <p>
        {l ? (
          <>
            Letzter Abruf {zeit(l.zeitpunkt)}: {l.ok ? `${l.nachrichten} E-Mail${l.nachrichten === 1 ? '' : 's'}, ${l.belege} Beleg${l.belege === 1 ? '' : 'e'} übernommen.` : 'fehlgeschlagen.'}
          </>
        ) : (
          'Noch kein Abruf seit dem Start.'
        )}
        {s.naechsterAbruf && <> Nächster Abruf {zeit(s.naechsterAbruf)}.</>}
      </p>
      {l?.fehler && (
        <Hinweis art="fehler" titel="Abruf fehlgeschlagen">
          {l.fehler} <a href={routeZuHash({ seite: 'einstellungen', bereich: 'eingang' })}>Postfach-Einstellungen</a>
        </Hinweis>
      )}
      {l && l.mails.some((m) => m.art !== 'belege' && m.art !== 'bekannt') && (
        <Hinweis art="warnung" titel="Hinweise zum letzten Abruf">
          <ul>
            {l.mails
              .filter((m) => m.art !== 'belege' && m.art !== 'bekannt')
              .map((m, i) => (
                <li key={`${m.messageId}-${i}`}>
                  {m.betreff ? `„${m.betreff}“` : 'E-Mail'}
                  {m.absender && ` von ${m.absender}`}: {m.text}
                </li>
              ))}
          </ul>
        </Hinweis>
      )}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <div className="knopfreihe">
        <button type="button" className="knopf" disabled={laeuft || s.laeuft} onClick={() => void abrufen()}>
          {laeuft ? 'Wird abgerufen …' : 'Jetzt abrufen'}
        </button>
      </div>
    </section>
  )
}
