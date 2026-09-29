// Suites: one room per undertaking. A suite is a chat session on the
// `raumleiter` profile — the room lead sits in every suite from the start,
// with the primary and fallback model that profile carries. The list is the
// backend's truth: no seeded rooms, zero suites until someone opens one.

import { atom } from 'nanostores'

import { PROMPT_SUBMIT_REQUEST_TIMEOUT_MS } from '@/api/client'
import { requestGatewayForProfile } from '@/store/gateway'
import { $workingSessionIds } from '@/store/session-states'

import { $kapazitaet, $mensch, $uebungslaeufe } from '../admin/betrieb-store'
import { setArea } from '../store'

import { ansatzFuer, freieUebungen, uebungsEroeffnung, uebungsTitel } from './uebung'

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
/** The suite the person is standing in; null means the lobby. */
export const $aktiveSuite = atom<Suite | null>(null)
/** The lobby's form is open (the Vorzimmer's „Neue Suite“ sets it before switching areas). */
export const $neueSuiteOffen = atom(false)

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

const anfrage = <T>(
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
  spawnPriority: 'background' | 'foreground' = 'foreground'
): Promise<T> =>
  requestGatewayForProfile<T>(SUITE_PROFIL, method, { profile: SUITE_PROFIL, ...params }, timeoutMs, undefined, {
    spawnPriority
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

/** Walk into a suite: the room mounts its chat and its four zones; the lobby stays behind. */
export async function oeffneSuite(suite: Pick<Suite, 'id' | 'resolvedId'> & Partial<Suite>): Promise<void> {
  $aktiveSuite.set({ id: suite.id, resolvedId: suite.resolvedId, titel: suite.titel ?? suite.id })
  setArea('suites')
}

/** Back to the lobby. The session keeps running on the backend. */
export function verlasseSuite(): void {
  $aktiveSuite.set(null)
}

export interface Eroeffnung {
  annahmen?: string
  /** A standing order: the room never rests (see TAKT in the room lead's SOUL). */
  takt?: string
}

/** The room lead reads the room protocol: name and goal, in the words its SOUL expects. */
export function eroeffnungsText(name: string, ziel: string, { annahmen, takt }: Eroeffnung = {}): string {
  const lines = [`RAUM: ${name.trim()}`]

  if (ziel.trim()) {
    lines.push(`ZIEL: ${ziel.trim()}`)
  }

  if (annahmen?.trim()) {
    lines.push(`ANNAHMEN: ${annahmen.trim()}`)
  }

  if (takt?.trim()) {
    lines.push(`TAKT: ${takt.trim()}`)
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

interface RaumAnlage {
  model?: string
  provider?: string
  spawnPriority?: 'background' | 'foreground'
}

/**
 * One room on the backend: exact-title lookup first (titles are unique per
 * profile, so a second attempt adopts instead of forking), then create and
 * title (which materialises the lazy row). `neu` says whether the room is
 * fresh and still needs its brief.
 */
async function raumAnlegen(
  titel: string,
  { model, provider, spawnPriority = 'foreground' }: RaumAnlage = {}
): Promise<{ neu: boolean; runtime?: string; suite: Suite }> {
  const vorhanden = await suiteMitTitel(titel)

  if (vorhanden) {
    return { neu: false, suite: vorhanden }
  }

  const created = await anfrage<SessionCreateResult>(
    'session.create',
    {
      follow_profile_config: true,
      source: SUITE_QUELLE,
      title: titel,
      ...(model ? { model, provider } : {})
    },
    undefined,
    spawnPriority
  )

  const runtime = created?.session_id
  const stored = created?.stored_session_id

  if (!runtime || !stored) {
    throw new Error('session.create returned no session id')
  }

  try {
    await anfrage('session.title', { session_id: runtime, title: titel }, undefined, spawnPriority)
  } catch (error) {
    if (/already in use/i.test(fehlertext(error))) {
      const gewinner = await suiteMitTitel(titel)

      if (gewinner) {
        return { neu: false, suite: gewinner }
      }
    }

    throw error
  }

  return { neu: true, runtime, suite: { id: stored, titel } }
}

/** The brief is the first turn; its answer arrives over the session socket, so it is not awaited. */
function auftragGeben(runtime: string, text: string, spawnPriority: 'background' | 'foreground' = 'foreground') {
  void anfrage('prompt.submit', { session_id: runtime, text }, PROMPT_SUBMIT_REQUEST_TIMEOUT_MS, spawnPriority).catch(
    error => $suitesFehler.set(fehlertext(error))
  )
}

/**
 * Practice runs beside the person's room, only while the house has room for
 * them: the person's own room never waits on them. A standing order is not
 * practised (repeating a permanent job N times teaches nothing).
 */
async function uebungenStarten(name: string, ziel: string): Promise<number> {
  const gewuenscht = $uebungslaeufe.get()
  const frei = freieUebungen(gewuenscht, $workingSessionIds.get().length, $kapazitaet.get())
  let gestartet = 0

  for (let nr = 2; nr < 2 + frei; nr += 1) {
    const ansatz = ansatzFuer(nr)

    try {
      const raum = await raumAnlegen(uebungsTitel(name, $mensch.get(), nr), {
        model: ansatz.model,
        provider: ansatz.provider,
        spawnPriority: 'background'
      })

      if (raum.neu && raum.runtime) {
        auftragGeben(raum.runtime, uebungsEroeffnung(nr, gewuenscht, ansatz, name, ziel), 'background')
        gestartet += 1
      }
    } catch {
      // A practice run that cannot start is skipped; the person's room is unaffected.
    }
  }

  return gestartet
}

export interface NeueSuiteOptionen extends Eroeffnung {
  /** False opens the room on the backend without walking into it (Vorzimmer handoff). */
  oeffnen?: boolean
}

/**
 * Open a new suite: the person's room first — created, titled, entered and
 * briefed before anything else — then, in the background, the practice runs.
 * Returns the person's suite, or undefined when nothing could be opened.
 */
export async function neueSuite(
  name: string,
  ziel: string,
  { oeffnen = true, ...eroeffnung }: NeueSuiteOptionen = {}
): Promise<Suite | undefined> {
  const titel = name.trim()

  if (!titel || $suiteEntsteht.get() === titel) {
    return undefined
  }

  $suiteEntsteht.set(titel)

  try {
    const raum = await raumAnlegen(titel)

    if (oeffnen) {
      await oeffneSuite(raum.suite)
    }

    if (raum.neu && raum.runtime) {
      auftragGeben(raum.runtime, eroeffnungsText(titel, ziel, eroeffnung))

      if (!eroeffnung.takt?.trim()) {
        void uebungenStarten(titel, ziel).then(gestartet => (gestartet ? ladeSuites() : undefined))
      }

      await ladeSuites()
    }

    return raum.suite
  } catch (error) {
    $suitesFehler.set(fehlertext(error))
    $suitesStatus.set($suites.get().length ? 'bereit' : 'fehler')

    return undefined
  } finally {
    $suiteEntsteht.set(null)
  }
}
