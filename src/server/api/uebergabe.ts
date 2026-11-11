/** Übergabe an die Kanzlei (U1 bis U4) und Prüferexport (R22). */
import type { Hono } from 'hono'
import { monatsvorschlag } from '../../fach/uebergabe.ts'
import type { Beleg } from '../../fach/typen.ts'
import type { Dienste } from '../dienste/kontext.ts'
import { erzeugePrueferexport } from '../dienste/prueferexport.ts'
import { erzeugeUebergabe, plane } from '../dienste/uebergabe.ts'
import { fehler, type Umgebung } from '../sicherheit/middleware.ts'
import { akteurVon, anhangKopf, belegZusammenfassung, leseJson } from './hilfen.ts'
import { monatSchema, prueferexportSchema, zodText } from './schemata.ts'

const ids = (belege: Beleg[]) => belege.map((b) => b.id)

export function registriereUebergabe(app: Hono<Umgebung>, d: Dienste): void {
  app.get('/api/uebergaben', (c) => c.json({ laeufe: d.exporte.alle(), vorschlag: monatsvorschlag(d.belege.liste({ status: 'freigegeben' })) }))

  app.get('/api/uebergaben/plan', (c) => {
    const m = monatSchema.safeParse(c.req.query())
    if (!m.success) return fehler(c, 400, 'EINGABE', zodText(m.error))
    const p = plane(d, m.data.monat)
    const e = d.einstellungen.lies()
    return c.json({
      monat: p.monat,
      nachtragNr: p.nachtragNr,
      belege: p.belege.map(belegZusammenfassung),
      nurBeleg: ids(p.nurBeleg),
      anzahlJeStatus: p.anzahlJeStatus,
      offen: p.offen.map(belegZusammenfassung),
      sperren: p.sperren,
      summen: p.summen,
      summeBruttoCent: p.summeBruttoCent,
      buchungen: p.buchungen.length,
      mitBuchungsstapel: p.mitBuchungsstapel,
      mandant: { beraternummer: e.datev.beraternummer, mandantennummer: e.datev.mandantennummer },
    })
  })

  app.post('/api/uebergaben', async (c) => {
    const e = await leseJson(c, monatSchema)
    if (e.fehler) return e.fehler
    const r = await erzeugeUebergabe(d, e.daten.monat, akteurVon(c))
    if (!r.ok) return c.json({ fehler: { code: r.code, text: r.text }, sperren: r.sperren }, r.status)
    return c.json({ lauf: r.lauf }, 201)
  })

  app.get('/api/uebergaben/:id', (c) => {
    const lauf = d.exporte.hole((c.req.param('id') ?? '').toUpperCase())
    if (!lauf) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Diese Übergabe gibt es nicht.')
    const belege = lauf.belegIds.map((id) => d.belege.hole(id)).filter((b): b is Beleg => b !== null)
    return c.json({ lauf, belege: belege.map(belegZusammenfassung), benutzer: d.benutzer.nachId(lauf.benutzerId)?.name ?? null })
  })

  app.get('/api/uebergaben/:id/dateien/:name', async (c) => {
    const lauf = d.exporte.hole((c.req.param('id') ?? '').toUpperCase())
    const datei = lauf?.dateien.find((f) => f.name === c.req.param('name'))
    if (!lauf || !datei) return fehler(c, 404, 'NICHT-GEFUNDEN', 'Diese Datei gibt es nicht.')
    // Erneuter Download liefert die gespeicherte Datei bytegleich (R21 Punkt 3)
    const bytes = await d.ablage.lies(`exporte/${lauf.id}/${datei.name}`)
    const typ = datei.name.endsWith('.zip') ? 'application/zip' : 'text/csv; charset=windows-1252'
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': typ, 'Content-Disposition': anhangKopf(datei.name) })
  })

  app.post('/api/archiv/prueferexport', async (c) => {
    const e = await leseJson(c, prueferexportSchema)
    if (e.fehler) return e.fehler
    const r = await erzeugePrueferexport(d, { von: e.daten.von ?? null, bis: e.daten.bis ?? null }, akteurVon(c))
    return c.body(r.bytes as Uint8Array<ArrayBuffer>, 200, { 'Content-Type': 'application/zip', 'Content-Disposition': anhangKopf(r.name), 'X-Belegbruecke-Sha256': r.sha256 })
  })
}
