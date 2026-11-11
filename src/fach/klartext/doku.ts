/** Erzeugt docs/regelkatalog.md aus dem Klartext-Katalog (scripts/regelkatalog.mjs). */
import { EIGENE_REGELN, type Katalogeintrag } from './katalog.ts'
import { REGELWERK } from './regelwerk.ts'

function zelle(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function relevanz(r: boolean | 'unklar'): string {
  return r === true ? 'ja' : r === false ? 'nein' : 'unklar'
}

function tabelle(eintraege: [string, Katalogeintrag][], mitStufe: boolean): string {
  const kopf = mitStufe
    ? '| Regel | Stufe | Fehlerklasse | Titel | Erklärung | USt-relevant | Handlung | Quelle |\n| --- | --- | --- | --- | --- | --- | --- | --- |'
    : '| Regel | Titel | Erklärung | BT | USt-relevant | Handlung | Quelle |\n| --- | --- | --- | --- | --- | --- | --- |'
  const zeilen = eintraege.map(([id, e]) =>
    mitStufe
      ? `| \`${id}\` | ${e.stufe ?? ''} | ${e.fehlerklasse ?? ''} | ${zelle(e.titel)} | ${zelle(e.klartext)} | ${relevanz(e.ustRelevant)} | ${zelle(e.handlung)} | ${zelle(e.rechtsgrundlage ?? '')} |`
      : `| \`${id}\` | ${zelle(e.titel)} | ${zelle(e.klartext)} | ${e.btBezug.join(', ')} | ${relevanz(e.ustRelevant)} | ${zelle(e.handlung)} | ${zelle(e.rechtsgrundlage ?? '')} |`,
  )
  return [kopf, ...zeilen].join('\n')
}

export function regelkatalogMarkdown(): string {
  const regelwerk = Object.entries(REGELWERK)
  const gruppe = (p: (id: string) => boolean) => regelwerk.filter(([id]) => p(id))
  return `# Belegbrücke – Regelkatalog

Erzeugt aus \`src/fach/klartext/\` mit \`node scripts/regelkatalog.mjs\`; nicht von Hand ändern. Ein Test prüft, dass diese Datei zum Katalog passt.

Die Erklärungen sind eigene Texte der Belegbrücke. Aus den Regelwerken stammen nur Regel-IDs, BT-Nummern und kurze Begriffe; die Originalmeldungen (EN 16931: EUPL-1.2, XRechnung: Apache-2.0) zeigt die App unverändert als Originaltext. Technische Prüfung ohne Gewähr; die Pflicht zur eigenen Rechnungsprüfung bleibt (BMF-Schreiben vom 15.10.2025, Rn. 35a).

**Einordnung nach R7:** Formatfehler (Rn. 6a) machen die Datei zur sonstigen Rechnung. Schematron-Meldungen der Stufe Fehler sind Geschäftsregelfehler (Rn. 6b). Fehlende Pflichtangaben sind Inhaltsfehler (Rn. 35a). „USt-relevant“ sagt, ob der Befund eine Pflichtangabe nach § 14 Abs. 4 UStG oder Entgelt und Steuer betrifft; Regeln ohne Eintrag zeigt die App als „unklar“ mit dem Originaltext.

## Eigene Regeln (${Object.keys(EIGENE_REGELN).length})

${tabelle(Object.entries(EIGENE_REGELN), true)}

## EN 16931: Pflichtfelder, Summen, Steuer, Codelisten (${gruppe((id) => id.startsWith('BR-') && !id.startsWith('BR-DE')).length})

${tabelle(gruppe((id) => id.startsWith('BR-') && !id.startsWith('BR-DE')), false)}

## XRechnung (${gruppe((id) => id.startsWith('BR-DE')).length})

${tabelle(gruppe((id) => id.startsWith('BR-DE')), false)}

## Syntaxregeln UBL und CII (${gruppe((id) => !id.startsWith('BR-')).length})

${tabelle(gruppe((id) => !id.startsWith('BR-')), false)}
`
}
