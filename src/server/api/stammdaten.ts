/**
 * Stammdaten (Spezifikation 7.6): Lieferanten mit Kreditorenkonto, Kontenplan von Hand und als CSV
 * (Schritt 4.1). Jede Änderung mit Protokolleintrag `einstellungen-geaendert` (alt und neu).
 */
import type { Hono } from 'hono'
import { leseKontenCsv, pruefeSachkonto } from '../../fach/kontenplan.ts'
import { pruefeKreditorenkonto } from '../../fach/lieferant.ts'
import type { Lieferant, Sachkonto } from '../../fach/typen.ts'
import type { Dienste } from '../dienste/kontext.ts'
import { fehler, type Umgebung } from '../sicherheit/middleware.ts'
import { akteurVon, leseJson } from './hilfen.ts'
import { kontenimportSchema, lieferantSchema, sachkontoSchema } from './schemata.ts'

export function registriereStammdaten(app: Hono<Umgebung>, d: Dienste): void {
  app.get('/api/lieferanten', (c) => {
    const belege = d.belege.liste()
    return c.json({
      lieferanten: d.lieferanten.alle().map((l) => ({ ...l, belege: belege.filter((b) => b.lieferantId === l.id).length, regeln: d.regeln.fuerLieferant(l.id) })),
    })
  })

  app.put('/api/lieferanten/:id', async (c) => {
    const alt = d.lieferanten.hole((c.req.param('id') ?? '').toUpperCase())
    if (!alt) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Diesen Lieferanten gibt es nicht.')
    const e = await leseJson(c, lieferantSchema)
    if (e.fehler) return e.fehler
    const neu: Lieferant = { ...alt, name: e.daten.name.trim(), ustId: e.daten.ustId || null, steuernummer: e.daten.steuernummer || null, anschrift: e.daten.anschrift, kreditorKonto: e.daten.kreditorKonto }
    if (neu.kreditorKonto !== alt.kreditorKonto) {
      if (alt.kreditorKonto !== null && d.belege.liste({ status: 'exportiert' }).some((b) => b.lieferantId === alt.id)) {
        return fehler(c, 409, 'KREDITOR-UEBERGEBEN', `Das Kreditorenkonto ${alt.kreditorKonto} ist schon an die Kanzlei übergeben und bleibt.`)
      }
      if (neu.kreditorKonto !== null) {
        const f = pruefeKreditorenkonto(neu.kreditorKonto, d.lieferanten.vergebeneKreditoren(alt.id), d.einstellungen.lies().datev)
        if (f) return fehler(c, 400, 'KREDITOR', f)
      }
    }
    d.db.transaktion(() => {
      d.lieferanten.aktualisieren(neu)
      d.protokoll.anhaengen({
        akteur: akteurVon(c),
        aktion: 'einstellungen-geaendert',
        belegId: null,
        daten: { bereich: 'lieferant', id: alt.id, alt: { name: alt.name, ustId: alt.ustId, steuernummer: alt.steuernummer, kreditorKonto: alt.kreditorKonto }, neu: { name: neu.name, ustId: neu.ustId, steuernummer: neu.steuernummer, kreditorKonto: neu.kreditorKonto } },
      })
    })
    return c.json({ lieferant: neu })
  })

  app.get('/api/sachkonten', (c) => c.json({ sachkonten: d.sachkonten.alle(), zuletzt: d.regeln.zuletztGenutzt() }))

  app.put('/api/sachkonten', async (c) => {
    const e = await leseJson(c, sachkontoSchema)
    if (e.fehler) return e.fehler
    const f = pruefeSachkonto(e.daten.nummer, d.einstellungen.lies().datev.sachkontenlaenge)
    if (f) return fehler(c, 400, 'SACHKONTO', f)
    const konto: Sachkonto = e.daten
    let alt: Sachkonto | null = null
    d.db.transaktion(() => {
      alt = d.sachkonten.speichern(konto)
      d.protokoll.anhaengen({ akteur: akteurVon(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'sachkonto', alt, neu: { ...konto } } })
    })
    return c.json({ sachkonto: konto, neu: alt === null })
  })

  app.post('/api/sachkonten', async (c) => {
    const e = await leseJson(c, kontenimportSchema)
    if (e.fehler) return e.fehler
    const r = leseKontenCsv(e.daten.csv, d.einstellungen.lies().datev.sachkontenlaenge)
    if (r.konten.length === 0) return fehler(c, 400, 'KONTENIMPORT', r.fehler.length ? r.fehler.slice(0, 5).join(' ') : 'Die Datei enthält keine Konten.')
    const neu: number[] = []
    const geaendert: number[] = []
    d.db.transaktion(() => {
      for (const k of r.konten) {
        const alt = d.sachkonten.speichern(k)
        if (alt === null) neu.push(k.nummer)
        else if (alt.bezeichnung !== k.bezeichnung || alt.automatikkonto !== k.automatikkonto || !alt.aktiv) geaendert.push(k.nummer)
      }
      d.protokoll.anhaengen({ akteur: akteurVon(c), aktion: 'einstellungen-geaendert', belegId: null, daten: { bereich: 'sachkonten-import', neu, geaendert, fehler: r.fehler.length } })
    })
    return c.json({ uebernommen: r.konten.length, neu: neu.length, geaendert: geaendert.length, fehler: r.fehler })
  })
}
