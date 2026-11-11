/**
 * Kleiner IMAP-Testserver (IMAP4rev1 über TLS, nur im Speicher) für die Tests des Postfachs
 * (T-I1 bis T-I4) statt GreenMail, damit kein Java nötig ist. Kann genau das, was imapflow für die
 * Belegbrücke braucht: CAPABILITY, LOGIN, LIST, CREATE, SUBSCRIBE, SELECT/EXAMINE, FETCH und
 * UID FETCH (UID, FLAGS, RFC822.SIZE, BODY[]), UID MOVE, NOOP, CLOSE, LOGOUT. Nur für Tests.
 */
import tls from 'node:tls'
import type { AddressInfo } from 'node:net'

export interface Testnachricht {
  uid: number
  roh: Buffer
  flags: Set<string>
}

interface Postfach {
  nachrichten: Testnachricht[]
  naechsteUid: number
}

const CAPABILITY = 'IMAP4rev1 LITERAL+ MOVE UIDPLUS'
const TRENNER = '/'

export interface Testserveroptionen {
  benutzer: string
  passwort: string
  key: string
  cert: string
}

/** Zerlegt Argumente: Atome, "Zeichenketten" mit Maskierung und (Listen) als Rohtext. */
function argumente(text: string): string[] {
  const teile: string[] = []
  let i = 0
  while (i < text.length) {
    if (text[i] === ' ') {
      i++
      continue
    }
    if (text[i] === '"') {
      let wert = ''
      i++
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length) i++
        wert += text[i++]
      }
      i++
      teile.push(wert)
      continue
    }
    if (text[i] === '(') {
      let tiefe = 0
      const start = i
      do {
        if (text[i] === '(') tiefe++
        if (text[i] === ')') tiefe--
        i++
      } while (i < text.length && tiefe > 0)
      teile.push(text.slice(start, i))
      continue
    }
    const start = i
    while (i < text.length && text[i] !== ' ') {
      // Atome wie BODY.PEEK[HEADER.FIELDS (A B)] enthalten Leerzeichen in eckigen Klammern
      if (text[i] === '[') while (i < text.length && text[i] !== ']') i++
      i++
    }
    teile.push(text.slice(start, i))
  }
  return teile
}

