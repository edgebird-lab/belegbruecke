/**
 * B3 bei sonstigen Rechnungen: Erfassung von Hand (R16), links PDF oder Bild, rechts das Formular.
 * Ausgelesene Daten (z. B. ZUGFeRD MINIMUM) dienen als Vorschlag.
 */
import { useState } from 'react'
import { steuerAusSatz } from '../../fach/betrag.ts'
import type { Handerfassung } from '../../fach/typen.ts'
import { api, fehlerText } from '../api.ts'
import { Betragsfeld, Feld, Hinweis, Lernhinweis, Textfeld } from '../gemeinsam/Bausteine.tsx'
import { betrag, useApp } from '../kontext.ts'
import { Schrittknoepfe, type Schrittprops } from './gemeinsam.tsx'

type Zeile = { kategorie: 'S' | 'E' | 'AE'; satz: string; bemessungCent: number | null; steuerCent: number | null }

function vorschlag(d: Schrittprops['d']): { kopf: Omit<Handerfassung, 'steuern' | 'bruttoCent'>; zeilen: Zeile[]; brutto: number | null } {
  const h = d.beleg.handerfassung
  if (h) return { kopf: h, zeilen: h.steuern, brutto: h.bruttoCent }
  const r = d.beleg.daten
  return {
    kopf: {
      lieferantName: r?.verkaeufer.name ?? '',
      lieferantUstId: r?.verkaeufer.ustId ?? null,
      lieferantSteuernummer: r?.verkaeufer.steuernummer ?? null,
      rechnungsnummer: r?.rechnungsnummer ?? '',
      rechnungsdatum: r?.rechnungsdatum ?? '',
      leistungsdatum: r?.lieferdatum ?? null,
    },
    zeilen: r?.steuern.length
      ? r.steuern.map((s) => ({ kategorie: s.kategorie === 'E' || s.kategorie === 'AE' ? s.kategorie : 'S', satz: s.satz || '19', bemessungCent: s.bemessungCent, steuerCent: s.steuerCent }))
      : [{ kategorie: 'S', satz: '19', bemessungCent: null, steuerCent: null }],
    brutto: r?.summen.bruttoCent ?? null,
  }
}

