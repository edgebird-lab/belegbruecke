/** Bausteine der Oberfläche: beschriftete Felder, Betragsfeld, Schalter, Ampel, Schrittleiste, Hinweise. */
import { useId, useState, type ReactNode } from 'react'
import { centAlsDezimal, leseBetragEingabe } from '../../fach/betrag.ts'
import type { Ampel } from '../../fach/pruefbericht.ts'
import type { Belegstatus } from '../../fach/typen.ts'
import { status, useApp } from '../kontext.ts'

/** Beschriftetes Feld; `children` erhält die Kennung für das Eingabeelement. */
export function Feld({ label, hilfe, fehler, children }: { label: ReactNode; hilfe?: ReactNode; fehler?: string | null; children: (id: string, beschreibung: string | undefined) => ReactNode }) {
  const id = useId()
  const hilfeId = `${id}-hilfe`
  const fehlerId = `${id}-fehler`
  const beschreibung = [hilfe ? hilfeId : null, fehler ? fehlerId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={`feld${fehler ? ' feld-fehler' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id, beschreibung)}
      {hilfe && (
        <p className="feld-hilfe" id={hilfeId}>
          {hilfe}
        </p>
      )}
      {fehler && (
        <p className="feld-meldung" id={fehlerId}>
          {fehler}
        </p>
      )}
    </div>
  )
}

/** Textfeld mit Beschriftung. */
export function Textfeld({
  label,
  wert,
  aendern,
  hilfe,
  fehler,
  typ = 'text',
  pflicht,
  breite,
  ...rest
}: {
  label: ReactNode
  wert: string
  aendern: (w: string) => void
  hilfe?: ReactNode
  fehler?: string | null
  typ?: 'text' | 'password' | 'date' | 'month' | 'email' | 'number' | 'search'
  pflicht?: boolean
  breite?: 'schmal' | 'mittel'
  autoComplete?: string
  inputMode?: 'numeric' | 'decimal' | 'text'
  maxLength?: number
  placeholder?: string
  name?: string
}) {
  return (
    <Feld label={pflicht ? <>{label} <span className="pflicht">(Pflicht)</span></> : label} hilfe={hilfe} fehler={fehler}>
      {(id, beschreibung) => (
        <input
          id={id}
          type={typ}
          value={wert}
          onChange={(e) => aendern(e.target.value)}
          aria-describedby={beschreibung}
          aria-invalid={fehler ? true : undefined}
          required={pflicht}
          className={breite ? `breite-${breite}` : undefined}
          {...rest}
        />
      )}
    </Feld>
  )
}

/** Betrag in Cent mit deutscher Eingabe („1.234,56“); zeigt beim Tippen den eigenen Text. */
export function Betragsfeld({ label, cent, aendern, hilfe, fehler, ariaLabel }: { label?: ReactNode; cent: number | null; aendern: (c: number | null) => void; hilfe?: ReactNode; fehler?: string | null; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null)
  const anzeige = cent === null ? '' : centAlsDezimal(cent).replace('.', ',')
  const eingabe = (id?: string, beschreibung?: string) => (
    <span className="betrag-eingabe">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        aria-describedby={beschreibung}
        value={text ?? anzeige}
        onFocus={() => setText(anzeige)}
        onBlur={() => setText(null)}
        onChange={(e) => {
          setText(e.target.value)
          aendern(e.target.value.trim() === '' ? null : leseBetragEingabe(e.target.value))
        }}
      />
      <span aria-hidden="true">€</span>
    </span>
  )
  if (!label) return eingabe()
  return (
    <Feld label={label} hilfe={hilfe} fehler={fehler}>
      {(id, beschreibung) => eingabe(id, beschreibung)}
    </Feld>
  )
}

export function Schalter({ an, aendern, children }: { an: boolean; aendern: (an: boolean) => void; children: ReactNode }) {
  return (
    <label className="schalter">
      <input type="checkbox" role="switch" checked={an} onChange={(e) => aendern(e.target.checked)} />
      <span className="schalter-spur" aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

export function Haken({ an, aendern, children, beschreibung }: { an: boolean; aendern: (an: boolean) => void; children: ReactNode; beschreibung?: string }) {
  return (
    <label className="haken">
      <input type="checkbox" checked={an} onChange={(e) => aendern(e.target.checked)} aria-describedby={beschreibung} />
      <span>{children}</span>
    </label>
  )
}

export interface Option<T extends string> {
  wert: T
  text: string
  beschreibung?: string
}

/** Auswahl als Gruppe von Optionsfeldern. */
export function Auswahl<T extends string>({ label, wert, optionen, aendern }: { label: string; wert: T; optionen: Option<T>[]; aendern: (w: T) => void }) {
  const name = useId()
  return (
    <fieldset className="auswahl">
      <legend>{label}</legend>
      {optionen.map((o) => (
        <label key={o.wert} className={`auswahl-option${wert === o.wert ? ' an' : ''}`}>
          <input type="radio" name={name} value={o.wert} checked={wert === o.wert} onChange={() => aendern(o.wert)} />
          <span>
            {o.text}
            {o.beschreibung && <small>{o.beschreibung}</small>}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Ampel nie nur über Farbe: Symbol und Text (Spezifikation 5.1). */
export function AmpelAnzeige({ ampel, gross }: { ampel: Ampel; gross?: boolean }) {
  return (
    <span className={`ampel ampel-${ampel.farbe}${gross ? ' ampel-gross' : ''}`}>
      <span aria-hidden="true" className="ampel-symbol">
        {ampel.symbol}
      </span>
      {ampel.text}
    </span>
  )
}

export function Statusmarke({ wert }: { wert: Belegstatus }) {
  return <span className={`statusmarke status-${wert}`}>{status(wert)}</span>
}

export interface Schritt<T extends string> {
  id: T
  titel: string
  /** erledigt (Häkchen) */
  fertig?: boolean
  gesperrt?: boolean
}

/** Schrittleiste wie beim Prozesslotsen; der aktuelle Schritt trägt aria-current="step". */
export function Schrittleiste<T extends string>({ schritte, aktiv, waehlen, label }: { schritte: Schritt<T>[]; aktiv: T; waehlen: (s: T) => void; label: string }) {
  return (
    <nav className="schrittleiste" aria-label={label}>
      <ol>
        {schritte.map((s, i) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === aktiv ? 'step' : undefined} disabled={s.gesperrt} onClick={() => waehlen(s.id)}>
              <span className="nummer" aria-hidden="true">
                {s.fertig && s.id !== aktiv ? '✓' : i + 1}
              </span>
              <span className="unsichtbar">Schritt {i + 1}: </span>
              {s.titel}
              {s.fertig && <span className="unsichtbar"> (erledigt)</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** Erklärung für Einsteiger; nur sichtbar, wenn „Erklärungen“ eingeschaltet ist (wie der Lernmodus des Prozesslotsen). */
export function Lernhinweis({ titel, children }: { titel: string; children: ReactNode }) {
  const { erklaerungen } = useApp()
  if (!erklaerungen) return null
  return (
    <aside className="lernhinweis" aria-label={`Erklärung: ${titel}`}>
      <span className="lernhinweis-symbol" aria-hidden="true">
        i
      </span>
      <div>
        <p className="lernhinweis-kopf">
          <strong>{titel}</strong>
        </p>
        <div>{children}</div>
      </div>
    </aside>
  )
}

/** Fehler (role=alert) oder Hinweis (role=status) in einem Kasten. */
export function Hinweis({ art = 'info', titel, children }: { art?: 'info' | 'warnung' | 'fehler' | 'erfolg'; titel?: string; children: ReactNode }) {
  return (
    <div className={`hinweis hinweis-${art}`} role={art === 'fehler' ? 'alert' : 'status'}>
      <span className="hinweis-symbol" aria-hidden="true">
        {art === 'fehler' ? '✕' : art === 'warnung' ? '!' : art === 'erfolg' ? '✓' : 'i'}
      </span>
      <div>
        {titel && <p className="hinweis-titel">{titel}</p>}
        {children}
      </div>
    </div>
  )
}

export function Laden({ text = 'Wird geladen …' }: { text?: string }) {
  return (
    <p className="laden" role="status">
      {text}
    </p>
  )
}

/** Hauptüberschrift einer Seite; erhält nach jedem Seitenwechsel den Fokus. */
export function Seitentitel({ children, unter }: { children: ReactNode; unter?: ReactNode }) {
  return (
    <div className="seitentitel">
      <h1 tabIndex={-1} data-seitentitel="">
        {children}
      </h1>
      {unter && <p className="seitentitel-unter">{unter}</p>}
    </div>
  )
}

/** SHA-256 gekürzt, ausklappbar. */
export function Hashwert({ wert, label = 'SHA-256' }: { wert: string; label?: string }) {
  return (
    <details className="hashwert">
      <summary>
        <span className="unsichtbar">{label}: </span>
        <code>{`${wert.slice(0, 8)}…${wert.slice(-4)}`}</code>
      </summary>
      <code className="hash-voll">{wert}</code>
    </details>
  )
}
