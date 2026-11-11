import { chmodSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function loesche(ordner: string): boolean {
  try {
    for (const e of readdirSync(ordner, { recursive: true, withFileTypes: true })) if (e.isFile()) chmodSync(join(e.parentPath, e.name), 0o666)
    rmSync(ordner, { recursive: true, force: true })
    return true
  } catch {
    // Der Server hält die Datenbank noch offen; der nächste Lauf räumt auf
    return false
  }
}

/** Datenordner früherer Läufe löschen (Originale sind schreibgeschützt und werden vorher freigegeben). */
export function raeumeAlteAuf(ausser?: string) {
  for (const name of readdirSync(tmpdir())) {
    const ordner = join(tmpdir(), name)
    if (/^bb-e2e-/.test(name) && ordner !== ausser) loesche(ordner)
  }
}

/** Nach dem Lauf: so gut es geht; der Server läuft unter Umständen noch. */
export default function aufraeumen() {
  const ordner = process.env.BB_E2E_DATEN
  if (ordner && existsSync(ordner) && /bb-e2e-/.test(ordner)) loesche(ordner)
}
