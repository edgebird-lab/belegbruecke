/**
 * Dateiablage (Spezifikation 7.5): Originale inhaltsadressiert unter originale/<sha[0:2]>/<sha>.<endung>,
 * Prüfberichte unter berichte/<beleg-id>/<n>.json. Schreiben atomar (Temporärdatei, fsync,
 * umbenennen), danach schreibgeschützt. Gleicher Hash → keine zweite Datei. Dateinamen aus
 * Uploads und Mails werden nie als Pfad benutzt.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, open, readdir, readFile, rename, unlink } from 'node:fs/promises'
import { dirname, join, normalize, relative, sep } from 'node:path'

export const ENDUNGEN = ['xml', 'pdf', 'jpg', 'png', 'eml'] as const
export type Endung = (typeof ENDUNGEN)[number]

const UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

export class AblageFehler extends Error {
  constructor(meldung: string) {
    super(meldung)
    this.name = 'AblageFehler'
  }
}

async function atomarSchreiben(ziel: string, bytes: Uint8Array): Promise<'neu' | 'vorhanden'> {
  await mkdir(dirname(ziel), { recursive: true })
  const tmp = `${ziel}.${randomBytes(6).toString('hex')}.tmp`
  const datei = await open(tmp, 'wx')
  try {
    await datei.writeFile(bytes)
    await datei.sync()
  } finally {
    await datei.close()
  }
  try {
    if (existsSync(ziel)) throw Object.assign(new Error('vorhanden'), { code: 'EEXIST' })
    await rename(tmp, ziel)
  } catch (e) {
    await unlink(tmp).catch(() => undefined)
    // Gleichzeitiger zweiter Upload derselben Datei: Ziel existiert schon
    if (existsSync(ziel)) return 'vorhanden'
    throw e
  }
  await chmod(ziel, 0o444)
  return 'neu'
}

export class Ablage {
  readonly wurzel: string

  constructor(wurzel: string) {
    this.wurzel = wurzel
  }

  /** Absoluter Pfad zu einem relativen Ablagepfad; wirft bei Pfaden außerhalb der Ablage. */
  absolut(pfad: string): string {
    const abs = normalize(join(this.wurzel, pfad))
    const rel = relative(this.wurzel, abs)
    if (rel === '' || rel.startsWith('..') || rel.includes(`..${sep}`) || /^[a-zA-Z]:/.test(rel) || !/^(originale|berichte|exporte|cache)[\\/]/.test(rel)) {
      throw new AblageFehler(`Unzulässiger Ablagepfad: ${pfad}`)
    }
    return abs
  }

  /** Original oder Roh-Mail inhaltsadressiert ablegen. */
  async speichereInhalt(bytes: Uint8Array, endung: Endung): Promise<{ sha256: string; pfad: string; neu: boolean }> {
    if (!ENDUNGEN.includes(endung)) throw new AblageFehler(`Unzulässige Endung: ${endung}`)
    const hash = sha256(bytes)
    const pfad = `originale/${hash.slice(0, 2)}/${hash}.${endung}`
    const ziel = this.absolut(pfad)
    if (existsSync(ziel)) {
      const vorhanden = sha256(new Uint8Array(await readFile(ziel)))
      if (vorhanden !== hash) throw new AblageFehler(`Ablage beschädigt: ${pfad} hat einen anderen Inhalt`)
      return { sha256: hash, pfad, neu: false }
    }
    const ergebnis = await atomarSchreiben(ziel, bytes)
    return { sha256: hash, pfad, neu: ergebnis === 'neu' }
  }

  /** Prüfbericht n eines Belegs ablegen; ein vorhandener Bericht wird nie überschrieben. */
  async speichereBericht(belegId: string, n: number, inhalt: string): Promise<{ sha256: string; pfad: string; bytes: number }> {
    if (!UUID.test(belegId) || !Number.isSafeInteger(n) || n < 1) throw new AblageFehler('Unzulässige Beleg-ID oder Berichtsnummer')
    const pfad = `berichte/${belegId}/${n}.json`
    const bytes = new TextEncoder().encode(inhalt)
    if (existsSync(this.absolut(pfad))) throw new AblageFehler(`Bericht ${pfad} existiert bereits`)
    await atomarSchreiben(this.absolut(pfad), bytes)
    return { sha256: sha256(bytes), pfad, bytes: bytes.length }
  }

  /** Datei eines Exportlaufs unter exporte/<lauf-id>/<name>; einmal schreiben, dann schreibgeschützt. */
  async speichereExport(laufId: string, name: string, bytes: Uint8Array): Promise<{ sha256: string; pfad: string; bytes: number }> {
    if (!UUID.test(laufId) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name)) throw new AblageFehler('Unzulässige Lauf-ID oder unzulässiger Dateiname')
    const pfad = `exporte/${laufId}/${name}`
    if (existsSync(this.absolut(pfad))) throw new AblageFehler(`Exportdatei ${pfad} existiert bereits`)
    await atomarSchreiben(this.absolut(pfad), bytes)
    return { sha256: sha256(bytes), pfad, bytes: bytes.length }
  }

  async lies(pfad: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(this.absolut(pfad)))
  }

  async hash(pfad: string): Promise<string | null> {
    const abs = this.absolut(pfad)
    if (!existsSync(abs)) return null
    return sha256(new Uint8Array(await readFile(abs)))
  }

  /** Alle Dateien unter originale/ oder berichte/ als relative Pfade mit „/“. */
  async alleDateien(bereich: 'originale' | 'berichte'): Promise<string[]> {
    const ordner = join(this.wurzel, bereich)
    if (!existsSync(ordner)) return []
    return (await readdir(ordner, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && !e.name.endsWith('.tmp'))
      .map((e) => relative(this.wurzel, join(e.parentPath, e.name)).split(sep).join('/'))
      .sort()
  }
}

/** Dateiendung zum MIME-Typ eines Originals. */
export function endungFuer(mime: string): Endung {
  switch (mime) {
    case 'application/xml':
      return 'xml'
    case 'application/pdf':
      return 'pdf'
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'message/rfc822':
      return 'eml'
    default:
      throw new AblageFehler(`Unbekannter MIME-Typ: ${mime}`)
  }
}
