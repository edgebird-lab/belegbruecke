/** Gemeinsames der Schritte des Beleg-Assistenten. */
import type { Belegdetail } from '../api.ts'
import { useApp } from '../kontext.ts'
import type { Belegschritt } from '../route.ts'

export interface Schrittprops {
  d: Belegdetail
  /** nach einer Änderung: Daten neu laden und zum Schritt wechseln */
  fertig: (naechster?: Belegschritt) => Promise<void>
  /** Änderungen sind gesperrt (freigegeben, exportiert, abgelehnt) */
  gesperrt: string | null
}

/** „Zurück“ und „Weiter“ unter einem Schritt. */
export function Schrittknoepfe({ id, zurueck, weiter, weiterText = 'Weiter', weiterAktion }: { id: string; zurueck?: Belegschritt; weiter?: Belegschritt; weiterText?: string; weiterAktion?: () => void }) {
  const { gehe } = useApp()
  return (
    <div className="knopfreihe schrittknoepfe">
      {zurueck && (
        <button type="button" className="knopf" onClick={() => gehe({ seite: 'beleg', id, schritt: zurueck })}>
          Zurück
        </button>
      )}
      {(weiter || weiterAktion) && (
        <button type="button" className="knopf knopf-haupt" onClick={weiterAktion ?? (() => gehe({ seite: 'beleg', id, schritt: weiter! }))}>
          {weiterText}
        </button>
      )}
    </div>
  )
}