export function SchrittErfassen({ d, fertig, gesperrt }: Schrittprops) {
  const { melde } = useApp()
  const b = d.beleg
  const start = vorschlag(d)
  const [kopf, setKopf] = useState(start.kopf)
  const [zeilen, setZeilen] = useState<Zeile[]>(start.zeilen)
  const [brutto, setBrutto] = useState<number | null>(start.brutto)
  const [fehler, setFehler] = useState<string | null>(null)
  const [sendet, setSendet] = useState(false)
  const summe = zeilen.reduce((n, z) => n + (z.bemessungCent ?? 0) + (z.steuerCent ?? 0), 0)
  const bild = b.original.mimeTyp.startsWith('image/')

  const aendereZeile = (i: number, z: Partial<Zeile>) => setZeilen(zeilen.map((alt, j) => (j === i ? { ...alt, ...z } : alt)))

  const speichern = async () => {
    setFehler(null)
    if (zeilen.some((z) => z.bemessungCent === null || z.steuerCent === null) || brutto === null) {
      setFehler('Bitte alle Beträge ausfüllen (z. B. 0,00 bei steuerfreien Zeilen).')
      return
    }
    const h: Handerfassung = {
      lieferantName: kopf.lieferantName.trim(),
      lieferantUstId: kopf.lieferantUstId?.replace(/\s/g, '').toUpperCase() || null,
      lieferantSteuernummer: kopf.lieferantSteuernummer?.trim() || null,
      rechnungsnummer: kopf.rechnungsnummer.trim(),
      rechnungsdatum: kopf.rechnungsdatum,
      leistungsdatum: kopf.leistungsdatum || null,
      steuern: zeilen.map((z) => ({ kategorie: z.kategorie, satz: z.kategorie === 'S' ? z.satz.replace(',', '.') : '0', bemessungCent: z.bemessungCent!, steuerCent: z.steuerCent! })),
      bruttoCent: brutto,
    }
    setSendet(true)
    try {
      await api(`/belege/${b.id}/handerfassung`, { methode: 'PUT', daten: h })
      melde('Rechnungsdaten gespeichert und geprüft.')
      await fertig('pruefen')
    } catch (e) {
      setFehler(fehlerText(e))
    } finally {
      setSendet(false)
    }
  }

  return (
    <section className="karte" aria-labelledby="b3h-titel">
      <h2 id="b3h-titel">Rechnung von Hand erfassen</h2>
      <Lernhinweis titel="Sonstige Rechnung">
        Diese Datei ist keine E-Rechnung (z. B. PDF ohne eingebettete XML-Datei oder ein Foto). Übertragen Sie die Angaben von der Rechnung. Das Original bleibt unverändert im Archiv; die erfassten Werte stehen im Beleg und im Protokoll.
      </Lernhinweis>
      {gesperrt && <Hinweis>{gesperrt}</Hinweis>}
      <div className="ansicht-raster">
        <div className="ansicht-links">{bild ? <img className="beleg-bild" src={`/api/belege/${b.id}/original?anzeige=1`} alt={`Bild des Belegs ${d.zusammenfassung.belegnummer}`} /> : <iframe className="ansicht-rahmen" title="PDF des Belegs" src={`/api/belege/${b.id}/original?anzeige=1`} />}</div>
        <div className="ansicht-rechts">
          <fieldset className="formular" disabled={!!gesperrt}>
            <legend className="unsichtbar">Rechnungsdaten</legend>
            <Textfeld label="Lieferant" wert={kopf.lieferantName} aendern={(lieferantName) => setKopf({ ...kopf, lieferantName })} pflicht />
            <div className="feldreihe">
              <Textfeld label="USt-IdNr. des Lieferanten" wert={kopf.lieferantUstId ?? ''} aendern={(v) => setKopf({ ...kopf, lieferantUstId: v || null })} />
              <Textfeld label="Steuernummer des Lieferanten" wert={kopf.lieferantSteuernummer ?? ''} aendern={(v) => setKopf({ ...kopf, lieferantSteuernummer: v || null })} />
            </div>
            <div className="feldreihe">
              <Textfeld label="Rechnungsnummer" wert={kopf.rechnungsnummer} aendern={(rechnungsnummer) => setKopf({ ...kopf, rechnungsnummer })} pflicht />
              <Textfeld label="Rechnungsdatum" typ="date" wert={kopf.rechnungsdatum} aendern={(rechnungsdatum) => setKopf({ ...kopf, rechnungsdatum })} pflicht />
              <Textfeld label="Leistungsdatum" typ="date" wert={kopf.leistungsdatum ?? ''} aendern={(v) => setKopf({ ...kopf, leistungsdatum: v || null })} />
            </div>
            {/* Je Steuerzeile ein Block statt einer Tabelle: In der rechten Spalte neben der PDF war die Tabelle
                breiter als der Platz (bei 1280 px schob sie die Seite seitlich, die Kategorie war abgeschnitten). */}
            <h3 className="steuerzeilen-titel">Steuerzeilen</h3>
            {zeilen.map((z, i) => (
              <fieldset key={i} className="steuerzeile">
                <legend>Zeile {i + 1}</legend>
                <div className="steuerzeile-felder">
                  <Feld label="Kategorie">
                    {(id) => (
                      <select id={id} aria-label={`Kategorie Zeile ${i + 1}`} value={z.kategorie} onChange={(e) => aendereZeile(i, { kategorie: e.target.value as Zeile['kategorie'], ...(e.target.value !== 'S' ? { steuerCent: 0 } : {}) })}>
                        <option value="S">Normal (S)</option>
                        <option value="E">steuerfrei (E)</option>
                        <option value="AE">Reverse Charge (AE)</option>
                      </select>
                    )}
                  </Feld>
                  <Feld label="Steuersatz">
                    {(id) => (
                      <span className="betrag-eingabe">
                        <input id={id} type="text" inputMode="decimal" aria-label={`Steuersatz Zeile ${i + 1}`} disabled={z.kategorie !== 'S'} value={z.kategorie === 'S' ? z.satz : '0'} onChange={(e) => aendereZeile(i, { satz: e.target.value })} />
                        <span aria-hidden="true">%</span>
                      </span>
                    )}
                  </Feld>
                  <Betragsfeld label="Netto" ariaLabel={`Netto Zeile ${i + 1}`} cent={z.bemessungCent} aendern={(c) => aendereZeile(i, { bemessungCent: c })} />
                  <Betragsfeld label="Steuer" ariaLabel={`Steuer Zeile ${i + 1}`} cent={z.steuerCent} aendern={(c) => aendereZeile(i, { steuerCent: c })} />
                </div>
                <div className="knopfreihe">
                  <button
                    type="button"
                    className="knopf knopf-klein"
                    disabled={z.kategorie !== 'S' || z.bemessungCent === null}
                    onClick={() => aendereZeile(i, { steuerCent: steuerAusSatz(z.bemessungCent ?? 0, z.satz.replace(',', '.')) })}
                    aria-label={`Steuer berechnen (Zeile ${i + 1})`}
                  >
                    Steuer berechnen
                  </button>
                  {zeilen.length > 1 && (
                    <button type="button" className="knopf knopf-klein knopf-gefahr" onClick={() => setZeilen(zeilen.filter((_, j) => j !== i))}>
                      Zeile {i + 1} entfernen
                    </button>
                  )}
                </div>
              </fieldset>
            ))}
            <div className="knopfreihe">
              <button type="button" className="knopf knopf-klein" onClick={() => setZeilen([...zeilen, { kategorie: 'S', satz: '7', bemessungCent: null, steuerCent: null }])}>
                Steuerzeile hinzufügen
              </button>
            </div>
            <Betragsfeld label="Bruttobetrag" cent={brutto} aendern={setBrutto} hilfe={`Summe der Zeilen: ${betrag(summe)}${brutto !== null && brutto !== summe ? ' – stimmt noch nicht mit dem Bruttobetrag überein' : ''}`} />
            <div className="knopfreihe">
              <button type="button" className="knopf knopf-klein" onClick={() => setBrutto(summe)}>
                Summe als Brutto übernehmen
              </button>
            </div>
          </fieldset>
          {fehler && <Hinweis art="fehler">{fehler}</Hinweis>}
        </div>
      </div>
      <Schrittknoepfe id={b.id} zurueck="pruefen" weiter={gesperrt ? 'zuordnen' : undefined} weiterText={gesperrt ? 'Weiter' : 'Speichern und prüfen'} weiterAktion={gesperrt ? undefined : sendet ? () => undefined : () => void speichern()} />
    </section>
  )
}
