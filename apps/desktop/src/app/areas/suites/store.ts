// Suites: one room per undertaking. A suite is a chat session on the
// `raumleiter` profile — the room lead sits in every suite from the start,
// with the primary and fallback model that profile carries. The list is the
// backend's truth: no seeded rooms, zero suites until someone opens one.

import { host } from '@hermes/plugin-sdk'
import { atom } from 'nanostores'

import { PROMPT_SUBMIT_REQUEST_TIMEOUT_MS } from '@/api/client'
import { requestGatewayForProfile } from '@/store/gateway'

import { setArea } from '../store'

/** The Hermes profile every suite lives on (see tikki/rollen/KATALOG.json). */
export const SUITE_PROFIL = 'raumleiter'
/** Marks the sessions that are suites, so a Bot Chat on the same profile is not one. */
export const SUITE_QUELLE = 'tikki-suite'

export interface Suite {
  id: string
  /** Live tip of a compressed lineage, when the backend reports one. */
  resolvedId?: string
  titel: string
  vorschau?: string
  gestartet?: number
  nachrichten?: number
}

export type SuitesStatus = 'idle' | 'laedt' | 'bereit' | 'fehler'

export const $suites = atom<Suite[]>([])
export const $suitesStatus = atom<SuitesStatus>('idle')
export const $suitesFehler = atom<string | null>(null)
/** The suite whose creation is in flight, by name; guards a double click. */
export const $suiteEntsteht = atom<string | null>(null)

interface SessionListRow {
  id: string
  resolved_id?: string
  title?: string
  preview?: string
  started_at?: number
  message_count?: number
  source?: string
}

interface SessionCreateResult {
  session_id?: string
  stored_session_id?: string
}

const anfrage = <T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T> =>
  requestGatewayForProfile<T>(SUITE_PROFIL, method, { profile: SUITE_PROFIL, ...params }, timeoutMs, undefined, {
    spawnPriority: 'foreground'
  })

const alsSuite = (row: SessionListRow): Suite => ({
  id: row.id,
  resolvedId: row.resolved_id || undefined,
  titel: (row.title || '').trim() || row.id,
  vorschau: row.preview || undefined,
  gestartet: typeof row.started_at === 'number' ? row.started_at : undefined,
  nachrichten: typeof row.message_count === 'number' ? row.message_count : undefined
})

/** `session.list` has no profile or hidden field; the source is how a suite is told apart. */
export const suitenAusZeilen = (rows: readonly SessionListRow[]): Suite[] =>
  rows.filter(row => row.source === SUITE_QUELLE).map(alsSuite)

export function fehlertext(error: unknown): string {
  const text = String((error as { message?: string })?.message ?? error ?? '')

  return text.replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
}

/** Whether an error says the room lead profile does not exist on this backend. */
export const profilFehlt = (error: unknown): boolean =>
  /profile .*does not exist|ProfileUnavailable/i.test(fehlertext(error))

/** The history, as the backend has it. A thrown error is an error, never "no suites". */
export async function ladeSuites(): Promise<void> {
  $suitesStatus.set('laedt')

  try {
    const result = await anfrage<{ sessions?: SessionListRow[] }>('session.list', { limit: 200, include_hidden: true })

    $suites.set(suitenAusZeilen(result?.sessions ?? []))
    $suitesFehler.set(null)
    $suitesStatus.set('bereit')
  } catch (error) {
    $suitesFehler.set(fehlertext(error))
    $suitesStatus.set('fehler')
  }
}

/** Walk into a suite: its chat becomes the Tikki layer's session. */
export async function oeffneSuite(suite: Pick<Suite, 'id' | 'resolvedId'>): Promise<void> {
  await host.openSession(suite.resolvedId || suite.id, {
    awaitHydration: true,
    forceResume: true,
    intent: 'main',
    keepAllProfilesScope: true,
    profile: SUITE_PROFIL
  })
  setArea('tikki')
}

/** The room lead reads the room protocol: name and goal, in the words its SOUL expects. */
export function eroeffnungsText(name: string, ziel: string): string {
  const lines = [`RAUM: ${name.trim()}`]

  if (ziel.trim()) {
    lines.push(`ZIEL: ${ziel.trim()}`)
  }

  lines.push('Bitte plane die erste Runde und melde dich im Raum.')

  return lines.join('\n')
}

async function suiteMitTitel(name: string): Promise<Suite | undefined> {
  const result = await anfrage<{ sessions?: SessionListRow[] }>('session.list', {
    include_hidden: true,
    title: name
  })

  return suitenAusZeilen(result?.sessions ?? [])[0]
}

/**
 * Open a new suite: an exact-title lookup first (titles are unique per
 * profile, so a second click adopts instead of forking), then create, title
 * (which materialises the lazy row), open, and only then hand the room lead
 * its brief so the reply streams into the mounted chat.
 */
export async function neueSuite(name: string, ziel: string): Promise<void> {
  const titel = name.trim()

  if (!titel || $suiteEntsteht.get()) {
    return
  }

  $suiteEntsteht.set(titel)

  try {
    const vorhanden = await suiteMitTitel(titel)

    if (vorhanden) {
      await oeffneSuite(vorhanden)

      return
    }

    const created = await anfrage<SessionCreateResult>('session.create', {
      follow_profile_config: true,
      source: SUITE_QUELLE,
      title: titel
    })
    const runtime = created?.session_id
    const stored = created?.stored_session_id

    if (!runtime || !stored) {
      throw new Error('session.create returned no session id')
    }

    try {
      await anfrage('session.title', { session_id: runtime, title: titel })
    } catch (error) {
      if (/already in use/i.test(fehlertext(error))) {
        const gewinner = await suiteMitTitel(titel)

        if (gewinner) {
          await oeffneSuite(gewinner)

          return
        }
      }

      throw error
    }

    await oeffneSuite({ id: stored })
    // The brief is the first turn; its answer arrives over the session socket,
    // so the request itself is not awaited beyond the gateway's own deadline.
    void anfrage(
      'prompt.submit',
      { session_id: runtime, text: eroeffnungsText(titel, ziel) },
      PROMPT_SUBMIT_REQUEST_TIMEOUT_MS
    ).catch(error => $suitesFehler.set(fehlertext(error)))
    await ladeSuites()
  } catch (error) {
    $suitesFehler.set(fehlertext(error))
    $suitesStatus.set($suites.get().length ? 'bereit' : 'fehler')
  } finally {
    $suiteEntsteht.set(null)
  }
}
