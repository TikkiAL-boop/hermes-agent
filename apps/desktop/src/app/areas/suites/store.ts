// Suites: one room per undertaking. A suite is a hosted Hermes group room
// (`gateway/hosted_rooms.py`): a member roster from the troop catalogue and an
// event log the gateway drives itself — the room keeps working while the app
// is closed. The app is one client of it, over the `groups.*` RPCs on the
// gateway the main chat uses; `tikki/werkzeuge/raeume.py` is the same client
// without a network. Conventions (ids, thread, name prefix, room-lead lines)
// are shared with it and must not drift.

import { atom } from 'nanostores'

import { activeGateway } from '@/store/gateway'

import { $kapazitaet, $mensch, $uebungslaeufe } from '../admin/betrieb-store'
import { KATALOG, type KatalogRolle } from '../admin/katalog'
import { setArea } from '../store'

import { ansatzFuer, freieUebungen, uebungsEroeffnung, uebungsTitel } from './uebung'

/** The room lead: the member every room-lead convention (`STAND:`, `BRAUCHE:` …) is read from. */
export const RAUMLEITER = 'raumleiter'
/** Every Tikki room carries this id prefix; foreign hosted rooms stay out of the list. */
export const RAUM_PRAEFIX = 'tikki-'
/** A room is one conversation: one thread for the person, the schedule and the doors. */
export const HAUPTFADEN = 'haupt'
/** How many of the last messages a merged room inherits from each predecessor. */
export const VERSCHMELZEN_NACHRICHTEN = 12
/** How many rooms get their tail read for the attention list on every refresh. */
const DETAIL_HOECHSTENS = 50
/** The log tail that is enough to read the room lead's latest lines. */
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
  /** The room lead's open `BRAUCHE:` — it waits for the person. */
  brauche?: string
  /** The room lead reported `FERTIG:` and nobody has spoken since. */
  fertig?: boolean
  /** The member whose turn is running right now. */
  arbeitet?: string
}

export type SuitesStatus = 'idle' | 'laedt' | 'bereit' | 'fehler'

export const $suites = atom<Suite[]>([])
export const $suitesStatus = atom<SuitesStatus>('idle')
export const $suitesFehler = atom<string | null>(null)
/** Rooms that need the person: an open `BRAUCHE:` or a pending approval. */
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
  actor: { kind: string; id: string }
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
  name: string
  text: string
  zeit: number
  /** `(pass)`: Discussion silence, never shown. */
  still: boolean
  /** Put into the room by the backend (schedule, door, watchman, practice result), not an answer of the person. */
  system: boolean
}

export const MENSCH = 'mensch'
const PASS = /^\(?\s*pass\s*\)?\.?$/i
const NAME_PRAEFIX = /^([^\s:@[\]]{1,40}):\s+([\s\S]*)$/

