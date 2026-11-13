// Suites: one room per undertaking. A suite is a hosted Hermes group room
// (`gateway/hosted_rooms.py`): a member roster from the troop catalogue and an
// event log the gateway drives itself — the room keeps working while the app
// is closed. The app is one client of it, over the `groups.*` RPCs on the
// gateway the main chat uses; `tikki/werkzeuge/raeume.py` is the same client
// without a network. Conventions (ids, thread, name prefix, sender ids) are
// shared with it and must not drift.
//
// What a room needs from the person is backend STATE, never model text: pending
// approvals and failed turns from the room driver (`groups.state`), open
// questions from the members' sessions (`rueckfragen.ts`), schedules from
// Hermes cron (`tikki/auftraege.ts`). No line a model writes changes what the app does.

import { atom } from 'nanostores'

import { activeGateway } from '@/store/gateway'

import { $mensch } from '../admin/betrieb-store'
import { KATALOG, type KatalogRolle } from '../admin/katalog'
import { setArea } from '../store'

import { ladeRueckfragen, type Rueckfrage } from './rueckfragen'

/** The room lead: a message that addresses nobody goes to it, not to every member in turn. */
export const RAUMLEITER = 'raumleiter'
/** Every Tikki room carries this id prefix; foreign hosted rooms stay out of the list. */
export const RAUM_PRAEFIX = 'tikki-'
/** A room is one conversation: one thread for everyone. */
export const HAUPTFADEN = 'haupt'
/** Sender id of the person in the app (`groups.send` sets it server-side). */
export const ABSENDER_APP = 'desktop'
/** How many of the last messages a merged room inherits from each predecessor. */
export const VERSCHMELZEN_NACHRICHTEN = 12
/** How many rooms get their state read for the attention list on every refresh. */
const DETAIL_HOECHSTENS = 50
/** The log tail that tells whose turn is running; turn events are recent by nature. */
const SCHWEIF = 40

export interface Mitglied {
  member_id: string
  profile: string
  handle: string
  display_name?: string
}

export interface Suite {
  /** The hosted room id (`tikki-<slug>-<base36 ms>`). */
  id: string
  titel: string
  mitglieder: Mitglied[]
  /** `updated_at` as the backend reports it (seconds). */
  geaendert: number
  letzteSeq: number
  /** What the backend reports as waiting for the person in this room. */
  offen?: Offen
  /** The member whose turn is running right now. */
  arbeitet?: string
}

/** A room's open matters, each one a backend state the person can act on. */
export interface Offen {
  /** Pending approvals of members (`driver_status.pending_actions`, kind `approval`). */
  freigaben: Freigabe[]
  /** Turns that failed and can be retried (kind `retry`). */
  wiederholbar: Freigabe[]
  /** Open `clarify` questions of members. */
  rueckfragen: Rueckfrage[]
}

export const brauchtDich = (offen?: Offen): boolean =>
  Boolean(offen && offen.freigaben.length + offen.wiederholbar.length + offen.rueckfragen.length > 0)

export type SuitesStatus = 'idle' | 'laedt' | 'bereit' | 'fehler'

export const $suites = atom<Suite[]>([])
export const $suitesStatus = atom<SuitesStatus>('idle')
export const $suitesFehler = atom<string | null>(null)
/** Rooms that need the person: a pending approval, an open question or a failed turn. */
export const $suitesBrauchen = atom<string[]>([])
/** The suite whose creation is in flight, by name; guards a double click. */
export const $suiteEntsteht = atom<string | null>(null)
/** The suite the person is standing in; null means the lobby. */
export const $aktiveSuite = atom<Suite | null>(null)
/** The lobby's form is open (the Vorzimmer's „Neue Suite“ sets it before switching areas). */
export const $neueSuiteOffen = atom(false)

// ── Wire shapes ─────────────────────────────────────────────────────────────

export interface RaumZeile {
  room_id: string
  name: string
  members: Mitglied[]
  updated_at: number
  latest_seq?: number
}

export interface RaumEreignis {
  seq: number
  event_id: string
  kind: string
  actor: { kind: string; id: string; display_name?: string }
  payload: Record<string, unknown>
  created_at: number
}