function zitat(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Menge wie "1:*", "3", "1,4:6" gegen eine Obergrenze auflösen. */
function menge(text: string, hoechste: number): Set<number> {
  const ergebnis = new Set<number>()
  for (const teil of text.split(',')) {
    const [a, b] = teil.split(':')
    const von = a === '*' ? hoechste : Number(a)
    const bis = b === undefined ? von : b === '*' ? hoechste : Number(b)
    for (let n = Math.min(von, bis); n <= Math.max(von, bis); n++) ergebnis.add(n)
  }
  return ergebnis
}

export class ImapTestserver {
  readonly postfaecher = new Map<string, Postfach>([['INBOX', { nachrichten: [], naechsteUid: 1 }]])
  /** Anmeldungen (erfolgreich und fehlgeschlagen) für Tests */
  readonly anmeldungen: { benutzer: string; erfolg: boolean }[] = []
  private readonly server: tls.Server
  private readonly o: Testserveroptionen

  private constructor(o: Testserveroptionen) {
    this.o = o
    this.server = tls.createServer({ key: o.key, cert: o.cert }, (s) => this.sitzung(s))
  }

  static async starte(o: Testserveroptionen): Promise<ImapTestserver> {
    const s = new ImapTestserver(o)
    await new Promise<void>((ok) => s.server.listen(0, '127.0.0.1', ok))
    return s
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port
  }

  /** Nachricht in ein Postfach legen (Standard INBOX). */
  lege(roh: Buffer | string, postfach = 'INBOX'): number {
    const p = this.postfaecher.get(postfach) ?? this.legeAn(postfach)
    const uid = p.naechsteUid++
    p.nachrichten.push({ uid, roh: Buffer.isBuffer(roh) ? roh : Buffer.from(roh.replace(/\r?\n/g, '\r\n')), flags: new Set() })
    return uid
  }

  nachrichten(postfach = 'INBOX'): Testnachricht[] {
    return this.postfaecher.get(postfach)?.nachrichten ?? []
  }

  private legeAn(name: string): Postfach {
    const p = { nachrichten: [], naechsteUid: 1 }
    this.postfaecher.set(name, p)
    return p
  }

  async stoppe(): Promise<void> {
    await new Promise<void>((ok) => this.server.close(() => ok()))
  }

  private sitzung(socket: tls.TLSSocket) {
    let puffer = Buffer.alloc(0)
    let angemeldet = false
    let gewaehlt: string | null = null
    let befehl = ''
    let literalRest = 0
    const schreibe = (text: string | Buffer) => {
      if (!socket.destroyed) socket.write(text)
    }
    schreibe(`* OK [CAPABILITY ${CAPABILITY}] Testserver der Belegbruecke bereit\r\n`)

    const ausfuehren = (zeile: string) => {
      const leer = zeile.indexOf(' ')
      const tag = zeile.slice(0, leer)
      let rest = zeile.slice(leer + 1)
      let name = rest.split(' ')[0].toUpperCase()
      rest = rest.slice(name.length).trim()
      let uid = false
      if (name === 'UID') {
        uid = true
        name = rest.split(' ')[0].toUpperCase()
        rest = rest.slice(name.length).trim()
      }
      const args = argumente(rest)
      const ok = (text = `${name} erledigt`) => schreibe(`${tag} OK ${text}\r\n`)
      const nein = (text: string) => schreibe(`${tag} NO ${text}\r\n`)
      if (name === 'CAPABILITY') {
        schreibe(`* CAPABILITY ${CAPABILITY}\r\n`)
        return ok()
      }
      if (name === 'NOOP') return ok()
      if (name === 'LOGOUT') {
        schreibe('* BYE Auf Wiedersehen\r\n')
        ok()
        socket.end()
        return
      }
      if (name === 'LOGIN') {
        const erfolg = args[0] === this.o.benutzer && args[1] === this.o.passwort
        this.anmeldungen.push({ benutzer: args[0] ?? '', erfolg })
        if (!erfolg) return nein('[AUTHENTICATIONFAILED] Anmeldung abgelehnt')
        angemeldet = true
        return ok(`[CAPABILITY ${CAPABILITY}] angemeldet`)
      }
      if (!angemeldet) return schreibe(`${tag} BAD Bitte zuerst anmelden\r\n`)
      if (name === 'STATUS') {
        const p = this.postfaecher.get(args[0])
        if (!p) return nein('[NONEXISTENT] Postfach fehlt')
        schreibe(`* STATUS ${zitat(args[0])} (MESSAGES ${p.nachrichten.length} UIDNEXT ${p.naechsteUid} UIDVALIDITY 1)\r\n`)
        return ok()
      }
      if (name === 'LIST' || name === 'LSUB') {
        const muster = args[1] ?? ''
        if (muster === '') {
          schreibe(`* ${name} (\\Noselect) "${TRENNER}" ""\r\n`)
          return ok()
        }
        const re = new RegExp(`^${muster.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, `[^${TRENNER}]*`)}$`, 'i')
        for (const p of this.postfaecher.keys()) if (re.test(p)) schreibe(`* ${name} (\\HasNoChildren) "${TRENNER}" ${zitat(p)}\r\n`)
        return ok()
      }
      if (name === 'CREATE') {
        const pfad = args[0]
        if (this.postfaecher.has(pfad)) return nein('[ALREADYEXISTS] Postfach gibt es schon')
        this.legeAn(pfad)
        return ok()
      }
      if (name === 'SUBSCRIBE' || name === 'UNSUBSCRIBE') return ok()
      if (name === 'SELECT' || name === 'EXAMINE') {
        const p = this.postfaecher.get(args[0]) ?? (args[0]?.toUpperCase() === 'INBOX' ? this.postfaecher.get('INBOX') : undefined)
        if (!p) return nein('[NONEXISTENT] Postfach fehlt')
        gewaehlt = this.postfaecher.get(args[0]) ? args[0] : 'INBOX'
        schreibe('* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n')
        schreibe('* OK [PERMANENTFLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft \\*)] Markierungen\r\n')
        schreibe(`* ${p.nachrichten.length} EXISTS\r\n* 0 RECENT\r\n`)
        schreibe(`* OK [UIDVALIDITY 1] UIDs gueltig\r\n* OK [UIDNEXT ${p.naechsteUid}] naechste UID\r\n`)
        return ok(`[${name === 'SELECT' ? 'READ-WRITE' : 'READ-ONLY'}] ${name} erledigt`)
      }
      if (name === 'CLOSE' || name === 'UNSELECT') {
        gewaehlt = null
        return ok()
      }
      if (!gewaehlt) return schreibe(`${tag} BAD Kein Postfach gewaehlt\r\n`)
      const p = this.postfaecher.get(gewaehlt)!
      if (name === 'FETCH') {
        const hoechste = uid ? Math.max(0, ...p.nachrichten.map((n) => n.uid)) : p.nachrichten.length
        const auswahl = menge(args[0], hoechste)
        const teile = (args[1] ?? '').replace(/^\(|\)$/g, '').toUpperCase()
        p.nachrichten.forEach((n, i) => {
          const seq = i + 1
          if (!auswahl.has(uid ? n.uid : seq)) return
          const felder: (string | Buffer)[] = [`UID ${n.uid}`]
          if (/\bFLAGS\b/.test(teile)) felder.push(`FLAGS (${[...n.flags].join(' ')})`)
          if (/RFC822\.SIZE/.test(teile)) felder.push(`RFC822.SIZE ${n.roh.length}`)
          if (/BODY(\.PEEK)?\[\]|BINARY(\.PEEK)?\[\]|\bRFC822\b(?!\.)/.test(teile)) {
            felder.push(Buffer.concat([Buffer.from(`BODY[] {${n.roh.length}}\r\n`), n.roh]))
            if (!/PEEK/.test(teile)) n.flags.add('\\Seen')
          }
          const kopf = Buffer.from(`* ${seq} FETCH (`)
          const inhalt = felder.flatMap((f, j) => (j === 0 ? [Buffer.from(f)] : [Buffer.from(' '), Buffer.from(f)]))
          schreibe(Buffer.concat([kopf, ...inhalt, Buffer.from(')\r\n')]))
        })
        return ok()
      }
      if (name === 'MOVE' || name === 'COPY') {
        const ziel = this.postfaecher.get(args[1])
        if (!ziel) return nein('[TRYCREATE] Zielpostfach fehlt')
        const hoechste = uid ? Math.max(0, ...p.nachrichten.map((n) => n.uid)) : p.nachrichten.length
        const auswahl = menge(args[0], hoechste)
        const betroffen = p.nachrichten.filter((n, i) => auswahl.has(uid ? n.uid : i + 1))
        const neueUids = betroffen.map((n) => {
          const neu = ziel.naechsteUid++
          ziel.nachrichten.push({ uid: neu, roh: n.roh, flags: new Set(n.flags) })
          return neu
        })
        if (betroffen.length) schreibe(`* OK [COPYUID 1 ${betroffen.map((n) => n.uid).join(',')} ${neueUids.join(',')}] kopiert\r\n`)
        if (name === 'MOVE') {
          for (const n of betroffen) {
            const seq = p.nachrichten.indexOf(n) + 1
            p.nachrichten.splice(seq - 1, 1)
            schreibe(`* ${seq} EXPUNGE\r\n`)
          }
        }
        return ok()
      }
      if (name === 'STORE') {
        const hoechste = uid ? Math.max(0, ...p.nachrichten.map((n) => n.uid)) : p.nachrichten.length
        const auswahl = menge(args[0], hoechste)
        const flags = (args[2] ?? '').replace(/[()]/g, '').split(' ').filter(Boolean)
        for (const n of p.nachrichten.filter((x, i) => auswahl.has(uid ? x.uid : i + 1))) {
          if (args[1]?.startsWith('-')) for (const f of flags) n.flags.delete(f)
          else for (const f of flags) n.flags.add(f)
        }
        return ok()
      }
      if (name === 'EXPUNGE') {
        for (let i = p.nachrichten.length - 1; i >= 0; i--) {
          if (p.nachrichten[i].flags.has('\\Deleted')) {
            p.nachrichten.splice(i, 1)
            schreibe(`* ${i + 1} EXPUNGE\r\n`)
          }
        }
        return ok()
      }
      return schreibe(`${tag} BAD Unbekannter Befehl ${name}\r\n`)
    }

    socket.on('data', (daten: Buffer) => {
      puffer = Buffer.concat([puffer, daten])
      for (;;) {
        if (literalRest > 0) {
          if (puffer.length < literalRest) return
          // Literal als Zeichenkette in Anführungszeichen in den Befehl übernehmen
          befehl += zitat(puffer.subarray(0, literalRest).toString('utf8'))
          puffer = puffer.subarray(literalRest)
          literalRest = 0
        }
        const ende = puffer.indexOf('\r\n')
        if (ende < 0) return
        const zeile = puffer.subarray(0, ende).toString('utf8')
        puffer = puffer.subarray(ende + 2)
        const literal = /\{(\d+)(\+?)\}$/.exec(zeile)
        if (literal) {
          befehl += zeile.slice(0, literal.index)
          literalRest = Number(literal[1])
          if (!literal[2]) schreibe('+ weiter\r\n')
          continue
        }
        const vollstaendig = befehl + zeile
        befehl = ''
        try {
          ausfuehren(vollstaendig)
        } catch {
          schreibe(`${vollstaendig.split(' ')[0]} BAD Fehler im Testserver\r\n`)
        }
      }
    })
    socket.on('error', () => undefined)
  }
}