/** The same prefixes `suite_takt.py::_SYSTEM` knows, on the raw text (name prefix and `@raumleiter` allowed). */
const SYSTEM =
  /^(?:[^:\n@[]{1,40}:[ \t]*)?(?:@raumleiter[ \t]*)?(?:TAKT-RUNDE|ÜBUNGSERGEBNIS|LERNEN:|WACHHALTER:|\[Tür)/

/** A log event as something said, or undefined for gateway and system kinds. */
export function nachrichtAus(event: RaumEreignis, members: readonly Mitglied[] = []): Nachricht | undefined {
  const text = String(event.payload.text ?? '')

  if (event.kind === 'message.user') {
    const m = NAME_PRAEFIX.exec(text)

    return {
      seq: event.seq,
      von: MENSCH,
      name: m ? m[1]! : 'Mensch',
      text: m ? m[2]! : text,
      zeit: event.created_at,
      still: PASS.test(text.trim()),
      system: SYSTEM.test(text.trimStart())
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
      system: false
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

const zeile = (text: string, schluessel: string): string | undefined => {
  const treffer = [...text.matchAll(new RegExp(`(?:^|\\n)[ \\t>*_]*${schluessel}:[ \\t*_]*([^\\n]*)`, 'g'))]

  return treffer
    .at(-1)?.[1]
    ?.replace(/[*_`]+$/g, '')
    .trim()
}

/** What the room lead said since the person last spoke; system messages are not the person. */
const raumleiterSeitMensch = (messages: readonly Nachricht[]): Nachricht[] => {
  const letzterMensch = messages.findLastIndex(m => m.von === MENSCH && !m.system)

  return messages.slice(letzterMensch + 1).filter(m => m.von === RAUMLEITER && !m.still)
}

/**
 * The room lead's open `BRAUCHE:`. The last room-lead message counts: it stays open until the
 * room lead writes `STAND:`/`FERTIG:` without `BRAUCHE:` again or the person answers
 * (mirrors `suite_takt.py::raum_stand`).
 */
export function brauchtAus(messages: readonly Nachricht[]): string | undefined {
  let offen: string | undefined

  for (const m of raumleiterSeitMensch(messages)) {
    const wert = zeile(m.text, 'BRAUCHE')

    if (wert !== undefined) {
      offen = wert || 'Braucht dich'
    } else if (zeile(m.text, 'STAND') !== undefined || zeile(m.text, 'FERTIG') !== undefined) {
      offen = undefined
    }
  }

  return offen
}

/** The room lead reported `FERTIG:` and the person has not answered since. */
export const fertigAus = (messages: readonly Nachricht[]): boolean =>
  raumleiterSeitMensch(messages).some(m => zeile(m.text, 'FERTIG') !== undefined)

/** The room lead's latest `STAND:` line. */
export function standAus(messages: readonly Nachricht[]): string | undefined {
  for (const m of [...messages].reverse()) {
    if (m.von === RAUMLEITER && !m.still) {
      const wert = zeile(m.text, 'STAND')

      if (wert) {
        return wert
      }
    }
  }

  return undefined
}

export interface Aufgabe {
  text: string
  erledigt: boolean
}

const AUFGABEN_KOPF = /(?:^|\n)[ \t>*_#]*AUFGABEN:[^\n]*\n/
const AUFGABE_ZEILE = /^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$/

/** The `AUFGABEN:` block: `- [ ]` and `- [x]` lines until the first other line. */
export function aufgabenAus(text: string): Aufgabe[] {
  const kopf = AUFGABEN_KOPF.exec(text)

  if (!kopf) {
    return []
  }

  const aus: Aufgabe[] = []

  for (const roh of text.slice(kopf.index + kopf[0].length).split('\n')) {
    if (!roh.trim()) {
      if (aus.length) {
        break
      }

      continue
    }

    const m = AUFGABE_ZEILE.exec(roh)

    if (!m) {
      break
    }

    aus.push({ text: m[2]!, erledigt: m[1] !== ' ' })
  }

  return aus
}

/** The latest room-lead message that carries a task block. */
export function aufgabenWand(messages: readonly Nachricht[]): Aufgabe[] {
  for (const m of [...messages].reverse()) {
    if (m.von === RAUMLEITER && AUFGABEN_KOPF.test(m.text)) {
      return aufgabenAus(m.text)
    }
  }

  return []
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

/** The profiles a failed room creation misses – from our own check or from the backend's refusal. */
export const fehlendeRollen = (error: unknown): string[] =>
  error instanceof RollenFehlenFehler
    ? [...error.profile]
    : [...fehlertext(error).matchAll(/profile '([^']+)' is not local/g)].map(m => m[1]!)

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

/** The room's tail: enough to read the room lead's latest lines, never ahead of the log. */
async function schweif(suite: Suite): Promise<RaumEreignis[]> {
  const seit = Math.max(0, suite.letzteSeq - SCHWEIF)
  const seite = await anfrage<LogSeite>('groups.log', { room_id: suite.id, since_seq: seit, limit: SCHWEIF + 1 })

  return seite.events ?? []
}

export interface SuiteStand {
  brauche?: string
  fertig?: boolean
  arbeitet?: string
  freigaben: Freigabe[]
}

/** What the tail and the driver say about one room. */
export function suiteStand(events: readonly RaumEreignis[], suite: Suite, fahrstand?: Fahrstand): SuiteStand {
  const messages = events.map(e => nachrichtAus(e, suite.mitglieder)).filter((m): m is Nachricht => m !== undefined)

  return {
    brauche: brauchtAus(messages),
    fertig: fertigAus(messages) || undefined,
    arbeitet: werArbeitet(events) ?? (fahrstand?.working ? RAUMLEITER : undefined),
    freigaben: (fahrstand?.pending_actions ?? []).filter(a => a.kind === 'approval')
  }
}

let ladeGeneration = 0

/** Read the tails of the newest rooms and mark which need the person. Stale reads never win. */
async function verfeinern(suites: readonly Suite[], generation: number): Promise<void> {
  const staende = await Promise.all(
    suites.slice(0, DETAIL_HOECHSTENS).map(async suite => {
      try {
        const [events, stand] = await Promise.all([schweif(suite), ladeStand(suite.id).catch(() => undefined)])

        return [suite.id, suiteStand(events, suite, stand?.driver_status)] as const
      } catch {
        return [suite.id, undefined] as const
      }
    })
  )

  if (generation !== ladeGeneration) {
    return
  }

  const nachId = new Map(staende)

  $suites.set(
    $suites.get().map(suite => {
      const stand = nachId.get(suite.id)

      return stand ? { ...suite, brauche: stand.brauche, fertig: stand.fertig, arbeitet: stand.arbeitet } : suite
    })
  )
  $suitesBrauchen.set(
    staende.filter(([, stand]) => stand && (stand.brauche || stand.freigaben.length > 0)).map(([id]) => id)
  )
}

/** The rooms, as the gateway has them. A thrown error is an error, never "no suites". */
export async function ladeSuites(): Promise<void> {
  $suitesStatus.set('laedt')
  const generation = ++ladeGeneration

  try {
    const result = await anfrage<{ rooms?: RaumZeile[] }>('groups.list', { limit: 200 })

    if (generation !== ladeGeneration) {
      return
    }

    const bekannt = new Map($suites.get().map(s => [s.id, s]))

    const suites = suitenAusRaeumen(result?.rooms ?? []).map(suite => {
      const alt = bekannt.get(suite.id)

      return alt ? { ...suite, brauche: alt.brauche, fertig: alt.fertig, arbeitet: alt.arbeitet } : suite
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

/** A door: this room speaks into another, addressed to its room lead. */
export const tuerSenden = (von: Pick<Suite, 'titel'>, nach: Pick<Suite, 'id'>, text: string): Promise<RaumEreignis> =>
  senden(nach.id, `[Tür aus „${von.titel}“] @raumleiter ${text.trim()}`)

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
  if ($suitesStatus.get() !== 'bereit') {
    await ladeSuites()
  }

  const vorhanden = $suites.get().find(s => s.titel === titel)

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

/** The brief is the first message; the room lead's answer arrives in the log. */
function eroeffnen(suite: Suite, text: string): void {
  void auftragGeben(suite, `@raumleiter ${text}`).catch(error => $suitesFehler.set(fehlertext(error)))
}

/**
 * Practice runs beside the person's room, only while the house has room for
 * them: the person's own room never waits on them. A standing order is not
 * practised (repeating a permanent job N times teaches nothing).
 */
async function uebungenStarten(name: string, ziel: string, rollen: readonly string[]): Promise<number> {
  const gewuenscht = $uebungslaeufe.get()
  const laufend = $suites.get().filter(s => s.arbeitet).length
  const frei = freieUebungen(gewuenscht, laufend, $kapazitaet.get())
  let gestartet = 0

  for (let nr = 2; nr < 2 + frei; nr += 1) {
    try {
      const ansatz = ansatzFuer(nr)
      const raum = await raumAnlegen(uebungsTitel(name, $mensch.get(), nr), rollen, ansatz.klon)

      if (raum.neu) {
        $suites.set([raum.suite, ...$suites.get()])
        eroeffnen(raum.suite, uebungsEroeffnung(nr, gewuenscht, ansatz, name, ziel))
        gestartet += 1
      }
    } catch {
      // A practice run that cannot start is skipped; the person's room is unaffected.
    }
  }

  return gestartet
}

export interface NeueSuiteOptionen extends Eroeffnung {
  /** Catalogue roles at the table from the start, besides the base crew. */
  rollen?: readonly string[]
  /** Room-lead clone (catalogue `klon_von: raumleiter`) that leads the person's room; empty = the room lead itself. */
  raumleiter?: string
  /** False opens the room on the gateway without walking into it (Vorzimmer handoff). */
  oeffnen?: boolean
}

/**
 * Open a new suite: the person's room first — created, entered and briefed
 * before anything else — then, in the background, the practice runs.
 * Returns the person's suite, or undefined when nothing could be opened.
 */
export async function neueSuite(
  name: string,
  ziel: string,
  { oeffnen = true, rollen = [], raumleiter, ...eroeffnung }: NeueSuiteOptionen = {}
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

    if (oeffnen) {
      oeffneSuite(raum.suite)
    }

    if (raum.neu) {
      eroeffnen(raum.suite, eroeffnungsText(titel, ziel, eroeffnung))

      if (!eroeffnung.takt?.trim()) {
        void uebungenStarten(titel, ziel, rollen).then(gestartet => (gestartet ? ladeSuites() : undefined))
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
      ? letzte.map(n => `- ${n.name}: ${n.text.split(/\s+/).join(' ').slice(0, 600)}`)
      : ['- (noch nichts gesagt)'])
  ].join('\n')
}

export const verschmelzenText = (a: Suite, b: Suite, standA: string, standB: string): string =>
  `@raumleiter Dieser Raum ist aus zwei Räumen verschmolzen: „${a.titel}“ und „${b.titel}“. ` +
  'Hier der Stand beider; führe sie zu einem Ziel zusammen und sag, was als Nächstes dran ist.\n\n' +
  `${standA}\n\n${standB}`

/** Members of both rooms, one per profile, first room first. */
export function vereinteMitglieder(a: readonly Mitglied[], b: readonly Mitglied[]): Mitglied[] {
  const aus: Mitglied[] = []

  for (const m of [...a, ...b]) {
    if (!aus.some(x => x.profile === m.profile)) {
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
 */
export async function verschmelzen(a: Suite, b: Suite): Promise<Suite | undefined> {
  const titel = `${a.titel} + ${b.titel}`

  if ($suiteEntsteht.get()) {
    return undefined
  }

  $suiteEntsteht.set(titel)

  try {
    const [na, nb] = await Promise.all([nachrichtenVon(a), nachrichtenVon(b)])

    const created = await anfrage<{ room: RaumZeile }>('groups.create', {
      room_id: raumId(titel),
      name: titel,
      members: vereinteMitglieder(a.mitglieder, b.mitglieder)
    })

    const neu = alsSuite(created.room)

    await senden(neu.id, `${$mensch.get()}: ${verschmelzenText(a, b, zusammenfassung(a, na), zusammenfassung(b, nb))}`)
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
