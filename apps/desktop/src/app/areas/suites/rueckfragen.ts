// Open questions of room members, read from the backend's own state.
//
// A member that calls the `clarify` tool blocks inside its hidden room session
// (`Group: <room id>`) on a server→client request nobody received. The backend
// keeps that request open and reports it: `session.active_list` marks the session
// `waiting`, `session.events.since` lists its `open_requests`. The room shows and
// answers exactly that — never a line a model wrote into its reply.

import { activeGateway } from '@/store/gateway'

/** Title of a member's hidden room session (`tui_gateway/hosted_room_driver.py`). */
const RAUM_SITZUNG = /^Group: (.+)$/
/** Past every event: only the open requests are wanted, not a replay. */
const KEIN_VERLAUF = Number.MAX_SAFE_INTEGER

export interface Teilfrage {
  id: string
  frage: string
  auswahl: string[]
}

export interface Rueckfrage {
  /** Hosted room id the asking session belongs to. */
  raum: string
  sitzung: string
  /** Id of the open server request; the answer is addressed to it. */
  anfrage: string
  frage: string
  auswahl: string[]
  /** A batch (`questions`): every part is locked on its own, the last lock resolves the request. */
  teile: Teilfrage[]
}

interface LiveSitzung {
  id?: string
  status?: string
  title?: string
}

interface OffeneAnfrage {
  id?: unknown
  method?: unknown
  params?: Record<string, unknown>
}

const texte = (wert: unknown): string[] =>
  Array.isArray(wert) ? wert.filter((x): x is string => typeof x === 'string' && x.length > 0) : []

/** An `open_requests` entry as a question, or undefined when it is not a clarify request. */
export function rueckfrageAus(raum: string, sitzung: string, eintrag: OffeneAnfrage): Rueckfrage | undefined {
  if (eintrag.method !== 'clarify' || typeof eintrag.id !== 'string' || !eintrag.id) {
    return undefined
  }

  const params = eintrag.params ?? {}

  const teile = (Array.isArray(params.questions) ? params.questions : [])
    .map((q: Record<string, unknown>) => ({
      id: String(q?.qid ?? q?.id ?? ''),
      frage: String(q?.question ?? ''),
      auswahl: texte(q?.choices)
    }))
    .filter((t: Teilfrage) => t.id)

  return {
    raum,
    sitzung,
    anfrage: eintrag.id,
    frage: String(params.question ?? teile[0]?.frage ?? ''),
    auswahl: texte(params.choices),
    teile
  }
}

/** The room a live session row belongs to, when it is a member's session that waits for an answer. */
export const wartenderRaum = (zeile: LiveSitzung): string | undefined =>
  zeile.status === 'waiting' && zeile.id ? RAUM_SITZUNG.exec(String(zeile.title ?? '').trim())?.[1] : undefined

/** Every open question of a room member on this gateway. A backend that cannot say has none. */
export async function ladeRueckfragen(): Promise<Rueckfrage[]> {
  const gateway = activeGateway()

  if (!gateway) {
    return []
  }

  try {
    const { sessions = [] } = await gateway.request<{ sessions?: LiveSitzung[] }>('session.active_list', {})
    const wartend = sessions.flatMap(s => (wartenderRaum(s) ? [{ raum: wartenderRaum(s)!, sitzung: s.id! }] : []))

    const seiten = await Promise.all(
      wartend.map(async ({ raum, sitzung }) => {
        try {
          const antwort = await gateway.request<{ open_requests?: OffeneAnfrage[] }>('session.events.since', {
            session_id: sitzung,
            last_seen: KEIN_VERLAUF
          })

          return (antwort.open_requests ?? []).flatMap(e => rueckfrageAus(raum, sitzung, e) ?? [])
        } catch {
          return []
        }
      })
    )

    return seiten.flat()
  } catch {
    return []
  }
}

/** Answer an open question: one answer for a single question, one per part for a batch. */
export async function rueckfrageBeantworten(
  frage: Rueckfrage,
  antwort: string | Readonly<Record<string, string>>
): Promise<void> {
  const gateway = activeGateway()

  if (!gateway) {
    throw new Error('Hermes gateway unavailable')
  }

  if (!frage.teile.length) {
    await gateway.request('request.answer', {
      id: frage.anfrage,
      result: { answer: typeof antwort === 'string' ? antwort : '' }
    })

    return
  }

  for (const teil of frage.teile) {
    await gateway.request('clarify.lock', {
      request_id: frage.anfrage,
      question_id: teil.id,
      answer: typeof antwort === 'string' ? antwort : (antwort[teil.id] ?? '')
    })
  }
}
