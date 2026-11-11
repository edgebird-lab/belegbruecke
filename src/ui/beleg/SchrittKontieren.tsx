/**
 * B5 Kontieren: je Steuerzeile ein Sachkonto aus dem Kontenplan (zuletzt genutzte zuerst), Vorschlag
 * mit Herkunft, BU-Schlüssel nach R13 (von Hand nur bei Sonderfällen), Buchungstext, Summenprüfung.
 */
import { useState } from 'react'
import { STEUERFALL_TEXT } from '../../fach/kontierung.ts'
import { sucheSachkonten } from '../../fach/kontenplan.ts'
import type { Kontierungszeile } from '../../fach/typen.ts'
import { api, fehlerText, useLaden, type Sachkontenantwort } from '../api.ts'
import { Hinweis, Laden, Lernhinweis } from '../gemeinsam/Bausteine.tsx'
import { betrag, useApp } from '../kontext.ts'
import { routeZuHash } from '../route.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

interface Wahl {
  sachkonto: number | null
  buSchluessel: string | null
  buchungstext: string
}

export function SchrittKontieren({ d, fertig, gesperrt }: Schrittprops) {
  const { melde } = useApp()
  const b = d.beleg
  const konten = useLaden<Sachkontenantwort>('/sachkonten')
  // Gespeicherte Kontierung zeigen; sonst den Vorschlag (R12)
  const basis = b.kontierung && b.kontierung.zeilen.length === (d.kontierungsvorschlag?.zeilen.length ?? -1) ? b.kontierung : d.kontierungsvorschlag
  const [wahl, setWahl] = useState<Wahl[]>(() => (basis?.zeilen ?? []).map((z) => ({ sachkonto: z.sachkonto, buSchluessel: z.buSchluessel, buchungstext: z.buchungstext })))
  const [suche, setSuche] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)

  if (!basis) {
    return (
      <section className="karte">
        <h2>Kontieren</h2>
        <Hinweis>Ohne lesbare Rechnungsdaten lässt sich nicht kontieren.</Hinweis>
        <Schrittknoepfe id={b.id} zurueck="zuordnen" />
      </section>
    )
  }
  const summe = basis.zeilen.reduce((n, z) => n + z.bruttoCent, 0)
  const brutto = b.handerfassung?.bruttoCent ?? b.daten?.summen.bruttoCent ?? 0
  const lieferantName = d.lieferant?.name ?? d.lieferantenvorschlag?.neu.name ?? 'diesem Lieferanten'
  const liste = konten.daten ? sucheSachkonten(konten.daten.sachkonten, suche, konten.daten.zuletzt) : []

  const speichern = async () => {
    setFehler(null)
    setSendet(true)
    try {
      await api(`/belege/${b.id}/kontierung`, {
        methode: 'PUT',
        daten: { zeilen: basis.nurBeleg ? [] : wahl.map((w, i) => ({ sachkonto: w.sachkonto, buchungstext: w.buchungstext, ...(basis.zeilen[i].steuerfall === 'sonderfall' ? { buSchluessel: w.buSchluessel } : {}) })) },
      })
      melde('Kontierung gespeichert.')
      fertig('freigeben')
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSendet(false)
    }
  }

  const aendere = (i: number, w: Partial<Wahl>) => setWahl(wahl.map((alt, j) => (j === i ? { ...alt, ...w } : alt)))
  const buAnzeige = (z: Kontierungszeile, w: Wahl) => {
    const konto = konten.daten?.sachkonten.find((k) => k.nummer === w.sachkonto)
    if (konto?.automatikkonto) return 'leer (Automatikkonto)'
    if (z.steuerfall === 'sonderfall') return null
    return z.buSchluessel ?? 'leer'
  }

  return (
    <section className="karte" aria-labelledby="b5-titel">
      <h2 id="b5-titel">Kontieren</h2>
      {gesperrt && <Hinweis>{gesperrt}</Hinweis>}
      <Lernhinweis titel="Wofür war diese Ausgabe?">
        Je Steuersatz entsteht eine Buchungszeile. Das Sachkonto sagt, wofür das Geld ausgegeben wurde (z. B. Bürobedarf); der BU-Schlüssel sagt DATEV, welche Vorsteuer gilt. Bei Automatikkonten rechnet DATEV die Vorsteuer selbst, der Schlüssel bleibt leer.
      </Lernhinweis>
      <p>
        {basis.herkunft === 'historie' && basis.historieAnzahl > 0 ? `Vorschlag aus ${basis.historieAnzahl} früheren Rechnung${basis.historieAnzahl === 1 ? '' : 'en'} von ${lieferantName}.` : 'Noch keine Historie für diesen Lieferanten: Sachkonten bitte von Hand wählen.'}{' '}
        Buchung auf dem Kreditorenkonto im {basis.sollHaben === 'H' ? 'Haben (Rechnung)' : 'Soll (Gutschrift)'}.
      </p>
      {basis.manuellPruefen.length > 0 && (
        <Hinweis art="warnung" titel="Bitte prüfen">
          <ul>
            {basis.manuellPruefen.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </Hinweis>
      )}
      {basis.nurBeleg ? (
        <p>Dieser Beleg erzeugt keine Buchungszeile. Bestätigen Sie, dass er nur als Beleg an die Kanzlei geht.</p>
      ) : (
        <>
          {konten.laedt && !konten.daten && <Laden />}
          {konten.daten && konten.daten.sachkonten.length === 0 && (
            <Hinweis art="warnung">
              Der Kontenplan ist leer. Legen Sie zuerst Sachkonten an: <a href={routeZuHash({ seite: 'einstellungen', bereich: 'konten' })}>Einstellungen, Steuerschlüssel und Konten</a>.
            </Hinweis>
          )}
          <div className="feld feld-suche">
            <label htmlFor="konto-suche">Sachkonten filtern (Nummer oder Bezeichnung)</label>
            <input id="konto-suche" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} disabled={!!gesperrt} />
          </div>
          <table className="tabelle kontierung">
            <caption className="unsichtbar">Buchungszeilen</caption>
            <thead>
              <tr>
                <th scope="col">Zeile</th>
                <th scope="col" className="zahl">
                  Betrag
                </th>
                <th scope="col">Steuerfall</th>
                <th scope="col">Sachkonto</th>
                <th scope="col">BU-Schlüssel</th>
                <th scope="col">Buchungstext</th>
              </tr>
            </thead>
            <tbody>
              {basis.zeilen.map((z, i) => {
                const w = wahl[i]
                const bu = buAnzeige(z, w)
                const gewaehlt = konten.daten?.sachkonten.find((k) => k.nummer === w.sachkonto)
                return (
                  <tr key={i}>
                    <th scope="row">{i + 1}</th>
                    <td className="zahl">{betrag(z.bruttoCent)}</td>
                    <td>
                      {STEUERFALL_TEXT[z.steuerfall]}
                      <span className="block leise klein">
                        {z.steuerkategorie} {z.steuersatz} %
                      </span>
                    </td>
                    <td>
                      <select aria-label={`Sachkonto für Zeile ${i + 1}`} value={w.sachkonto ?? ''} disabled={!!gesperrt} onChange={(e) => aendere(i, { sachkonto: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">bitte wählen</option>
                        {gewaehlt && !liste.includes(gewaehlt) && (
                          <option value={gewaehlt.nummer}>
                            {gewaehlt.nummer} {gewaehlt.bezeichnung}
                          </option>
                        )}
                        {liste.map((k) => (
                          <option key={k.nummer} value={k.nummer}>
                            {k.nummer} {k.bezeichnung}
                            {k.automatikkonto ? ' (Automatik)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {bu === null ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          className="breite-schmal"
                          aria-label={`BU-Schlüssel für Zeile ${i + 1} (mit der Kanzlei abstimmen)`}
                          value={w.buSchluessel ?? ''}
                          disabled={!!gesperrt}
                          maxLength={4}
                          onChange={(e) => aendere(i, { buSchluessel: e.target.value.replace(/\D/g, '') || null })}
                        />
                      ) : (
                        bu
                      )}
                    </td>
                    <td>
                      <input type="text" aria-label={`Buchungstext für Zeile ${i + 1}`} maxLength={60} value={w.buchungstext} disabled={!!gesperrt} onChange={(e) => aendere(i, { buchungstext: e.target.value })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Summe</th>
                <td className="zahl">{betrag(summe)}</td>
                <td colSpan={4} className={summe === Math.abs(brutto) ? 'summe-ok' : 'summe-abweichung'}>
                  {summe === Math.abs(brutto) ? <>✓ gleich dem Bruttobetrag</> : <>! Bruttobetrag der Rechnung: {betrag(Math.abs(brutto))}</>}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      <Schrittknoepfe
        id={b.id}
        zurueck="zuordnen"
        weiter={gesperrt ? 'freigeben' : undefined}
        weiterText={gesperrt ? 'Weiter' : basis.nurBeleg ? 'Bestätigen und weiter' : 'Kontierung speichern und weiter'}
        weiterAktion={gesperrt ? undefined : sendet ? () => undefined : () => void speichern()}
      />
    </section>
  )
}