export interface Freigabe {
  kind: string
  member_id?: string
  task_id?: string
  execution_generation?: number
  request_id?: string
  approval?: Record<string, unknown>
}

export interface Fahrstand {
  running?: boolean
  working?: boolean
  blocked?: boolean
  pending_actions?: Freigabe[]
}

interface LogSeite {
  events: RaumEreignis[]
  cursor: number
  latest_seq: number
  has_more: boolean
}

// ── Pure helpers (mirror tikki/werkzeuge/raeume.py) ─────────────────────────

/** NFKD ascii, non-alphanumerics folded to `-`, lowercase, at most 40 chars. */
export function raumSlug(text: string, laenge = 40): string {
  const roh = text
    .normalize('NFKD')
    .replace(/[\u0080-￿]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()

  return (roh || 'raum').slice(0, laenge).replace(/^-+|-+$/g, '')
}

/** The id of a new room: readable, unique, in the core's alphabet. */
export const raumId = (name: string, ms = Date.now()): string =>
  `${RAUM_PRAEFIX}${raumSlug(name)}-${Math.floor(ms).toString(36)}`

const alsMitglied = (r: KatalogRolle): Mitglied => ({
  member_id: r.slug,
  profile: r.hermes_profil,
  handle: r.slug,
  display_name: r.name
})

/**
 * Base crew (catalogue `im_raum_ab_start`) plus the chosen roles, each once, order kept; unknown
 * slugs are skipped. `raumleiter` names a clone (`klon_von: raumleiter`): the lead stays
 * `@raumleiter`, only its profile – model chain and turn queue – is another one.
 */
export function raumMitglieder(
  rollen: readonly string[] = [],
  katalog: readonly KatalogRolle[] = KATALOG,
  raumleiter?: string
): Mitglied[] {
  const slugs = [...katalog.filter(r => r.im_raum_ab_start).map(r => r.slug), ...rollen]
  const gesehen = new Set<string>()
  const aus: Mitglied[] = []
  const klon = raumleiter ? katalog.find(x => x.slug === raumleiter && x.klon_von === RAUMLEITER) : undefined

  for (const slug of slugs) {
    const r = katalog.find(x => x.slug === slug)

    if (r && !gesehen.has(slug)) {
      gesehen.add(slug)
      aus.push(slug === RAUMLEITER && klon ? { ...alsMitglied(r), profile: klon.hermes_profil } : alsMitglied(r))
    }
  }

  return aus
}

export interface Nachricht {
  seq: number
  /** `mensch` for the person, else the member id. */
  von: string
  /** Who spoke. Empty for a person nobody named — the view words that in its language. */
  name: string
  text: string
  zeit: number
  /** `(pass)`: Discussion silence, never shown. */
  still: boolean
  /**
   * Not typed by the person in the app: a role's tool, a schedule or the command line put it into
   * the room on the person's behalf. Read from the event's sender, never from its wording.
   */
  imAuftrag: boolean
}

export const MENSCH = 'mensch'
/** Hermes' own Discussion convention for "nothing to add" (`gateway/hosted_room_discussion.py`). */
const PASS = /^\(?\s*pass\s*\)?\.?$/i
/** The name both clients put in front of a `message.user` text (the core knows no names). */
const NAME_PRAEFIX = /^([^\s:@[\]]{1,40}):\s+([\s\S]*)$/

/** A log event as something said, or undefined for gateway and system kinds. */
export function nachrichtAus(event: RaumEreignis, members: readonly Mitglied[] = []): Nachricht | undefined {
  const text = String(event.payload.text ?? '')

  if (event.kind === 'message.user') {
    const sprecher = event.actor?.display_name?.trim()
    const m = NAME_PRAEFIX.exec(text)
    // The prefix is only the speaker's name when the sender says so (or says nothing, as the app's own sends do).
    const mitName = m && (!sprecher || sprecher === m[1])

    return {
      seq: event.seq,
      von: MENSCH,
      name: sprecher || (m ? m[1]! : ''),
      text: mitName ? m[2]! : text,
      zeit: event.created_at,
      still: PASS.test(text.trim()),
      imAuftrag: event.actor?.id !== ABSENDER_APP
    }
  }

  if (event.kind === 'message.member') {
    const kennung = String(event.payload.member_id ?? event.actor.id ?? '?')
    const mitglied = members.find(x => x.member_id === kennung)

    return {
      seq: event.seq,
      von: kennung,
      name: mitglied?.display_name || mitglied?.handle || kennung,
      text,
      zeit: event.created_at,
      still: !text.trim() || PASS.test(text.trim()),
      imAuftrag: false
    }
  }

  return undefined
}

/** The member whose turn began and has not ended. */
export function werArbeitet(events: readonly RaumEreignis[]): string | undefined {
  let offen: string | undefined

  for (const e of events) {
    if (e.kind === 'turn.started') {
      offen = String(e.payload.member_id ?? '') || undefined
    } else if (/^turn\.(settled|failed|cancelled|deferred)$/.test(e.kind)) {
      offen = undefined
    }
  }

  return offen
}

// ── Gateway ─────────────────────────────────────────────────────────────────

/** Every room RPC goes to the gateway the main chat uses; the rooms live in its shared state. */
function anfrage<T>(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<T> {
  const gateway = activeGateway()

  if (!gateway) {
    return Promise.reject(new Error('Hermes gateway unavailable'))
  }

  return timeoutMs === undefined ? gateway.request<T>(method, params) : gateway.request<T>(method, params, timeoutMs)
}

export function fehlertext(error: unknown): string {
  const text = String((error as { message?: string })?.message ?? error ?? '')

  return text.replace(/^Error invoking remote method '[^']+': /, '').replace(/^Error: /, '')
}

/** Whether an error says the room worker is not running on this gateway (code 4123). */
export const raumdienstFehlt = (error: unknown): boolean =>
  (error as { code?: number })?.code === 4123 || /worker is unavailable|driver is unavailable/i.test(fehlertext(error))

/** The base crew is not set up on this machine: `rollen-einrichten.sh` has not run (or not for these roles). */
export class RollenFehlenFehler extends Error {
  constructor(readonly profile: readonly string[]) {
    super(`Rollen fehlen auf diesem Rechner: ${profile.join(', ')}`)
    this.name = 'RollenFehlenFehler'
  }
}

/** The profiles a failed room creation misses – from our own check (also once stored as text) or from the backend's refusal. */
export const fehlendeRollen = (error: unknown): string[] => {
  if (error instanceof RollenFehlenFehler) {
    return [...error.profile]
  }

  const text = fehlertext(error)
  const eigene = /^Rollen fehlen auf diesem Rechner: (.+)$/.exec(text)

  return eigene ? eigene[1]!.split(', ') : [...text.matchAll(/profile '([^']+)' is not local/g)].map(m => m[1]!)
}

/** Profiles this gateway knows, or null when it cannot say (an older backend decides itself then). */
async function bekannteProfile(): Promise<Set<string> | null> {
  try {
    const res = await anfrage<{ profiles?: Array<{ name: string }> }>('profiles.list', { include_sessions: false })

    return Array.isArray(res?.profiles) ? new Set(res.profiles.map(p => p.name)) : null
  } catch {
    return null
  }
}

/**
 * The roster this machine can seat: chosen roles whose profile is missing stay away (the room still
 * opens), a missing base-crew profile is an error worth reading, and a missing clone profile hands
 * the lead back to the plain room lead.
 */
export function besetzbareMitglieder(
  rollen: readonly string[],
  profile: ReadonlySet<string> | null,
  raumleiter?: string,
  katalog: readonly KatalogRolle[] = KATALOG
): Mitglied[] {
  const klon = raumleiter && katalog.find(x => x.slug === raumleiter)
  const leiter = profile && klon && !profile.has(klon.hermes_profil) ? undefined : raumleiter
  const alle = raumMitglieder(rollen, katalog, leiter)

  if (!profile) {
    return alle
  }

  const grund = new Set(katalog.filter(r => r.im_raum_ab_start).map(r => r.slug))
  const fehlen = alle.filter(m => grund.has(m.member_id) && !profile.has(m.profile)).map(m => m.profile)

  if (fehlen.length) {
    throw new RollenFehlenFehler(fehlen)
  }

  return alle.filter(m => profile.has(m.profile))
}

const alsSuite = (row: RaumZeile): Suite => ({
  id: row.room_id,
  titel: (row.name || '').trim() || row.room_id,
  mitglieder: Array.isArray(row.members) ? row.members : [],
  geaendert: typeof row.updated_at === 'number' ? row.updated_at : 0,
  letzteSeq: typeof row.latest_seq === 'number' ? row.latest_seq : 0
})

/** Only Tikki's rooms, newest change first. */
export const suitenAusRaeumen = (rows: readonly RaumZeile[]): Suite[] =>
  rows
    .filter(row => String(row.room_id ?? '').startsWith(RAUM_PRAEFIX))
    .map(alsSuite)
    .sort((a, b) => b.geaendert - a.geaendert)

/** All events after `seit`, page by page. */
export async function ladeVerlauf(
  roomId: string,
  seit = 0,
  hoechstens = 5000
): Promise<{ events: RaumEreignis[]; cursor: number; latestSeq: number }> {
  const events: RaumEreignis[] = []
  let cursor = seit
  let latestSeq = seit

  while (events.length < hoechstens) {
    const seite = await anfrage<LogSeite>('groups.log', {
      room_id: roomId,
      since_seq: cursor,
      limit: Math.min(500, hoechstens - events.length)
    })

    events.push(...(seite.events ?? []))
    latestSeq = seite.latest_seq ?? latestSeq

    if (!seite.has_more || seite.cursor === cursor) {
      cursor = seite.cursor ?? cursor

      break
    }

    cursor = seite.cursor
  }

  return { events, cursor: Math.max(cursor, events.at(-1)?.seq ?? seit), latestSeq }
}

export const ladeStand = (roomId: string): Promise<{ room: RaumZeile; driver_status?: Fahrstand }> =>
  anfrage('groups.state', { room_id: roomId })

/** The room's tail, read only for the KIND of its events (whose turn is running). */
async function schweif(suite: Suite): Promise<RaumEreignis[]> {
  const seit = Math.max(0, suite.letzteSeq - SCHWEIF)
  const seite = await anfrage<LogSeite>('groups.log', { room_id: suite.id, since_seq: seit, limit: SCHWEIF + 1 })

  return seite.events ?? []
}

export interface SuiteStand {
  offen: Offen
  arbeitet?: string
}

/**
 * What the backend says about one room: the driver's pending actions, the members' open questions
 * and whose turn is running. Not a word of what was said in the room is read for it, so the answer
 * does not depend on how far back the log is read.
 */
export function suiteStand(
  suite: Pick<Suite, 'id'>,
  fahrstand: Fahrstand | undefined,
  rueckfragen: readonly Rueckfrage[] = [],
  events: readonly RaumEreignis[] = []
): SuiteStand {
  const anstehend = fahrstand?.pending_actions ?? []

  return {
    offen: {
      freigaben: anstehend.filter(a => a.kind === 'approval'),
      wiederholbar: anstehend.filter(a => a.kind === 'retry'),
      rueckfragen: rueckfragen.filter(r => r.raum === suite.id)
    },
    arbeitet: werArbeitet(events) ?? (fahrstand?.working ? RAUMLEITER : undefined)
  }
}

let ladeGeneration = 0

/** Read the state of the newest rooms and mark which need the person. Stale reads never win. */
async function verfeinern(suites: readonly Suite[], generation: number): Promise<void> {
  const rueckfragen = await ladeRueckfragen()

  const staende = await Promise.all(
    suites.slice(0, DETAIL_HOECHSTENS).map(async suite => {
      const [events, stand] = await Promise.all([
        schweif(suite).catch(() => []),
        ladeStand(suite.id).catch(() => undefined)
      ])

      return [suite.id, suiteStand(suite, stand?.driver_status, rueckfragen, events)] as const
    })
  )

  if (generation !== ladeGeneration) {
    return
  }

  const nachId = new Map(staende)

  $suites.set(
    $suites.get().map(suite => {
      const stand = nachId.get(suite.id)

      return stand ? { ...suite, offen: stand.offen, arbeitet: stand.arbeitet } : suite
    })
  )
  $suitesBrauchen.set(staende.filter(([, stand]) => brauchtDich(stand.offen)).map(([id]) => id))
}

/** The rooms, as the gateway has them. A thrown error is an error, never "no suites". */
export async function ladeSuites(): Promise<void> {
  // A refresh of a list that is on screen stays quiet; only the first read (or one after an error) shows as loading.
  if ($suitesStatus.get() !== 'bereit') {
    $suitesStatus.set('laedt')
  }

  const generation = ++ladeGeneration

  try {
    const result = await anfrage<{ rooms?: RaumZeile[] }>('groups.list', { limit: 200 })

    if (generation !== ladeGeneration) {
      return
    }

    const bekannt = new Map($suites.get().map(s => [s.id, s]))

    const suites = suitenAusRaeumen(result?.rooms ?? []).map(suite => {
      const alt = bekannt.get(suite.id)

      return alt ? { ...suite, offen: alt.offen, arbeitet: alt.arbeitet } : suite
    })

    $suites.set(suites)
    $suitesFehler.set(null)
    $suitesStatus.set('bereit')
    await verfeinern(suites, generation)
  } catch (error) {
    if (generation === ladeGeneration) {
      $suitesFehler.set(fehlertext(error))
      $suitesStatus.set('fehler')
    }
  }
}

/** Walk into a suite: the room mounts its log and its four zones; the lobby stays behind. */
export function oeffneSuite(suite: Suite): void {
  $aktiveSuite.set(suite)
  setArea('suites')
}

/** Back to the lobby. The room keeps running on the gateway. */
export function verlasseSuite(): void {
  $aktiveSuite.set(null)
}

export interface Eroeffnung {
  annahmen?: string
  /** A Hermes schedule (`every 1h`, `0 6 * * *`) on which the room is called up again. */
  takt?: string
}

/**
 * The person's first message in a new room: what they typed into the form, as they typed it.
 * No protocol — the room lead reads it like any other message.
 */
export function eroeffnungsText(ziel: string, { annahmen }: Eroeffnung = {}): string {
  return [ziel.trim(), annahmen?.trim()].filter(Boolean).join('\n\n')
}

const ereignisId = (): string => `tikki:${crypto.randomUUID().replace(/-/g, '')}`

/** One `message.user` into the room's main thread, text as given (the core knows no names). */
async function senden(roomId: string, text: string): Promise<RaumEreignis> {
  const result = await anfrage<{ event: RaumEreignis }>('groups.send', {
    room_id: roomId,
    event_id: ereignisId(),
    payload: { text, thread_id: HAUPTFADEN }
  })

  return result.event
}

/** Mentions as the core reads them (`hosted_room_discussion._MENTION_RE`). */
const ERWAEHNUNG = /@([A-Za-z0-9][A-Za-z0-9._:-]*)/g

/** Whether the text addresses a member of the room (or everyone); the core asks every member in turn otherwise. */
export const sprichtJemandenAn = (text: string, mitglieder: readonly Pick<Mitglied, 'handle'>[]): boolean => {
  const handles = new Set(['all', 'everyone', ...mitglieder.map(m => m.handle.toLowerCase())])

  return [...text.matchAll(ERWAEHNUNG)].some(m => handles.has(m[1]!.toLowerCase()))
}

/**
 * The person speaks: the name goes in front so several people stay apart in one room, and a
 * text that addresses nobody goes to the room lead — not to every member, one serial turn each.
 */
export const auftragGeben = (suite: Pick<Suite, 'id' | 'mitglieder'>, text: string): Promise<RaumEreignis> => {
  const wert = text.trim()

  return senden(
    suite.id,
    `${$mensch.get()}: ${sprichtJemandenAn(wert, suite.mitglieder) ? '' : `@${RAUMLEITER} `}${wert}`
  )
}

/** Start a failed turn again (`driver_status.pending_actions`, kind `retry`). */
export const wiederholen = (suite: Pick<Suite, 'id'>, aktion: Freigabe): Promise<unknown> =>
  anfrage('groups.retry', { room_id: suite.id, task_id: aktion.task_id ?? '' })

/** Answer one pending approval of a member in the room. */
export const freigeben = (suite: Pick<Suite, 'id'>, freigabe: Freigabe, choice: 'once' | 'deny'): Promise<unknown> =>
  anfrage('groups.approve', {
    room_id: suite.id,
    member_id: freigabe.member_id ?? '',
    task_id: freigabe.task_id ?? '',
    execution_generation: freigabe.execution_generation ?? 0,
    choice,
    request_id: freigabe.request_id ?? ''
  })

export const aufloesen = (suite: Pick<Suite, 'id'>): Promise<unknown> =>
  anfrage('groups.disband', { room_id: suite.id })

export const umbenennen = async (suite: Pick<Suite, 'id'>, name: string): Promise<void> => {
  await anfrage('groups.rename', { room_id: suite.id, event_id: `tikki-name:${crypto.randomUUID()}`, name })
  await ladeSuites()
}

/**
 * One room on the gateway: an existing room of exactly this name is adopted
 * (a repeated handoff is a no-op), else it is created with the base crew and
 * the chosen roles. `neu` says whether the room still needs its brief.
 */
async function raumAnlegen(
  titel: string,
  rollen: readonly string[] = [],
  raumleiter?: string
): Promise<{ neu: boolean; suite: Suite }> {
  // Always against the gateway's list as it is now: a room another surface (Tikki's `raum` tool,
  // the command line) opened since the last refresh must be adopted, not created a second time.
  const liste = await anfrage<{ rooms?: RaumZeile[] }>('groups.list', { limit: 200 })
  const vorhanden = suitenAusRaeumen(liste?.rooms ?? []).find(s => s.titel === titel)

  if (vorhanden) {
    return { neu: false, suite: vorhanden }
  }

  const profile = await bekannteProfile()

  const erzeugen = (leiter?: string) =>
    anfrage<{ room: RaumZeile }>('groups.create', {
      room_id: raumId(titel),
      name: titel,
      members: besetzbareMitglieder(rollen, profile, leiter)
    })

  // Without a profile list, a backend set up before the clones existed rejects the unknown profile:
  // the room lead itself leads then.
  const created = await (raumleiter && !profile ? erzeugen(raumleiter).catch(() => erzeugen()) : erzeugen(raumleiter))

  if (!created?.room?.room_id) {
    throw new Error('groups.create returned no room')
  }

  return { neu: true, suite: alsSuite(created.room) }
}

export interface NeueSuiteOptionen extends Eroeffnung {
  /** Catalogue roles at the table from the start, besides the base crew. */
  rollen?: readonly string[]
  /** Room-lead clone (catalogue `klon_von: raumleiter`) that leads the person's room; empty = the room lead itself. */
  raumleiter?: string
  /** Creates the Hermes schedule for the room; the lobby passes `raumZeitplanAnlegen` (tikki/auftraege.ts). */
  zeitplanAnlegen?: (raum: { id: string; titel: string }, plan: string) => Promise<void>
}

/**
 * Open a new suite from the form the person filled in: the room is created and entered, what they
 * wrote as the goal is their first message, and a chosen rhythm becomes a Hermes schedule.
 * Returns the suite, or undefined when nothing could be opened.
 */
export async function neueSuite(
  name: string,
  ziel: string,
  { rollen = [], raumleiter, zeitplanAnlegen, ...eroeffnung }: NeueSuiteOptionen = {}
): Promise<Suite | undefined> {
  const titel = name.trim()

  if (!titel || $suiteEntsteht.get() === titel) {
    return undefined
  }

  $suiteEntsteht.set(titel)

  try {
    const raum = await raumAnlegen(titel, rollen, raumleiter)

    if (raum.neu) {
      $suites.set([raum.suite, ...$suites.get()])
    }

    oeffneSuite(raum.suite)

    if (raum.neu) {
      const text = eroeffnungsText(ziel, eroeffnung)
      const melden = (error: unknown) => $suitesFehler.set(fehlertext(error))

      if (text) {
        void auftragGeben(raum.suite, text).catch(melden)
      }

      if (eroeffnung.takt?.trim() && zeitplanAnlegen) {
        void zeitplanAnlegen(raum.suite, eroeffnung.takt).catch(melden)
      }
    }

    return raum.suite
  } catch (error) {
    $suitesFehler.set(fehlertext(error))

    return undefined
  } finally {
    $suiteEntsteht.set(null)
  }
}

/** The last words of a room as a quote, for a merged room's opening. */
export function zusammenfassung(
  suite: Suite,
  messages: readonly Nachricht[],
  anzahl = VERSCHMELZEN_NACHRICHTEN
): string {
  const letzte = messages.filter(m => !m.still).slice(-anzahl)

  return [
    `## ${suite.titel}`,
    ...(letzte.length
      ? // Room content, in the house language like the rest of this text (not a label).
        letzte.map(n => `- ${n.name || 'Mensch'}: ${n.text.split(/\s+/).join(' ').slice(0, 600)}`)
      : ['- (noch nichts gesagt)'])
  ].join('\n')
}

/** What the merged room starts with: where it comes from and what was last said there (as `raeume.py`). */
export const verschmelzenText = (a: Suite, b: Suite, standA: string, standB: string): string =>
  `Dieser Raum ist aus „${a.titel}“ und „${b.titel}“ zusammengelegt. ` +
  `Das wurde dort zuletzt gesagt:\n\n${standA}\n\n${standB}`

const gleich = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * Members of both rooms as one roster the core accepts: every member id, every @-handle and every
 * profile once, first room first. Two rooms led by different room-lead clones both seat a member
 * `raumleiter` (with another profile); the merged room keeps the first room's lead.
 */
export function vereinteMitglieder(a: readonly Mitglied[], b: readonly Mitglied[]): Mitglied[] {
  const aus: Mitglied[] = []

  for (const m of [...a, ...b]) {
    const doppelt = aus.some(
      x => gleich(x.member_id, m.member_id) || gleich(x.handle, m.handle) || gleich(x.profile, m.profile)
    )

    if (!doppelt) {
      aus.push({ member_id: m.member_id, profile: m.profile, handle: m.handle, display_name: m.display_name })
    }
  }

  return aus
}

const nachrichtenVon = async (suite: Suite): Promise<Nachricht[]> => {
  const { events } = await ladeVerlauf(suite.id)

  return events.map(e => nachrichtAus(e, suite.mitglieder)).filter((m): m is Nachricht => m !== undefined)
}

/**
 * Two rooms become one: members united, the last words of both as the
 * opening, the old rooms disbanded. The core cannot change a roster, hence a
 * new room; the members' sessions from the old rooms remain as memory.
 * A failure leaves both rooms as they are and is returned in `$suitesFehler` for the room to show.
 */
export async function verschmelzen(a: Suite, b: Suite): Promise<Suite | undefined> {
  const titel = `${a.titel} + ${b.titel}`

  if ($suiteEntsteht.get() || a.id === b.id) {
    return undefined
  }

  $suiteEntsteht.set(titel)
  $suitesFehler.set(null)

  try {
    const [na, nb] = await Promise.all([nachrichtenVon(a), nachrichtenVon(b)])

    const created = await anfrage<{ room: RaumZeile }>('groups.create', {
      room_id: raumId(titel),
      name: titel,
      members: vereinteMitglieder(a.mitglieder, b.mitglieder)
    })

    const neu = alsSuite(created.room)

    await auftragGeben(neu, verschmelzenText(a, b, zusammenfassung(a, na), zusammenfassung(b, nb)))
    await Promise.all([aufloesen(a), aufloesen(b)])
    $suites.set([neu, ...$suites.get().filter(s => s.id !== a.id && s.id !== b.id)])
    oeffneSuite(neu)
    void ladeSuites()

    return neu
  } catch (error) {
    $suitesFehler.set(fehlertext(error))

    return undefined
  } finally {
    $suiteEntsteht.set(null)
  }
}
