// Räume, Schritt 1: Who is speaking in a delegation.
//
// Hermes' delegation has no notion of a named child — a `delegate_task` child
// is "task 2 of 5" and nothing more. Tikki's room lead, however, addresses
// every task by the house protocol (`tikki/rollen/raumleiter/SOUL.md`):
//
//   AN: rechercheur
//   AUFGABE: …
//   FERTIG WENN: …
//   ABGABE: …
//
// That `AN:` line is the only place a role is named, so this module reads it
// back out of the goal text and resolves it against the troop catalogue. Pure
// text in, catalogue role out; the renderer decides what to do with a task
// that names no role.

import { KATALOG, type KatalogRolle } from '../admin/katalog'

export interface Auftrag {
  /** The role the task is addressed to, when the `AN:` line names one we know. */
  rolle?: KatalogRolle
  /** What the row shows instead of the raw protocol block: the AUFGABE paragraph, or the first line. */
  titel: string
}

const AN_LINE = /^[ \t]*AN:[ \t]*(?<rolle>[^\n]*?)[ \t]*$/im
// No `m` flag here: `$` must mean the end of the text, or a paragraph that wraps
// onto a second line is cut after its first.
const AUFGABE =
  /(?:^|\n)[ \t]*AUFGABE:[ \t]*(?<text>[\s\S]*?)(?=\n[ \t]*(?:FERTIG WENN|ABGABE|KONTEXT|AN):|\n[ \t]*\n|$)/i
const PROTOKOLL_LINE = /^[ \t]*(?:AN|AUFGABE|FERTIG WENN|ABGABE|KONTEXT):/i

/** Fold case, umlauts and punctuation so "Prüfer", "pruefer" and "PRÜFER" meet. */
export function rollenSchluessel(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '')
}

const byKey = new Map<string, KatalogRolle>()

for (const rolle of KATALOG) {
  for (const key of [rolle.slug, rolle.name, rolle.hermes_profil]) {
    byKey.set(rollenSchluessel(key), rolle)
  }
}

/** The catalogue role a free-text name refers to: slug, display name or profile name, forgiving about spelling. */
export function rolleAusName(name: string): KatalogRolle | undefined {
  const key = rollenSchluessel(name.replace(/\(.*$/, ''))

  return key ? byKey.get(key) : undefined
}

const einzeilig = (text: string): string => text.replace(/\s+/g, ' ').trim()

/** Read a delegated task the way the room protocol writes it. */
export function auftragAusText(text: string): Auftrag {
  const an = text.match(AN_LINE)
  const rolle = an?.groups ? rolleAusName(an.groups.rolle) : undefined
  const aufgabe = text.match(AUFGABE)

  if (aufgabe?.groups?.text.trim()) {
    return { rolle, titel: einzeilig(aufgabe.groups.text) }
  }

  const ersteZeile = text
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !PROTOKOLL_LINE.test(line))

  return { rolle, titel: ersteZeile ?? einzeilig(text) }
}

export type ErgebnisStatus = 'fertig' | 'fehler' | 'unvollstaendig'

export interface BotErgebnis {
  auftrag: Auftrag
  /** "1/3" for a batch task; absent for a single completion. */
  nummer?: string
  status: ErgebnisStatus
  /** The child's own report, markdown as it wrote it. */
  text: string
}

const BATCH_HEADER =
  /^--- (?<icon>[✓✗⚠]) TASK (?<nummer>\d+\/\d+)(?:: (?<goal>[\s\S]*?))? {2}\(status=(?<status>[^,)\n]*)[^\n]*\) ---\r?\n/gm
const TRANSCRIPT_FOOTER = /\n?Full live transcript \(complete tool\/assistant trace\): [^\n]*\n*/g
const ERFOLG = new Set(['completed', 'ok', 'success', 'done'])

const statusAusText = (status: string, truncated: boolean): ErgebnisStatus =>
  !ERFOLG.has(status.trim()) ? 'fehler' : truncated ? 'unvollstaendig' : 'fertig'

const bereinigt = (text: string): string => text.replace(TRANSCRIPT_FOOTER, '\n').trim()

function batchErgebnisse(envelope: string): BotErgebnis[] {
  const headers = [...envelope.matchAll(BATCH_HEADER)]

  return headers.map((header, index) => {
    const start = header.index! + header[0].length
    const end = index + 1 < headers.length ? headers[index + 1].index! : envelope.length
    const { icon, nummer, goal, status } = header.groups!

    return {
      auftrag: auftragAusText(goal ?? ''),
      nummer,
      status: icon === '✗' ? 'fehler' : icon === '⚠' ? 'unvollstaendig' : statusAusText(status, false),
      text: bereinigt(envelope.slice(start, end))
    }
  })
}

function zeile(envelope: string, label: string): string {
  const match = envelope.match(new RegExp(`^${label}:[ \\t]*(?<wert>[^\\n]*)`, 'm'))

  return match?.groups?.wert.trim() ?? ''
}

// The single-completion preamble puts the goal on one labelled line and the
// optional context/toolsets/role lines after it; a multi-line goal runs until
// the next labelled line.
function einzelZiel(envelope: string): string {
  const match = envelope.match(
    /(?:^|\n)Original goal:[ \t]*(?<goal>[\s\S]*?)(?=\n(?:Context you provided|Toolsets|Role|Status):|\n[ \t]*\n|$)/
  )

  return match?.groups?.goal.trim() ?? ''
}

/**
 * The per-child reports inside an async-delegation completion notice, or
 * `undefined` when the text is not one (a background process, a cron job).
 *
 * The producer's exact boundaries (`tools/process_registry_notifications.py`)
 * are the only thing parsed here; the model's preamble never reaches the room.
 */
export function botErgebnisse(envelope: string): BotErgebnis[] | undefined {
  if (envelope.startsWith('[ASYNC DELEGATION BATCH COMPLETE')) {
    const ergebnisse = batchErgebnisse(envelope)

    if (ergebnisse.length > 0) {
      return ergebnisse
    }

    const error = envelope.match(/^--- ERROR ---\r?\n(?<text>[\s\S]*)$/m)

    return error?.groups ? [{ auftrag: { titel: '' }, status: 'fehler', text: bereinigt(error.groups.text) }] : []
  }

  if (envelope.startsWith('[ASYNC DELEGATION TASK FAILED')) {
    const kopf = envelope.match(/task (?<nummer>\d+\/\d+)\]/)
    const body = envelope
      .split('\n')
      .filter(line => /^(Status|Error|Live transcript):/.test(line))
      .join('\n')

    return [
      {
        auftrag: auftragAusText(zeile(envelope, 'Task')),
        nummer: kopf?.groups?.nummer,
        status: 'fehler',
        text: bereinigt(body)
      }
    ]
  }

  if (envelope.startsWith('[ASYNC DELEGATION COMPLETE')) {
    const result = envelope.match(/^--- RESULT ---\r?\n(?<text>[\s\S]*)$/m)
    const statusLine = zeile(envelope, 'Status')
    const status = statusLine.split(/\s{2,}/)[0]

    return [
      {
        auftrag: auftragAusText(einzelZiel(envelope)),
        status: statusAusText(status, /TRUNCATED/.test(statusLine)),
        text: bereinigt(result?.groups?.text ?? '')
      }
    ]
  }

  return undefined
}
