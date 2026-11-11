/**
 * Fallbeispiel „Oktober“ (Schritt 6.3, Spezifikation 9.3): 12 Belege eines Monats vom Eingang bis zur
 * Übergabe an die Kanzlei. Jede Zahl im README-Abschnitt „Fallbeispiel“ steht hier als Erwartung.
 * Testdateien: testdaten/fallbeispiel/ (KoSIT-Testsuite mit Rechnungsdatum im Oktober 2026,
 * scripts/fallbeispiel.mjs) und eine PDF ohne XML, von Hand erfasst.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { dekodiereWindows1252 } from '../fach/datev/cp1252.ts'
import type { Beleg, Einstellungen, Exportlauf, Lieferant } from '../fach/typen.ts'
import { WURZEL, zugferd } from '../testhilfen/dateien.ts'
import { BEISPIEL_FIRMA } from '../testhilfen/rechnungen.ts'
import { testserver } from '../testhilfen/server.ts'

const ORDNER = join(WURZEL, 'testdaten', 'fallbeispiel')

describe('Fallbeispiel Oktober (6.3)', () => {
  it('12 Belege vom Eingang bis zur Übergabe', { timeout: 180_000 }, async () => {
    const s = testserver('2026-11-02T08:00:00.000Z')
    try {
      await s.einrichten()
      const e = (await (await s.anfrage('/api/einstellungen')).json()) as Einstellungen & { passwortGesetzt?: boolean }
      delete e.passwortGesetzt
      await s.anfrage('/api/einstellungen', s.json({ ...e, firma: { ...BEISPIEL_FIRMA, ustId: undefined }, eingerichtetAm: 'jetzt' }, { method: 'PUT' }))
      await s.anfrage('/api/sachkonten', s.json({ csv: '4900;Testaufwand;nein\n4901;Testaufwand Automatik;ja\n' }))

      // Eingang: 11 E-Rechnungen und eine PDF ohne XML, in einem Upload
      const dateien: { name: string; bytes: Uint8Array }[] = readdirSync(ORDNER)
        .sort()
        .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(ORDNER, name))) }))
      dateien.push({ name: '12-Quittung-Baeckerei.pdf', bytes: zugferd('pdf-ohne-xml.pdf') })
      const upload = (await (await s.hochladen(dateien)).json()) as { ergebnisse: { ok: boolean; belegId: string; status: string; ampel: { farbe: string } }[] }
      expect(upload.ergebnisse).toHaveLength(12)
      expect(upload.ergebnisse.every((x) => x.ok)).toBe(true)
      const id = (nr: number) => upload.ergebnisse[nr - 1].belegId
      const hole = async (nr: number) => ((await (await s.anfrage(`/api/belege/${id(nr)}`)).json()) as { beleg: Beleg; lieferantenvorschlag: { vorhanden: Lieferant | null; neu: { name: string } } | null; kontierungsvorschlag: { zeilen: unknown[] } })
      // 11 E-Rechnungen geprüft und angenommen, die PDF wartet auf die Erfassung von Hand
      expect(upload.ergebnisse.map((x) => x.status)).toEqual([...Array(11).fill('geprueft'), 'eingegangen'])
      const belege = await Promise.all(Array.from({ length: 12 }, (_, i) => hole(i + 1)))
      expect(belege.slice(0, 11).every((b) => b.beleg.pruefung?.angenommen)).toBe(true)
      expect(upload.ergebnisse.map((x) => x.ampel.farbe).filter((f) => f === 'rot')).toEqual([])

      // Nr. 12: Erfassung von Hand (Kleinbetrag 10,70 €, 7 %)
      const hand = { lieferantName: 'Bäckerei Korn', lieferantUstId: null, lieferantSteuernummer: '21/815/08150', rechnungsnummer: 'Q-77', rechnungsdatum: '2026-10-30', leistungsdatum: '2026-10-30', steuern: [{ kategorie: 'S', satz: '7', bemessungCent: 1000, steuerCent: 70 }], bruttoCent: 1070 }
      expect((await s.anfrage(`/api/belege/${id(12)}/handerfassung`, s.json(hand, { method: 'PUT' }))).status).toBe(200)

      // Nr. 11 ist 01.01a als CII: dieselbe Rechnung wie Nr. 1, als Dublette abgelehnt
      const dublette = await hole(11)
      expect(dublette.beleg.dubletten.map((h) => [h.stufe, h.andererBelegId])).toEqual([['gleiche-rechnung', id(1)]])
      expect((await s.anfrage(`/api/belege/${id(11)}/dublette`, s.json({ ergebnis: 'dublette' }))).status).toBe(200)

      // Zuordnen, kontieren (Nr. 4 auf das Automatikkonto 4901, sonst 4900), freigeben; Nr. 9 (§ 13b) wartet auf den BU-Schlüssel der Kanzlei
      for (const nr of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]) {
        const d = await hole(nr)
        const zuordnung = d.lieferantenvorschlag!.vorhanden ? { lieferantId: d.lieferantenvorschlag!.vorhanden.id } : { neu: { name: d.lieferantenvorschlag!.neu.name } }
        expect((await s.anfrage(`/api/belege/${id(nr)}/lieferant`, s.json(zuordnung, { method: 'PUT' }))).status).toBe(200)
        const v = (await hole(nr)).kontierungsvorschlag
        const konto = nr === 4 ? 4901 : 4900
        expect((await s.anfrage(`/api/belege/${id(nr)}/kontierung`, s.json({ zeilen: v.zeilen.map(() => ({ sachkonto: konto })) }, { method: 'PUT' }))).status).toBe(200)
        if (nr === 9) continue
        const f = await s.anfrage(`/api/belege/${id(nr)}/freigeben`, s.json({ inhaltGeprueft: true }))
        expect(f.status, await f.clone().text()).toBe(200)
      }
      const nachFreigabe = await Promise.all(Array.from({ length: 12 }, (_, i) => hole(i + 1)))
      expect(nachFreigabe.map((d) => d.beleg.status)).toEqual(['freigegeben', 'freigegeben', 'freigegeben', 'freigegeben', 'freigegeben', 'freigegeben', 'freigegeben', 'freigegeben', 'kontiert', 'freigegeben', 'abgelehnt', 'freigegeben'])
      expect(nachFreigabe.every((d) => d.beleg.aufbewahrenBis === '2034-12-31')).toBe(true)

      // Kreditorenkonten in der Reihenfolge der ersten Freigabe; Nr. 10 (Gutschrift 389) ohne Kreditor
      const lieferanten = ((await (await s.anfrage('/api/lieferanten')).json()) as { lieferanten: Lieferant[] }).lieferanten
      const kreditor = (nr: number) => lieferanten.find((l) => l.id === nachFreigabe[nr - 1].beleg.lieferantId)?.kreditorKonto ?? null
      expect([1, 6, 8, 12, 10].map(kreditor)).toEqual([70000, 70001, 70002, 70003, null])
      expect([2, 3, 4, 5, 9].map(kreditor)).toEqual([70000, 70000, 70000, 70000, 70000])

      // Übergabe Oktober: 10 Belege, Nr. 9 noch offen
      const plan = (await (await s.anfrage('/api/uebergaben/plan?monat=2026-10')).json()) as { belege: { id: string }[]; offen: { id: string }[]; sperren: unknown[]; summen: { kategorie: string; satz: string; bruttoCent: number }[]; summeBruttoCent: number; buchungen: number; nurBeleg: string[] }
      expect(plan.belege).toHaveLength(10)
      expect(plan.offen.map((b) => b.id)).toEqual([id(9)])
      expect(plan.sperren).toEqual([])
      expect(plan.nurBeleg).toEqual([id(10)])
      expect(plan.buchungen).toBe(10)
      // O 0 %: 120,00 €; S 19 %: 45,22 + 7.197,12 + 12.829,69 + 688,88 = 20.760,91 €; S 7 %: 336,90 + 12,60 + 182,20 + 115,98 + 10,70 = 658,38 €
      expect(plan.summen).toEqual([
        { kategorie: 'O', satz: '0', bruttoCent: 12000 },
        { kategorie: 'S', satz: '19', bruttoCent: 2076091 },
        { kategorie: 'S', satz: '7', bruttoCent: 65838 },
      ])
      expect(plan.summeBruttoCent).toBe(2153929)

      const r = await s.anfrage('/api/uebergaben', s.json({ monat: '2026-10' }))
      expect(r.status).toBe(201)
      const { lauf } = (await r.json()) as { lauf: Exportlauf }
      expect(lauf.dateien.map((f) => f.name)).toEqual(['EXTF_Buchungsstapel_1001_1_2026-10.csv', 'Belege_2026-10.zip'])
      const extf = dekodiereWindows1252(new Uint8Array(await (await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/${lauf.dateien[0].name}`)).arrayBuffer()))
      const zeilen = extf.split('\r\n').filter(Boolean)
      expect(zeilen).toHaveLength(12) // Kopf, Überschriften, 10 Buchungen
      expect(zeilen[0]).toContain('"Belegbrücke 10/2026"')
      expect(zeilen[0]).toContain(';20261001;20261031;')
      const buchungen = zeilen.slice(2).map((z) => z.split(';'))
      expect(buchungen.map((f) => [f[0], f[6], f[7], f[8], f[9]])).toEqual([
        ['336,90', '70000', '4900', '"8"', '0110'],
        ['12,60', '70000', '4900', '"8"', '0210'],
        ['182,20', '70000', '4900', '"8"', '0510'],
        ['45,22', '70000', '4901', '', '0610'],
        ['7197,12', '70000', '4900', '"9"', '0810'],
        ['12829,69', '70001', '4900', '"9"', '1210'],
        ['688,88', '70001', '4900', '"9"', '1410'],
        ['115,98', '70001', '4900', '"8"', '1410'],
        ['120,00', '70002', '4900', '', '1510'],
        ['10,70', '70003', '4900', '"8"', '3010'],
      ])
      // Summe aller Buchungen gleich der Summe im Übergabeprotokoll: 21.539,29 €
      expect(buchungen.reduce((n, f) => n + Number(f[0].replace(',', '')), 0)).toBe(2153929)

      const zip = unzipSync(new Uint8Array(await (await s.anfrage(`/api/uebergaben/${lauf.id}/dateien/Belege_2026-10.zip`)).arrayBuffer()))
      const namen = Object.keys(zip)
      expect(namen.filter((n) => n.startsWith('originale/'))).toHaveLength(10)
      expect(namen.filter((n) => n.startsWith('ansicht/'))).toHaveLength(9)
      expect(namen.filter((n) => n.startsWith('pruefberichte/'))).toHaveLength(10)
      expect(strFromU8(zip['index.csv']).trim().split('\r\n')).toHaveLength(11)

      // Danach: alles übergeben, Kette in Ordnung, Kettenanker = letzter Eintrag
      const kette = (await (await s.anfrage('/api/archiv/pruefen', s.json({ anker: [lauf.kettenanker] }))).json()) as { bericht: { ok: boolean; eintraege: number; dateien: number } }
      expect(kette.bericht.ok).toBe(true)
      expect(kette.bericht.dateien).toBe(25) // 12 Originale und 13 Prüfberichte (Nr. 12 zweimal: Eingang und Erfassung)
      const zaehler = (await (await s.anfrage('/api/zaehler')).json()) as { offen: number; freigegeben: number }
      expect(zaehler).toEqual({ offen: 1, freigegeben: 0 })
    } finally {
      s.aufraeumen()
    }
  })
})
