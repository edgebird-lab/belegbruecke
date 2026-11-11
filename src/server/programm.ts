/**
 * Einstieg des Servers im Windows-Programm (Spezifikation 7.8, Weg A). Die Tauri-Hülle startet ihn
 * als Sidecar und spricht über die Standardkanäle mit ihm:
 *
 *   stdout  `BELEGBRUECKE-BEREIT <port> <token>`, sobald der Server auf 127.0.0.1:<port> lauscht.
 *           Der Port ist zufällig frei gewählt, das Token gilt einmal (sicherheit/programmtor.ts).
 *           Alle anderen Zeilen sind Protokoll.
 *   stdin   bleibt offen, solange die Hülle läuft. Schließt sie stdin (Fenster geschlossen, Hülle
 *           beendet oder abgestürzt), beendet sich der Server sauber: Postfach-Abruf, HTTP-Server,
 *           Prüf-Worker, Datenbank.
 *
 * Umgebung wie bei start.ts; BB_DATEN ist Pflicht, BB_PORT wird nicht verwendet.
 *
 *   BB_DATEN=… node src/server/programm.ts
 */
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { erzeugeProgrammtor } from './sicherheit/programmtor.ts'
import { optionenAusUmgebung, starteServer } from './start.ts'

export const BEREIT = 'BELEGBRUECKE-BEREIT'
const VERSUCHE = 3
const ABSCHALTEN_MS = 8_000

/** Freier Port auf 127.0.0.1, vom Betriebssystem vergeben. */
export function freierPort(): Promise<number> {
  return new Promise((ok, fehler) => {
    const s = createServer()
    s.once('error', fehler)
    s.listen(0, '127.0.0.1', () => {
      const adresse = s.address()
      const port = typeof adresse === 'object' && adresse ? adresse.port : 0
      s.close(() => (port ? ok(port) : fehler(new Error('Kein freier Port gefunden'))))
    })
  })
}

export async function starteProgramm() {
  if (!process.env.BB_DATEN) throw new Error('BB_DATEN fehlt: Das Programm gibt den Datenordner vor.')
  const tor = erzeugeProgrammtor()
  for (let versuch = 1; ; versuch++) {
    const port = await freierPort()
    const s = await starteServer({ ...optionenAusUmgebung(), port, programmtor: tor.middleware })
    try {
      await s.lauscht
      return { ...s, port, token: tor.token }
    } catch (e) {
      await s.beenden()
      // Zwischen Suche und Start hat ein anderes Programm den Port genommen: neuer Port
      if ((e as NodeJS.ErrnoException).code !== 'EADDRINUSE' || versuch >= VERSUCHE) throw e
    }
  }
}

// Direkt gestartet: Server starten, bereit melden, mit stdin beenden
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await starteProgramm()
  console.log(`Belegbrücke ${s.d.version} läuft auf ${s.url} (Daten: ${s.d.datenOrdner})`)
  process.stdout.write(`${BEREIT} ${s.port} ${s.token}\n`)
  let beendet = false
  const stopp = () => {
    if (beendet) return
    beendet = true
    // Hängt etwas beim Beenden, endet der Prozess trotzdem; SQLite mit WAL verträgt das
    setTimeout(() => process.exit(1), ABSCHALTEN_MS).unref()
    void s.beenden().then(
      () => process.exit(0),
      (e: unknown) => {
        console.error(e)
        process.exit(1)
      },
    )
  }
  process.stdin.on('end', stopp)
  process.stdin.on('close', stopp)
  process.stdin.on('error', stopp)
  process.stdin.resume()
  process.on('SIGINT', stopp)
  process.on('SIGTERM', stopp)
}
