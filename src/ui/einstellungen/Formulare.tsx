/**
 * Formulare der Einstellungen, gemeinsam für den Einrichtungsassistenten (E1 bis E5) und die Seite
 * „Einstellungen“: Firma, Kanzlei, Steuerschlüssel, Kontenplan, Aufbewahrung.
 */
import { useState, type ChangeEvent } from 'react'
import { STEUERFALL_TEXT } from '../../fach/kontierung.ts'
import type { DatevEinstellungen, Einstellungen, Firma, Sachkonto, Steuerfall } from '../../fach/typen.ts'
import { api, fehlerText, useLaden, type Sachkontenantwort } from '../api.ts'
import { Auswahl, Feld, Haken, Hinweis, Laden, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { useApp } from '../kontext.ts'
import { STEUERFAELLE, type Fehlerliste } from './pruefen.ts'

const zahl = (t: string) => (t.trim() === '' ? Number.NaN : Number(t.replace(/\D/g, '')))

export function FirmaFormular({ wert, aendern, fehler }: { wert: Firma; aendern: (f: Firma) => void; fehler: Fehlerliste }) {
  const a = wert.anschrift
  return (
    <div className="formular">
      <Textfeld label="Wie heißt Ihre Firma genau so, wie sie auf Rechnungen an Sie steht?" wert={wert.name} aendern={(name) => aendern({ ...wert, name })} pflicht fehler={fehler.name} hilfe="Die Belegbrücke prüft bei jeder Rechnung, ob sie an Sie gerichtet ist (Empfängerprüfung)." />
      <Feld label="Weitere Schreibweisen" hilfe="Eine je Zeile, z. B. mit und ohne Rechtsform.">
        {(id, b) => (
          <textarea
            id={id}
            aria-describedby={b}
            rows={3}
            value={wert.namensVarianten.join('\n')}
            onChange={(e) =>
              aendern({
                ...wert,
                namensVarianten: e.target.value
                  .split('\n')
                  .map((z) => z.trimStart())
                  .slice(0, 20),
              })
            }
          />
        )}
      </Feld>
      <div className="feldreihe">
        <Textfeld label="Straße und Hausnummer" wert={a.zeile1 ?? ''} aendern={(zeile1) => aendern({ ...wert, anschrift: { ...a, zeile1 } })} autoComplete="street-address" />
        <Textfeld label="Postleitzahl" wert={a.plz ?? ''} aendern={(plz) => aendern({ ...wert, anschrift: { ...a, plz } })} autoComplete="postal-code" breite="schmal" />
        <Textfeld label="Ort" wert={a.ort ?? ''} aendern={(ort) => aendern({ ...wert, anschrift: { ...a, ort } })} pflicht fehler={fehler.ort} autoComplete="address-level2" />
        <Textfeld label="Land (ISO-Code)" wert={a.land ?? ''} aendern={(land) => aendern({ ...wert, anschrift: { ...a, land: land.toUpperCase().slice(0, 2) } })} pflicht fehler={fehler.land} breite="schmal" />
      </div>
      <div className="feldreihe">
        <Textfeld label="USt-IdNr." wert={wert.ustId ?? ''} aendern={(ustId) => aendern({ ...wert, ustId: ustId.replace(/\s/g, '').toUpperCase() })} fehler={fehler.ustId} placeholder="DE123456789" />
        <Textfeld label="Steuernummer" wert={wert.steuernummer ?? ''} aendern={(steuernummer) => aendern({ ...wert, steuernummer })} />
      </div>
      <Haken an={wert.kleinunternehmer} aendern={(kleinunternehmer) => aendern({ ...wert, kleinunternehmer })}>
        Meine Firma ist Kleinunternehmer (§ 19 UStG): keine Vorsteuer
      </Haken>
    </div>
  )
}

export function KanzleiFormular({ wert, aendern, fehler }: { wert: DatevEinstellungen; aendern: (d: DatevEinstellungen) => void; fehler: Fehlerliste }) {
  return (
    <div className="formular">
      <Hinweis>Diese Angaben stehen in jedem Schreiben Ihrer Kanzlei. Vorbelegt sind Testwerte; tragen Sie die echten Werte ein, sobald Sie sie kennen.</Hinweis>
      <div className="feldreihe">
        <Textfeld label="Beraternummer" inputMode="numeric" wert={Number.isNaN(wert.beraternummer) ? '' : String(wert.beraternummer)} aendern={(t) => aendern({ ...wert, beraternummer: zahl(t) })} fehler={fehler.beraternummer} pflicht />
        <Textfeld label="Mandantennummer" inputMode="numeric" wert={Number.isNaN(wert.mandantennummer) ? '' : String(wert.mandantennummer)} aendern={(t) => aendern({ ...wert, mandantennummer: zahl(t) })} fehler={fehler.mandantennummer} pflicht />
        <Textfeld label="Beginn des Wirtschaftsjahrs (MM-TT)" wert={wert.wjBeginnMonatTag} aendern={(wjBeginnMonatTag) => aendern({ ...wert, wjBeginnMonatTag })} fehler={fehler.wj} breite="schmal" />
        <Feld label="Sachkontenlänge">
          {(id) => (
            <select id={id} value={wert.sachkontenlaenge} onChange={(e) => aendern({ ...wert, sachkontenlaenge: Number(e.target.value) })}>
              {[4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n} Stellen
                </option>
              ))}
            </select>
          )}
        </Feld>
      </div>
      <Auswahl
        label="Kontenrahmen"
        wert={wert.kontenrahmen}
        aendern={(kontenrahmen) => aendern({ ...wert, kontenrahmen })}
        optionen={[
          { wert: 'SKR03', text: 'SKR 03' },
          { wert: 'SKR04', text: 'SKR 04' },
        ]}
      />
      <div className="feldreihe">
        <Textfeld label="Kreditorenkonten von" inputMode="numeric" wert={Number.isNaN(wert.kreditorenVon) ? '' : String(wert.kreditorenVon)} aendern={(t) => aendern({ ...wert, kreditorenVon: zahl(t) })} fehler={fehler.kreditorenVon} />
        <Textfeld label="Kreditorenkonten bis" inputMode="numeric" wert={Number.isNaN(wert.kreditorenBis) ? '' : String(wert.kreditorenBis)} aendern={(t) => aendern({ ...wert, kreditorenBis: zahl(t) })} fehler={fehler.kreditorenBis} />
      </div>
      <Auswahl
        label="Was soll die Kanzlei bekommen?"
        wert={wert.exportmodus}
        aendern={(exportmodus) => aendern({ ...wert, exportmodus })}
        optionen={[
          { wert: 'buchungsstapel-und-belege', text: 'Buchungsstapel und Belege', beschreibung: 'EXTF-Datei mit Kreditorenbuchungen und ein ZIP mit den Belegen' },
          { wert: 'nur-belege', text: 'Nur Belege', beschreibung: 'ZIP mit den Belegen; die Kanzlei bucht selbst' },
        ]}
      />
      <Textfeld label="Exportiert von (Feld im Buchungsstapel)" wert={wert.exportiertVon} aendern={(exportiertVon) => aendern({ ...wert, exportiertVon })} fehler={fehler.exportiertVon} maxLength={25} />
    </div>
  )
}

