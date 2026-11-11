/** E4 Eingang: nur Upload oder zusätzlich ein Postfach (das Postfach folgt in Phase 5). */
import { useEffect } from 'react'
import type { Einstellungen } from '../../fach/typen.ts'
import { Hinweis } from '../gemeinsam/Bausteine.tsx'

export function EingangFormular({ entwurf, aendern, setBereit }: { entwurf: Einstellungen; aendern: (e: Einstellungen) => void; setBereit: (ok: boolean) => void }) {
  useEffect(() => {
    setBereit(true)
    if (entwurf.postfach.aktiv) aendern({ ...entwurf, postfach: { ...entwurf.postfach, aktiv: false } })
  }, [entwurf, aendern, setBereit])
  return (
    <div className="formular">
      <p>Rechnungen kommen per Upload in die Belegbrücke: Dateien in den Eingang ziehen oder auswählen (XML, PDF, JPG, PNG; mehrere auf einmal).</p>
      <Hinweis>Der Abruf aus einem E-Mail-Postfach folgt in einer späteren Version.</Hinweis>
    </div>
  )
}
