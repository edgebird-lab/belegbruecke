/**
 * Pool von Prüf-Workern (Spezifikation 7.7: zwei Worker für Prüfung und PDF). Jeder Auftrag hat
 * ein Zeitlimit; bei Überschreitung, Speicherüberlauf oder Absturz wird der Worker beendet und
 * durch einen neuen ersetzt (R6 Punkt 8).
 */
import { Worker } from 'node:worker_threads'
import type { Rahmen } from '../fach/formaterkennung.ts'
import type { Syntax } from '../fach/typen.ts'
import { abbruchBefund, type Ausfuehrer, type Pruefteil } from './eingang.ts'
import type { PdfErgebnis } from './pdf.ts'
import type { Antwort, Auftrag } from './worker.ts'

export type Abbruchgrund = 'zeitlimit' | 'speicher' | 'absturz'

export class AuftragAbgebrochen extends Error {
  readonly grund: Abbruchgrund
  constructor(grund: Abbruchgrund, meldung: string) {
    super(meldung)
    this.name = 'AuftragAbgebrochen'
    this.grund = grund
  }
}

export interface PoolOptionen {
  anzahl?: number
  /** resourceLimits.maxOldGenerationSizeMb je Worker; Messung in Schritt 0.4: rund 320 MB Heap */
  speicherMb?: number
  zeitlimitPdfMs?: number
  zeitlimitPruefungMs?: number
  /** nur für Tests: anderer Worker */
  workerDatei?: URL
}

interface Warteeintrag {
  id: number
  auftrag: Auftrag
  zeitlimitMs: number
  ok: (wert: unknown) => void
  fehler: (e: unknown) => void
}

interface Arbeiter {
  worker: Worker
  aktiv: Warteeintrag | null
  timer: NodeJS.Timeout | null
}

export class Prueferpool implements Ausfuehrer {
  private readonly arbeiter: Arbeiter[] = []
  private readonly warteschlange: Warteeintrag[] = []
  private naechsteId = 1
  private beendet = false
  private readonly opt: Required<PoolOptionen>

  constructor(optionen: PoolOptionen = {}) {
    this.opt = {
      anzahl: optionen.anzahl ?? 2,
      speicherMb: optionen.speicherMb ?? 1024,
      zeitlimitPdfMs: optionen.zeitlimitPdfMs ?? 20_000,
      zeitlimitPruefungMs: optionen.zeitlimitPruefungMs ?? 60_000,
      workerDatei: optionen.workerDatei ?? new URL('./worker.ts', import.meta.url),
    }
    for (let i = 0; i < this.opt.anzahl; i++) this.arbeiter.push(this.starte())
  }

  private starte(): Arbeiter {
    const worker = new Worker(this.opt.workerDatei, { resourceLimits: { maxOldGenerationSizeMb: this.opt.speicherMb } })
    const a: Arbeiter = { worker, aktiv: null, timer: null }
    worker.on('message', (antwort: Antwort) => {
      const eintrag = a.aktiv
      if (!eintrag || eintrag.id !== antwort.id) return
      this.fertig(a)
      if (antwort.ok) eintrag.ok(antwort.ergebnis)
      else eintrag.fehler(new Error(antwort.fehler))
    })
    worker.on('error', (e: Error & { code?: string }) => {
      this.ersetze(a, e.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'speicher' : 'absturz', e.message)
    })
    worker.on('exit', (code) => {
      if (!this.beendet && this.arbeiter.includes(a)) this.ersetze(a, 'absturz', `Worker beendet mit Code ${code}`)
    })
    worker.unref()
    return a
  }

  private fertig(a: Arbeiter) {
    if (a.timer) clearTimeout(a.timer)
    a.timer = null
    a.aktiv = null
    this.verteile()
  }

  /** Beendet einen Worker, meldet den laufenden Auftrag als abgebrochen und startet einen neuen. */
  private ersetze(a: Arbeiter, grund: Abbruchgrund, meldung: string) {
    const i = this.arbeiter.indexOf(a)
    if (i < 0) return
    const eintrag = a.aktiv
    if (a.timer) clearTimeout(a.timer)
    a.aktiv = null
    a.timer = null
    this.arbeiter.splice(i, 1)
    void a.worker.terminate()
    if (!this.beendet) this.arbeiter.push(this.starte())
    eintrag?.fehler(new AuftragAbgebrochen(grund, meldung))
    this.verteile()
  }

  private verteile() {
    for (const a of this.arbeiter) {
      if (a.aktiv || !this.warteschlange.length) continue
      const eintrag = this.warteschlange.shift()!
      a.aktiv = eintrag
      a.worker.ref()
      a.timer = setTimeout(() => this.ersetze(a, 'zeitlimit', `Zeitlimit von ${eintrag.zeitlimitMs} ms überschritten`), eintrag.zeitlimitMs)
      a.worker.postMessage({ id: eintrag.id, auftrag: eintrag.auftrag })
    }
    for (const a of this.arbeiter) if (!a.aktiv) a.worker.unref()
  }

  ausfuehren<T>(auftrag: Auftrag, zeitlimitMs: number): Promise<T> {
    if (this.beendet) return Promise.reject(new Error('Prüferpool ist beendet'))
    return new Promise<T>((ok, fehler) => {
      this.warteschlange.push({ id: this.naechsteId++, auftrag, zeitlimitMs, ok: ok as (w: unknown) => void, fehler })
      this.verteile()
    })
  }

  async pdf(bytes: Uint8Array): Promise<PdfErgebnis> {
    try {
      return await this.ausfuehren<PdfErgebnis>({ art: 'pdf', bytes }, this.opt.zeitlimitPdfMs)
    } catch (e) {
      if (e instanceof AuftragAbgebrochen) return { art: 'fehler', befunde: [abbruchBefund(e.grund)] }
      throw e
    }
  }

  async xml(bytes: Uint8Array, rahmen: Rahmen): Promise<Pruefteil> {
    try {
      return await this.ausfuehren<Pruefteil>({ art: 'xml', bytes, rahmen }, this.opt.zeitlimitPruefungMs)
    } catch (e) {
      if (!(e instanceof AuftragAbgebrochen)) throw e
      return {
        format: {
          belegart: 'e-rechnung',
          container: rahmen.container,
          syntax: null,
          profil: null,
          spezifikationsKennung: null,
          eingebettetAls: rahmen.eingebettetAls,
          xmlSha256: rahmen.xmlSha256,
          zeichensatz: null,
          grund: 'Prüfung abgebrochen',
        },
        befunde: [abbruchBefund(e.grund)],
        szenario: null,
        wohlgeformt: false,
        xsdGueltig: null,
        angenommen: false,
        eingeschraenktGeprueft: false,
        meldungen: [],
        daten: null,
        dauerMs: 0,
      }
    }
  }

  ansicht(text: string, syntax: Syntax): Promise<string> {
    return this.ausfuehren<string>({ art: 'ansicht', text, syntax }, this.opt.zeitlimitPruefungMs)
  }

  async beenden(): Promise<void> {
    this.beendet = true
    for (const e of this.warteschlange.splice(0)) e.fehler(new Error('Prüferpool wurde beendet'))
    await Promise.all(this.arbeiter.splice(0).map((a) => a.worker.terminate()))
  }
}
