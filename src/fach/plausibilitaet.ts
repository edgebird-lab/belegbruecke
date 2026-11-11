/** Plausibilität (R11): Hinweise, die eine Validierung nicht leistet (BMF Rn. 35a). */
import { befund } from './befunde.ts'
import { istGueltigesDatum, tageZwischen } from './datum.ts'
import type { Befund, Datum, Rechnungsdaten } from './typen.ts'

/** IBAN-Prüfziffer nach ISO 13616 (Modulo 97). */
export function ibanGueltig(iban: string): boolean {
  const i = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(i)) return false
  const umgestellt = i.slice(4) + i.slice(0, 4)
  let rest = 0
  for (const z of umgestellt) {
    const wert = z >= 'A' && z <= 'Z' ? String(z.charCodeAt(0) - 55) : z
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97
  }
  return rest === 1
}

const quelle = 'plausibilitaet' as const

export function pruefePlausibilitaet(d: Rechnungsdaten, heute: Datum): Befund[] {
  const befunde: Befund[] = []
  for (const s of d.steuern) {
    if (s.kategorie === 'S' && s.satz !== '19' && s.satz !== '7') {
      befunde.push(
        befund('PLAUS-STEUERSATZ', {
          quelle,
          stufe: 'warnung',
          ustRelevant: true,
          btBezug: ['BT-118', 'BT-119'],
          klartext: `Steuersatz ${s.satz || '(leer)'} % bei Kategorie S. In Deutschland gelten 19 % und 7 %. Ein falscher Steuersatz fällt bei der Validierung nicht auf (BMF Rn. 35a).`,
          handlung: 'Steuersatz prüfen; bei falschem Satz korrigierte Rechnung anfordern.',
        }),
      )
      break
    }
  }
  if (istGueltigesDatum(d.rechnungsdatum) && tageZwischen(heute, d.rechnungsdatum) > 1) {
    befunde.push(
      befund('PLAUS-DATUM', {
        quelle,
        stufe: 'warnung',
        ustRelevant: 'unklar',
        btBezug: ['BT-2'],
        klartext: `Das Rechnungsdatum ${d.rechnungsdatum} liegt mehr als einen Tag in der Zukunft.`,
        handlung: 'Datum prüfen; bei Tippfehler korrigierte Rechnung anfordern.',
      }),
    )
  }
  if (istGueltigesDatum(d.faelligAm) && istGueltigesDatum(d.rechnungsdatum) && tageZwischen(d.rechnungsdatum, d.faelligAm) < 0) {
    befunde.push(
      befund('PLAUS-FAELLIG', {
        quelle,
        stufe: 'hinweis',
        ustRelevant: false,
        btBezug: ['BT-9', 'BT-2'],
        klartext: `Das Fälligkeitsdatum ${d.faelligAm} liegt vor dem Rechnungsdatum ${d.rechnungsdatum}.`,
        handlung: 'Zahlungsziel mit dem Lieferanten klären.',
      }),
    )
  }
  if (d.waehrung && d.waehrung !== 'EUR') {
    befunde.push(
      befund('PLAUS-WAEHRUNG', {
        quelle,
        stufe: 'warnung',
        ustRelevant: 'unklar',
        btBezug: ['BT-5'],
        klartext: `Die Rechnung lautet auf ${d.waehrung}, nicht auf Euro. Fremdwährungen kann die Belegbrücke noch nicht an die Kanzlei übergeben; der Export ist für diesen Beleg gesperrt.`,
        handlung: 'Beleg der Kanzlei gesondert geben.',
      }),
    )
  }
  if (d.zahlung.iban && !ibanGueltig(d.zahlung.iban)) {
    befunde.push(
      befund('PLAUS-IBAN', {
        quelle,
        stufe: 'warnung',
        ustRelevant: false,
        btBezug: ['BT-84'],
        klartext: `Die IBAN ${d.zahlung.iban} besteht die Prüfziffernrechnung nicht. Sie ist falsch geschrieben oder gefälscht.`,
        handlung: 'Nicht überweisen; Bankverbindung beim Lieferanten auf bekanntem Weg erfragen.',
      }),
    )
  }
  const extern = d.anhaenge.filter((a) => a.externeAdresse)
  if (extern.length) {
    befunde.push(
      befund('PLAUS-ANHANG-EXTERN', {
        quelle,
        stufe: 'hinweis',
        ustRelevant: false,
        btBezug: ['BT-124'],
        klartext: `Die Rechnung verweist auf ${extern.length === 1 ? 'ein externes Dokument' : `${extern.length} externe Dokumente`}. Der Link wird nicht geöffnet; Angaben daraus zählen nicht (BMF Rn. 35).`,
        handlung: 'Pflichtangaben müssen in der Rechnung selbst stehen.',
      }),
    )
  }
  return befunde
}
