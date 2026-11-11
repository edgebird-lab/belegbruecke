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

Die Belegbrücke selbst: © 2026 Robin Olbricht – olbricht-digital. Alle Rechte vorbehalten. Die Programme dürfen kostenlos genutzt werden; eine offene Lizenz ist noch nicht gewählt. Die folgenden Fremdbestandteile stehen unter ihren eigenen Lizenzen.

## Besonderheit SaxonJS

\`saxon-js\` (Prüfung, Ansicht) und \`xslt3\` (Kompilierung, nur Entwicklung) stehen unter der proprietären **Saxonica-Lizenz** (kostenlos). Weitergabe ist erlaubt, unverändert und als Teil einer Anwendung, die SaxonJS nutzt, wenn der Copyright-Hinweis samt Haftungsausschluss beiliegt (\`node_modules/saxon-js/LICENSE.txt\`), kein Reverse Engineering erfolgt, nicht mit dem Namen Saxonica geworben wird und SaxonJS nicht auf eine Seite kopiert wird, deren Hauptzweck es ist, SaxonJS Dritten bereitzustellen (Spezifikation 7.1).

- **Repo:** enthält SaxonJS nicht; \`npm install\` lädt es von npm.
- **Windows-Programm:** SaxonJS liegt bytegleich aus dem npm-Paket in \`node_modules/saxon-js/\` neben dem Server-Bündel (mit \`LICENSE.txt\`), nicht mitgebündelt; \`npm run programm:server-test\` prüft das mit SHA-256, auch an der installierten Fassung. Verteilt wird es nur als Teil des Installers der Belegbrücke.

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

Entwicklungswerkzeuge (Vite, TypeScript, Vitest, Playwright, axe, oxlint, xslt3, rolldown, Tauri-CLI) sind nicht Teil der ausgelieferten App; ihre Lizenzen stehen in \`package-lock.json\`.

## Windows-Programm

Das Windows-Programm (Phase 7) liefert zusätzlich mit:

- **Node.js** (MIT, mit den Lizenzen seiner Bestandteile) als Laufzeit des Servers: \`belegbruecke-server.exe\` ist die unveränderte \`node.exe\` mit der Signatur der OpenJS Foundation.
- Die Laufzeit-Abhängigkeiten oben, mit rolldown gebündelt in \`server.mjs\`, \`worker.mjs\` und \`node_modules/axios/\`; SaxonJS unverändert (siehe oben). \`scripts/programm-server.mjs\` legt die Lizenztexte dieser Pakete (darunter der Saxonica-Hinweis), von Node.js und der Rust-Crates als \`LIZENZEN.txt\` neben das Bündel; die Lizenzen der KoSIT- und CEN-Artefakte liegen dort in \`vendor/lizenzen/\`, ihre Quellen in \`vendor/LIZENZEN.md\` (EUPL-1.2 Art. 5).
- Die Tauri-Hülle (Rust: \`tauri\`, \`tauri-plugin-single-instance\`, \`windows-sys\` und deren Abhängigkeiten, überwiegend MIT oder Apache-2.0, einzelne unter Unicode-3.0, BSD-3-Clause, Zlib und MPL-2.0). \`LIZENZEN.txt\` enthält für jedes Crate, das in \`belegbruecke.exe\` eingeht (aus \`cargo metadata\`), Lizenz, Lizenztexte und die Quelle auf crates.io. WebView2 gehört zu Windows und wird bei Bedarf über den Bootstrapper von Microsoft nachinstalliert.
`
await writeFile(new URL('../docs/lizenzen-dritter.md', import.meta.url), md)
console.log(`docs/lizenzen-dritter.md: ${zeilen.length} Pakete`)