/** E3: BU-Schlüssel je Steuerfall; leer nur bewusst (Häkchen), Sonderfall immer von Hand je Beleg. */
export function SteuerschluesselFormular({
  wert,
  aendern,
  bewusstLeer,
  setBewusstLeer,
}: {
  wert: DatevEinstellungen['buSchluessel']
  aendern: (w: DatevEinstellungen['buSchluessel']) => void
  bewusstLeer: Record<Steuerfall, boolean>
  setBewusstLeer: (w: Record<Steuerfall, boolean>) => void
}) {
  return (
    <div className="formular">
      <Hinweis art="warnung" titel="Mit der Kanzlei abstimmen">
        Vorbelegt sind BU 9 (Vorsteuer 19 %) und BU 8 (Vorsteuer 7 %), verbreitete DATEV-Praxis, aber noch nicht bestätigt. Fragen Sie Ihre Kanzlei, welche Schlüssel gelten und welche Sachkonten Automatikkonten sind.
      </Hinweis>
      <table className="tabelle">
        <caption className="unsichtbar">BU-Schlüssel je Steuerfall</caption>
        <thead>
          <tr>
            <th scope="col">Steuerfall</th>
            <th scope="col">BU-Schlüssel</th>
            <th scope="col">Leer lassen</th>
          </tr>
        </thead>
        <tbody>
          {STEUERFAELLE.map((f) => (
            <tr key={f}>
              <th scope="row">{STEUERFALL_TEXT[f]}</th>
              <td>
                <input
                  type="text"
                  inputMode="numeric"
                  className="breite-schmal"
                  aria-label={`BU-Schlüssel für ${STEUERFALL_TEXT[f]}`}
                  value={wert[f] ?? ''}
                  maxLength={4}
                  onChange={(e) => {
                    const t = e.target.value.replace(/\D/g, '').slice(0, 4)
                    aendern({ ...wert, [f]: t === '' ? null : t })
                  }}
                />
              </td>
              <td>
                {f === 'sonderfall' ? (
                  <span className="leise">wird je Beleg von Hand gewählt</span>
                ) : (
                  <Haken an={bewusstLeer[f] && !wert[f]} aendern={(an) => setBewusstLeer({ ...bewusstLeer, [f]: an })}>
                    bewusst leer
                  </Haken>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Kontenplan von Hand und als CSV (Schritt 4.1); speichert sofort über die API. */
export function Kontenplan() {
  const { melde } = useApp()
  const konten = useLaden<Sachkontenantwort>('/sachkonten')
  const [neu, setNeu] = useState({ nummer: '', bezeichnung: '', automatikkonto: false })
  const [fehler, setFehler] = useState<string | null>(null)
  const [importFehler, setImportFehler] = useState<string[]>([])

  const speichern = async (k: Sachkonto) => {
    setFehler(null)
    try {
      await api('/sachkonten', { methode: 'PUT', daten: k })
      konten.neu()
      return true
    } catch (e) {
      setFehler(fehlerText(e))
      return false
    }
  }

  const hinzufuegen = async () => {
    const nummer = Number(neu.nummer)
    if (!Number.isSafeInteger(nummer) || nummer <= 0 || !neu.bezeichnung.trim()) {
      setFehler('Kontonummer und Bezeichnung angeben.')
      return
    }
    if (await speichern({ nummer, bezeichnung: neu.bezeichnung.trim(), automatikkonto: neu.automatikkonto, aktiv: true })) {
      melde(`Sachkonto ${nummer} gespeichert.`)
      setNeu({ nummer: '', bezeichnung: '', automatikkonto: false })
    }
  }

  const csvGewaehlt = async (e: ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0]
    e.target.value = ''
    if (!datei) return
    setFehler(null)
    try {
      const r = await api<{ uebernommen: number; neu: number; geaendert: number; fehler: string[] }>('/sachkonten', { daten: { csv: await datei.text() } })
      setImportFehler(r.fehler)
      melde(`${r.uebernommen} Konten übernommen (${r.neu} neu, ${r.geaendert} geändert).`)
      konten.neu()
    } catch (x) {
      setFehler(fehlerText(x))
    }
  }

  return (
    <section className="unterabschnitt" aria-labelledby="kontenplan-titel">
      <h3 id="kontenplan-titel">Kontenplan (Sachkonten)</h3>
      <p className="leise">Sachkonten, auf die Sie Ihre Ausgaben buchen. Automatikkonten rechnen die Vorsteuer selbst; dann bleibt der BU-Schlüssel leer.</p>
      {konten.laedt && !konten.daten && <Laden />}
      {konten.daten && konten.daten.sachkonten.length === 0 && <p>Noch keine Sachkonten. Legen Sie sie unten an oder laden Sie eine CSV-Datei.</p>}
      {konten.daten && konten.daten.sachkonten.length > 0 && (
        <table className="tabelle">
          <caption className="unsichtbar">Sachkonten</caption>
          <thead>
            <tr>
              <th scope="col">Konto</th>
              <th scope="col">Bezeichnung</th>
              <th scope="col">Automatikkonto</th>
              <th scope="col">Aktiv</th>
            </tr>
          </thead>
          <tbody>
            {konten.daten.sachkonten.map((k) => (
              <tr key={k.nummer} className={k.aktiv ? undefined : 'inaktiv'}>
                <td className="zahl">{k.nummer}</td>
                <td>{k.bezeichnung}</td>
                <td>
                  <input type="checkbox" aria-label={`Konto ${k.nummer} ist Automatikkonto`} checked={k.automatikkonto} onChange={(e) => void speichern({ ...k, automatikkonto: e.target.checked })} />
                </td>
                <td>
                  <input type="checkbox" aria-label={`Konto ${k.nummer} ist aktiv`} checked={k.aktiv} onChange={(e) => void speichern({ ...k, aktiv: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <fieldset className="inline-formular">
        <legend>Sachkonto hinzufügen</legend>
        <Textfeld label="Kontonummer" inputMode="numeric" wert={neu.nummer} aendern={(nummer) => setNeu({ ...neu, nummer: nummer.replace(/\D/g, '') })} breite="schmal" />
        <Textfeld label="Bezeichnung" wert={neu.bezeichnung} aendern={(bezeichnung) => setNeu({ ...neu, bezeichnung })} />
        <Haken an={neu.automatikkonto} aendern={(automatikkonto) => setNeu({ ...neu, automatikkonto })}>
          Automatikkonto
        </Haken>
        <button type="button" className="knopf" onClick={() => void hinzufuegen()}>
          Konto speichern
        </button>
      </fieldset>
      <div className="knopfreihe">
        <label className="knopf">
          CSV-Datei laden …
          <input type="file" accept=".csv,text/csv,text/plain" className="unsichtbar" onChange={(e) => void csvGewaehlt(e)} />
        </label>
        <span className="leise klein">Spalten: Konto; Bezeichnung; Automatik (ja/nein). Eine Kopfzeile ist erlaubt.</span>
      </div>
      {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
      {importFehler.length > 0 && (
        <Hinweis art="warnung" titel="Nicht übernommene Zeilen">
          <ul>
            {importFehler.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Hinweis>
      )}
    </section>
  )
}

/** E5: Regel, Quelle, Speicherort, Sicherung und Haftungshinweis. */
export function AufbewahrungInfo({ einstellungen, datenOrdner }: { einstellungen: Einstellungen; datenOrdner: string | null }) {
  const r = einstellungen.aufbewahrung
  return (
    <div className="formular">
      <dl className="eckdaten">
        <dt>Regel</dt>
        <dd>
          {r.jahre} Jahre ab Ende des Kalenderjahrs (spätestes Jahr aus Rechnungs-, Eingangs- und Freigabedatum)
        </dd>
        <dt>Rechtsgrundlage</dt>
        <dd>{r.rechtsgrundlage}</dd>
        <dt>Löschen</dt>
        <dd>Version 0.1 löscht nie. Die Frist läuft nicht ab, solange die Festsetzungsfrist offen ist (§ 147 Abs. 3 AO).</dd>
        <dt>Speicherort</dt>
        <dd>
          <code>{datenOrdner ?? 'daten/'}</code> auf diesem Rechner: Originale schreibgeschützt nach SHA-256, Prüfberichte, Datenbank mit Protokoll und Hashkette.
        </dd>
        <dt>Sicherung</dt>
        <dd>
          Täglich eine Kopie der Datenbank unter <code>sicherung/</code>. Sichern Sie den ganzen Datenordner zusätzlich regelmäßig auf ein anderes Gerät.
        </dd>
      </dl>
      <Hinweis art="warnung" titel="Haftungshinweis">
        Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a). Keine Steuer- oder Rechtsberatung. Software allein macht kein Verfahren GoBD-konform; dazu gehören Verfahrensdokumentation, Zugriffsregeln und Sicherung.
      </Hinweis>
    </div>
  )
}
