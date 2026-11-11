// Schreibt docs/lizenzen-dritter.md: Laufzeit-Abhängigkeiten aus package-lock.json (ohne reine
// Entwicklungswerkzeuge) und die Prüfartefakte aus vendor/artefakte.json.
import { readFile, writeFile } from 'node:fs/promises'

const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))
const artefakte = JSON.parse(await readFile(new URL('../vendor/artefakte.json', import.meta.url), 'utf8'))

const zeilen = Object.entries(lock.packages)
  .filter(([pfad, p]) => pfad.startsWith('node_modules/') && !p.dev)
  .map(([pfad, p]) => ({ name: pfad.slice(pfad.lastIndexOf('node_modules/') + 13), version: p.version, lizenz: p.license ?? 'nicht angegeben' }))
  .sort((a, b) => a.name.localeCompare(b.name))

const zaehlung = new Map()
for (const z of zeilen) zaehlung.set(z.lizenz, (zaehlung.get(z.lizenz) ?? 0) + 1)

const md = `# Belegbrücke – Lizenzen Dritter

Erzeugt mit \`node scripts/lizenzen.mjs\` aus \`package-lock.json\` und \`vendor/artefakte.json\`; nicht von Hand ändern.

## Besonderheit SaxonJS

\`saxon-js\` (Prüfung, Ansicht) und \`xslt3\` (Kompilierung, nur Entwicklung) stehen unter der proprietären **Saxonica-Lizenz** (kostenlos). Nutzung und Weitergabe als Teil einer Anwendung sind erlaubt, wenn der Copyright-Hinweis beiliegt (\`node_modules/saxon-js/LICENSE.txt\`), kein Reverse Engineering erfolgt, nicht mit dem Namen Saxonica geworben wird und die Weitergabe nicht auf Seiten geschieht, deren Hauptzweck die Verteilung ist (Spezifikation 7.1). Vor einer Veröffentlichung der Belegbrücke ist die Lizenzfrage zu klären (offene Frage 9).

## Prüfartefakte

| Artefakt | Version | Lizenz |
| --- | --- | --- |
${artefakte.artefakte.map((a) => `| ${a.titel} | ${a.version} | ${a.lizenz} |`).join('\n')}

Lizenztexte in \`vendor/lizenzen/\`, Herkunft in \`vendor/LIZENZEN.md\`.

## Laufzeit-Abhängigkeiten (${zeilen.length} Pakete)

Lizenzen: ${[...zaehlung].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} (${n})`).join(', ')}.

| Paket | Version | Lizenz |
| --- | --- | --- |
${zeilen.map((z) => `| ${z.name} | ${z.version} | ${z.lizenz} |`).join('\n')}

Entwicklungswerkzeuge (Vite, TypeScript, Vitest, Playwright, axe, oxlint, xslt3) sind nicht Teil der ausgelieferten App; ihre Lizenzen stehen in \`package-lock.json\`.
`
await writeFile(new URL('../docs/lizenzen-dritter.md', import.meta.url), md)
console.log(`docs/lizenzen-dritter.md: ${zeilen.length} Pakete`)
