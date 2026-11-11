/**
 * Test-E-Mails (.eml) mit Anhängen, selbst erzeugt und ohne echte Personendaten (Spezifikation 9.1).
 * Die Anhänge stammen aus der KoSIT-Testsuite und den eigenen ZUGFeRD-Testdateien.
 */
export interface Testanhang {
  name: string
  typ: string
  inhalt: Uint8Array
}

export interface Testmail {
  von?: string
  an?: string
  betreff: string
  messageId: string
  datum?: Date
  text?: string
  anhaenge: Testanhang[]
}

function base64Zeilen(b: Uint8Array): string {
  return (Buffer.from(b).toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/** Baut eine MIME-Nachricht (multipart/mixed) mit CR LF. */
export function baueMail(m: Testmail): Buffer {
  const grenze = `----=_Belegbruecke_${m.messageId.replace(/\W/g, '')}`
  const datum = (m.datum ?? new Date('2026-11-10T08:00:00Z')).toUTCString().replace('GMT', '+0000')
  const teile = [
    `From: ${m.von ?? 'Rechnungsstelle <rechnung@lieferant.example>'}`,
    `To: ${m.an ?? 'eingang@firma.example'}`,
    `Subject: ${m.betreff}`,
    `Message-ID: ${m.messageId}`,
    `Date: ${datum}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${grenze}"`,
    '',
    `--${grenze}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    m.text ?? 'Guten Tag, anbei die Rechnung. (Testnachricht der Belegbrücke)',
  ]
  for (const a of m.anhaenge) {
    teile.push(`--${grenze}`, `Content-Type: ${a.typ}; name="${a.name}"`, `Content-Disposition: attachment; filename="${a.name}"`, 'Content-Transfer-Encoding: base64', '', base64Zeilen(a.inhalt))
  }
  teile.push(`--${grenze}--`, '')
  return Buffer.from(teile.join('\r\n'), 'utf8')
}
