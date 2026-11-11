// Schreibt docs/regelkatalog.md aus dem Klartext-Katalog (src/fach/klartext).
import { writeFile } from 'node:fs/promises'
import { regelkatalogMarkdown } from '../src/fach/klartext/doku.ts'

await writeFile(new URL('../docs/regelkatalog.md', import.meta.url), regelkatalogMarkdown())
console.log('docs/regelkatalog.md geschrieben')
