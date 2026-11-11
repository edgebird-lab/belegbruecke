/**
 * Beleg-Assistent B1 bis B6 (Spezifikation 5.3): Schrittleiste oben wie beim Prozesslotsen. Bei einer
 * sonstigen Rechnung ersetzt die Erfassung von Hand den Schritt „Ansehen“ (R16).
 */
import { dubletteSperrt } from '../../fach/dubletten.ts'
import { kontierungVollstaendig } from '../../fach/kontierung.ts'
import type { Beleg } from '../../fach/typen.ts'
import { useLaden, type Belegdetail } from '../api.ts'
import { AmpelAnzeige, Hinweis, Laden, Schrittleiste, Seitentitel, Statusmarke, type Schritt } from '../gemeinsam/Bausteine.tsx'
import { betrag, useApp } from '../kontext.ts'
import type { Belegschritt } from '../route.ts'
import type { Schrittprops } from './gemeinsam.tsx'
import { SchrittAnsehen } from './SchrittAnsehen.tsx'
import { SchrittEingang } from './SchrittEingang.tsx'
import { SchrittErfassen } from './SchrittErfassen.tsx'
import { SchrittFreigeben } from './SchrittFreigeben.tsx'
import { SchrittKontieren } from './SchrittKontieren.tsx'
import { SchrittPruefen } from './SchrittPruefen.tsx'
import { SchrittZuordnen } from './SchrittZuordnen.tsx'


function standardSchritt(b: Beleg): Belegschritt {
  if (b.status === 'eingegangen') return b.format.belegart === 'sonstige-rechnung' ? 'ansehen' : 'pruefen'
  if (b.status === 'geprueft') return 'pruefen'
  return 'freigeben'
}

function sperrgrund(b: Beleg): string | null {
  if (b.status === 'exportiert') return 'Der Beleg ist an die Kanzlei übergeben und lässt sich nicht mehr ändern.'
  if (b.status === 'freigegeben') return 'Der Beleg ist freigegeben; Daten und Kontierung sind eingefroren. Ändern geht nur über „Freigabe zurücknehmen“ im Schritt „Freigeben“.'
  if (b.status === 'abgelehnt') return 'Der Beleg ist abgelehnt. Heben Sie die Ablehnung im Schritt „Freigeben“ auf, um ihn weiter zu bearbeiten.'
  return null
}

export function BelegAssistent({ id, schritt }: { id: string; schritt: Belegschritt | null }) {
  const { gehe, aktualisiereZaehler } = useApp()
  const detail = useLaden<Belegdetail>(`/belege/${id}`)
  if (detail.fehler && !detail.daten) {
    return (
      <>
        <Seitentitel>Beleg</Seitentitel>
        <Hinweis art="fehler">{detail.fehler}</Hinweis>
      </>
    )
  }
  if (!detail.daten) return <Laden />
  const d = detail.daten
  const b = d.beleg
  const z = d.zusammenfassung
  const sonstig = b.format.belegart === 'sonstige-rechnung'
  const aktiv = schritt ?? standardSchritt(b)
  const erfasst = !sonstig || b.handerfassung !== null
  const dubletteOffen = dubletteSperrt(b.dubletten, b.dublettenEntscheidung !== null)
  const schritte: Schritt<Belegschritt>[] = [
    { id: 'eingang', titel: 'Eingang', fertig: true },
    { id: 'pruefen', titel: 'Prüfen', fertig: b.pruefung !== null },
    { id: 'ansehen', titel: sonstig ? 'Erfassen' : 'Ansehen', fertig: erfasst },
    { id: 'zuordnen', titel: 'Zuordnen', fertig: b.lieferantId !== null && !dubletteOffen, gesperrt: !erfasst },
    { id: 'kontieren', titel: 'Kontieren', fertig: kontierungVollstaendig(b.kontierung), gesperrt: !erfasst || b.lieferantId === null },
    { id: 'freigeben', titel: 'Freigeben', fertig: b.status === 'freigegeben' || b.status === 'exportiert' },
  ]
  // Erst neu laden, dann den Schritt wechseln: so beginnt der nächste Schritt mit den neuen Daten
  const fertig = async (naechster?: Belegschritt) => {
    await detail.neu()
    aktualisiereZaehler()
    if (naechster) gehe({ seite: 'beleg', id, schritt: naechster })
  }
  const props: Schrittprops = { d, fertig, gesperrt: sperrgrund(b) }
  // Nach dem Neuladen beginnen die Schritte mit den neuen Daten (z. B. Vorschlag aus der Historie)
  const stand = JSON.stringify([b.status, b.lieferantId, b.kontierung, b.handerfassung, b.dublettenEntscheidung, d.kontierungsvorschlag, d.kreditorVorschlag])
  const titelText = z.lieferant ? `${z.belegnummer} · ${z.lieferant}` : z.belegnummer
  return (
    <div className="assistent">
      <Seitentitel
        unter={
          <>
            {z.rechnungsnummer ? `Rechnung ${z.rechnungsnummer}` : z.dateiname}
            {z.bruttoCent !== null && ` · ${betrag(z.bruttoCent, z.waehrung)}`} · <AmpelAnzeige ampel={z.ampel} /> · <Statusmarke wert={b.status} />
          </>
        }
      >
        {titelText}
      </Seitentitel>
      <Schrittleiste label="Schritte des Belegs" schritte={schritte} aktiv={aktiv} waehlen={(s) => gehe({ seite: 'beleg', id, schritt: s })} />
      {aktiv === 'eingang' && <SchrittEingang key={stand} {...props} />}
      {aktiv === 'pruefen' && <SchrittPruefen key={stand} {...props} />}
      {aktiv === 'ansehen' && (sonstig ? <SchrittErfassen key={stand} {...props} /> : <SchrittAnsehen key={stand} {...props} />)}
      {aktiv === 'zuordnen' && <SchrittZuordnen key={stand} {...props} />}
      {aktiv === 'kontieren' && <SchrittKontieren key={stand} {...props} />}
      {aktiv === 'freigeben' && <SchrittFreigeben key={stand} {...props} />}
    </div>
  )
}
