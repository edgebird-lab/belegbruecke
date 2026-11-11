/**
 * E4 Eingang (Spezifikation 5.2, Schritt 5.4): nur Upload oder zusätzlich ein IMAP-Postfach mit
 * Verbindungstest. Weiter geht es, wenn der Test erfolgreich war oder das Postfach aus ist.
 */
import { useState } from 'react'
import type { Einstellungen, PostfachEinstellungen } from '../../fach/typen.ts'
import { api, fehlerText } from '../api.ts'
import { Auswahl, Feld, Haken, Hinweis, Lernhinweis, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { useApp } from '../kontext.ts'

export function EingangFormular({ entwurf, aendern, setBereit }: { entwurf: Einstellungen; aendern: (e: Einstellungen) => void; setBereit: (ok: boolean) => void }) {
  const { einstellungen, melde } = useApp()
  const p = entwurf.postfach
  const gespeichert = einstellungen?.postfach
  const [passwort, setPasswort] = useState('')
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [testet, setTestet] = useState(false)
  const passwortGesetzt = !!einstellungen?.passwortGesetzt

  // Unverändert gegenüber dem gespeicherten, schon eingerichteten Postfach: kein neuer Test nötig
  const unveraendert = (n: PostfachEinstellungen) =>
    !!gespeichert && gespeichert.aktiv && passwortGesetzt && n.server === gespeichert.server && n.port === gespeichert.port && n.benutzer === gespeichert.benutzer && n.ordner === gespeichert.ordner

  const setze = (neu: Partial<PostfachEinstellungen>, verbindungGeaendert = false) => {
    const n = { ...p, ...neu }
    aendern({ ...entwurf, postfach: n })
    if (verbindungGeaendert) {
      setTest(null)
      setBereit(!n.aktiv || unveraendert(n))
    }
  }

  const testen = async () => {
    setTestet(true)
    setTest(null)
    try {
      const r = await api<{ ok: boolean; text: string }>('/postfach/test', { daten: { server: p.server.trim(), port: p.port, benutzer: p.benutzer.trim(), ordner: p.ordner, ...(passwort ? { passwort } : {}) } })
      setTest(r)
      if (r.ok && passwort) {
        await api('/postfach/passwort', { methode: 'PUT', daten: { passwort } })
        setPasswort('')
        melde('Verbindung erfolgreich; das Passwort ist verschlüsselt gespeichert.')
      }
      setBereit(r.ok)
    } catch (e) {
      setTest({ ok: false, text: fehlerText(e) })
      setBereit(false)
    } finally {
      setTestet(false)
    }
  }

  return (
    <div className="formular">
      <Auswahl
        label="Wie kommen Rechnungen in die Belegbrücke?"
        wert={p.aktiv ? 'postfach' : 'upload'}
        aendern={(w) => setze({ aktiv: w === 'postfach' }, true)}
        optionen={[
          { wert: 'upload', text: 'Nur Upload', beschreibung: 'Dateien in den Eingang ziehen oder auswählen' },
          { wert: 'postfach', text: 'Zusätzlich ein E-Mail-Postfach', beschreibung: 'IMAP mit TLS, Abruf in festem Abstand' },
        ]}
      />
      {p.aktiv && (
        <>
          <Lernhinweis titel="Was beim Abruf passiert">
            Die Belegbrücke holt die Mails aus dem Ordner, übernimmt XML- und PDF-Anhänge als Belege und verschiebt die Mail danach in den Zielordner. Mails ohne Rechnung kommen nach „Zielordner/ohne-beleg“. Bilder übernimmt sie nicht automatisch. Viele Anbieter verlangen für IMAP ein eigenes App-Passwort.
          </Lernhinweis>
          <div className="feldreihe">
            <Textfeld label="IMAP-Server" wert={p.server} aendern={(server) => setze({ server: server.trim() }, true)} placeholder="imap.beispiel.de" pflicht />
            <Textfeld label="Port (TLS)" inputMode="numeric" wert={String(p.port)} aendern={(t) => setze({ port: Number(t.replace(/\D/g, '')) || 0 }, true)} breite="schmal" />
          </div>
          <div className="feldreihe">
            <Textfeld label="Benutzer" wert={p.benutzer} aendern={(benutzer) => setze({ benutzer }, true)} autoComplete="off" pflicht />
            <Textfeld
              label="Passwort"
              typ="password"
              wert={passwort}
              aendern={(w) => {
                setPasswort(w)
                setTest(null)
                setBereit(false)
              }}
              autoComplete="new-password"
              hilfe={passwortGesetzt ? 'Ein Passwort ist gespeichert (verschlüsselt). Nur ausfüllen, um es zu ändern.' : 'Wird verschlüsselt gespeichert, sobald der Test gelingt.'}
            />
          </div>
          <div className="feldreihe">
            <Textfeld label="Ordner" wert={p.ordner} aendern={(ordner) => setze({ ordner }, true)} />
            <Textfeld label="Zielordner nach der Übernahme" wert={p.zielOrdner} aendern={(zielOrdner) => setze({ zielOrdner })} />
            <Textfeld label="Abruf alle … Minuten" inputMode="numeric" wert={String(p.intervallMinuten)} aendern={(t) => setze({ intervallMinuten: Math.min(1440, Math.max(5, Number(t.replace(/\D/g, '')) || 15)) })} breite="schmal" />
          </div>
          <Feld label="Nur von diesen Absendern (freiwillig)" hilfe="Eine Adresse je Zeile, oder eine Domain wie @lieferant.de. Leer = alle Absender.">
            {(id, b) => (
              <textarea
                id={id}
                aria-describedby={b}
                rows={3}
                value={p.nurVonAbsendern.join('\n')}
                onChange={(e) =>
                  setze({
                    nurVonAbsendern: e.target.value
                      .split('\n')
                      .map((z) => z.trim())
                      .filter(Boolean)
                      .slice(0, 50),
                  })
                }
              />
            )}
          </Feld>
          <Haken an={p.emlAufbewahren} aendern={(emlAufbewahren) => setze({ emlAufbewahren })}>
            Die ganze E-Mail (.eml) mit aufbewahren, wenn sie eine Rechnung enthält
          </Haken>
          <div className="knopfreihe">
            <button type="button" className="knopf" disabled={testet || !p.server || !p.benutzer} onClick={() => void testen()}>
              Verbindung testen
            </button>
          </div>
          {testet && <p role="status">Verbindung wird geprüft …</p>}
          {test && (
            <Hinweis art={test.ok ? 'erfolg' : 'fehler'} titel={test.ok ? 'Verbindung in Ordnung' : 'Verbindung fehlgeschlagen'}>
              {test.text}
            </Hinweis>
          )}
        </>
      )}
      {!p.aktiv && <p className="leise">Rechnungen kommen per Upload: Dateien in den Eingang ziehen oder auswählen (XML, PDF, JPG, PNG; mehrere auf einmal).</p>}
    </div>
  )
}
