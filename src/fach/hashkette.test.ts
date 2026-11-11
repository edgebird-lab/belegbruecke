import { describe, expect, it } from 'vitest'
import { sha256 } from '../testhilfen/krypto.ts'
import { eintragsHash, eintragsText, neuerEintrag, NULL_HASH, pruefeKette } from './hashkette.ts'
import type { Protokolleintrag } from './typen.ts'

const BELEG = '6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00'
const DATEN_1 = {
  dateiname: '01.01a-INVOICE_ubl.xml',
  groesseBytes: 6887,
  quelle: 'upload',
  sha256: '0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb',
}

function eintrag1(groesseBytes = 6887): Protokolleintrag {
  return neuerEintrag(
    null,
    {
      zeitpunkt: '2026-11-11T09:30:00.000Z',
      akteur: { art: 'benutzer', id: '00000000-0000-4000-8000-000000000001' },
      aktion: 'eingang',
      belegId: BELEG,
      daten: { ...DATEN_1, groesseBytes },
    },
    sha256,
  )
}

function eintrag2(vorgaenger: Protokolleintrag): Protokolleintrag {
  return neuerEintrag(
    vorgaenger,
    {
      zeitpunkt: '2026-11-11T09:30:02.000Z',
      akteur: { art: 'system', dienst: 'pruefung' },
      aktion: 'pruefung',
      belegId: BELEG,
      daten: { angenommen: true, szenario: 'EN16931 XRechnung (UBL Invoice)' },
    },
    sha256,
  )
}

describe('Hashkette: Testvektoren (T-H1)', () => {
  it('ergibt den kanonischen Text aus der Spezifikation', () => {
    expect(eintragsText(eintrag1())).toBe(
      '{"akteur":{"art":"benutzer","id":"00000000-0000-4000-8000-000000000001"},"aktion":"eingang","belegId":"6F1C2B9A-0D4E-4C1A-9B7E-2A5D3C4B1E00","daten":{"dateiname":"01.01a-INVOICE_ubl.xml","groesseBytes":6887,"quelle":"upload","sha256":"0efafa05c74d06ff25bbc2b70bcb2e9f14b97d22a4b33c5e92838bf2cc8986cb"},"nr":1,"vorgaengerHash":"0000000000000000000000000000000000000000000000000000000000000000","zeitpunkt":"2026-11-11T09:30:00.000Z"}',
    )
  })

  it('ergibt die Hashes der Testvektoren', () => {
    const e1 = eintrag1()
    expect(e1.nr).toBe(1)
    expect(e1.vorgaengerHash).toBe(NULL_HASH)
    expect(e1.hash).toBe('677ce65d9a17299937acfd7d584dd1cb0bc8c45b3d0f9784f12cd48edf32b16a')
    const e2 = eintrag2(e1)
    expect(e2.nr).toBe(2)
    expect(e2.vorgaengerHash).toBe(e1.hash)
    expect(e2.hash).toBe('a94b3fe344515aaf7678b69bfda2832508a7640e5b6dba5827ca8b729bd62230')
    expect(eintrag1(6888).hash).toBe('ee90ad0152ce4908a8590eda868a0a867ef5d3ac04f9b6f4db0e9984c1f1119c')
  })

  it('hängt den Hash selbst nicht mit ein', () => {
    const e1 = eintrag1()
    expect(eintragsHash({ ...e1, hash: 'egal' } as Protokolleintrag, sha256)).toBe(e1.hash)
  })
})

describe('pruefeKette (R18 Punkte 1 bis 3, 5)', () => {
  function kette(n: number): Protokolleintrag[] {
    const liste: Protokolleintrag[] = []
    for (let i = 0; i < n; i++) {
      liste.push(
        neuerEintrag(
          liste.at(-1) ?? null,
          { zeitpunkt: `2026-11-11T09:30:0${i}.000Z`, akteur: { art: 'system', dienst: 'pruefung' }, aktion: 'pruefung', belegId: null, daten: { i } },
          sha256,
        ),
      )
    }
    return liste
  }

  it('meldet nichts bei einer intakten Kette', () => {
    expect(pruefeKette(kette(5), sha256)).toEqual([])
    expect(pruefeKette([], sha256)).toEqual([])
  })

  it('erkennt einen veränderten Eintrag (T-H2)', () => {
    const e1 = eintrag1()
    const e2 = eintrag2(e1)
    const veraendert = { ...e1, daten: { ...e1.daten, groesseBytes: 6888 } }
    expect(pruefeKette([veraendert, e2], sha256)).toEqual([{ art: 'veraendert', nr: 1, text: 'Eintrag 1 verändert' }])
  })

  it('erkennt eine Lücke (T-H3) und die gebrochene Verkettung', () => {
    const [a, , c] = kette(3)
    const fehler = pruefeKette([a, c], sha256)
    expect(fehler[0]).toEqual({ art: 'luecke', nachNr: 1, text: 'Lücke nach Nr. 1' })
    expect(fehler[1]).toMatchObject({ art: 'verkettung', nr: 3 })
    expect(fehler).toHaveLength(2)
  })

  it('erkennt einen falschen Beginn', () => {
    const [, b] = kette(2)
    expect(pruefeKette([b], sha256)[0]).toMatchObject({ art: 'luecke', nachNr: 0 })
  })

  it('meldet je Art nur den ersten Fehler', () => {
    const liste = kette(4).map((e) => ({ ...e, daten: { anders: true } }))
    expect(pruefeKette(liste, sha256).filter((f) => f.art === 'veraendert')).toHaveLength(1)
  })

  it('gleicht Kettenanker ab', () => {
    const liste = kette(3)
    expect(pruefeKette(liste, sha256, [{ nr: 2, hash: liste[1].hash }])).toEqual([])
    expect(pruefeKette(liste, sha256, [{ nr: 2, hash: liste[0].hash }])[0]).toMatchObject({ art: 'anker', nr: 2 })
    expect(pruefeKette(liste, sha256, [{ nr: 9, hash: liste[0].hash }])[0].text).toContain('fehlt')
  })
})
