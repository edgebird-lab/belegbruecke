/** Alle Belege mit Filter nach Status und Monat. */
import { useState } from 'react'
import type { Belegstatus } from '../../fach/typen.ts'
import { useLaden, type Belegzeile } from '../api.ts'
import { Feld, Hinweis, Laden, Seitentitel } from '../gemeinsam/Bausteine.tsx'
import { status } from '../kontext.ts'
import { Belegtabelle } from './Belegtabelle.tsx'

const STATUS: Belegstatus[] = ['eingegangen', 'geprueft', 'kontiert', 'freigegeben', 'exportiert', 'abgelehnt']

export function Belege() {
  const [filter, setFilter] = useState<{ status: Belegstatus | ''; monat: string }>({ status: '', monat: '' })
  const abfrage = new URLSearchParams()
  if (filter.status) abfrage.set('status', filter.status)
  if (/^\d{4}-\d{2}$/.test(filter.monat)) abfrage.set('monat', filter.monat)
  const liste = useLaden<{ belege: Belegzeile[] }>(`/belege${abfrage.size ? `?${abfrage}` : ''}`)
  return (
    <>
      <Seitentitel unter="Alle Belege, neueste zuerst">Belege</Seitentitel>
      <form className="filterleiste" role="search" aria-label="Belege filtern" onSubmit={(e) => e.preventDefault()}>
        <Feld label="Status">
          {(id) => (
            <select id={id} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as Belegstatus | '' })}>
              <option value="">alle</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {status(s)}
                </option>
              ))}
            </select>
          )}
        </Feld>
        <Feld label="Monat des Belegdatums">
          {(id) => <input id={id} type="month" value={filter.monat} onChange={(e) => setFilter({ ...filter, monat: e.target.value })} />}
        </Feld>
      </form>
      {liste.fehler && <Hinweis art="fehler">{liste.fehler}</Hinweis>}
      {!liste.daten && !liste.fehler && <Laden />}
      {liste.daten && liste.daten.belege.length === 0 && <p className="leise">Keine Belege für diesen Filter.</p>}
      {liste.daten && <Belegtabelle belege={liste.daten.belege} titel="Belege" />}
    </>
  )
}
