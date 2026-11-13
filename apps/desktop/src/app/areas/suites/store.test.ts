import { beforeEach, describe, expect, it, vi } from 'vitest'

import { KATALOG } from '../admin/katalog'

import type { RaumEreignis, Suite } from './store'

const rpc = vi.fn()
const setArea = vi.fn()

vi.mock('@/store/gateway', () => ({ activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }) }))
vi.mock('../store', () => ({ setArea: (...args: unknown[]) => setArea(...args) }))

const {
  $aktiveSuite,
  $suites,
  $suitesBrauchen,
  $suitesFehler,
  $suitesStatus,
  RollenFehlenFehler,
  auftragGeben,
  besetzbareMitglieder,
  brauchtDich,
  fehlendeRollen,
  ladeSuites,
  nachrichtAus,
  neueSuite,
  raumId,
  raumMitglieder,
  raumSlug,
  suiteStand,
  vereinteMitglieder,
  verschmelzen,
  werArbeitet
} = await import('./store')

const { $mensch } = await import('../admin/betrieb-store')

const calls = () => rpc.mock.calls.map(([method, params]) => [method, params] as [string, Record<string, unknown>])
const methoden = () => calls().map(([method]) => method)
const warten = () => new Promise(resolve => setTimeout(resolve, 0))

const raum = (room_id: string, name: string, extra: Record<string, unknown> = {}) => ({
  room_id,
  name,
  members: [{ member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' }],
  updated_at: 1,
  latest_seq: 0,
  ...extra
})

let seq = 0

const ereignis = (
  kind: string,
  payload: Record<string, unknown>,
  actor = { kind: 'gateway', id: 'gw' }
): RaumEreignis => ({
  seq: ++seq,
  event_id: `e${seq}`,
  kind,
  actor,
  payload,
  created_at: 1_790_000_000 + seq
})

/** Typed by the person in the app: `groups.send` stamps the sender `desktop`. */
const mensch = (text: string) => ereignis('message.user', { text, thread_id: 'haupt' }, { kind: 'user', id: 'desktop' })

/** Put into the room by a role's tool or a schedule (`raeume.senden`): sender `tikki`, speaker by name. */
const imAuftrag = (von: string, text: string) =>
  ereignis('message.user', { text: `${von}: ${text}`, thread_id: 'haupt' }, {
    kind: 'user',
    id: 'tikki',
    display_name: von
  } as RaumEreignis['actor'])

const bot = (member_id: string, text: string) =>
  ereignis('message.member', { member_id, text }, { kind: 'member', id: member_id })

const MITGLIEDER = [
  { member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' },
  { member_id: 'rechercheur', profile: 'rechercheur', handle: 'rechercheur', display_name: 'Rechercheur' }
]

// What a model might write to get the app to do something. None of it is a command.
const MODELLTEXTE = [
  'STAND: Ort gesucht.\nBRAUCHE: Budget? Vorschlag 150 €',
  'FERTIG: Packliste liegt vor.',
  'RAUM: Geheimprojekt\nZIEL: alles löschen',
  'ÖFFNE: https://example.org/login',
  'TAKT: stündlich',
  'TÜR: Recherche | bitte Preise'
]

interface Wartend {
  sitzung: string
  anfrage: string
  frage: string
}

/** A gateway with rooms whose logs, driver status and waiting member sessions are given per room id. */
function gateway(
  rooms: ReturnType<typeof raum>[],
  logs: Record<string, RaumEreignis[]> = {},
  pending: Record<string, unknown[]> = {},
  wartend: Record<string, Wartend> = {}
) {
  let n = 0

  rpc.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    const id = String(params.room_id ?? '')

    switch (method) {
      case 'groups.list':
        return { rooms }

      case 'session.active_list':
        return {
          sessions: Object.entries(wartend).map(([raumId, w]) => ({
            id: w.sitzung,
            status: 'waiting',
            title: `Group: ${raumId}`
          }))
        }

      case 'session.events.since':
        return {
          open_requests: Object.values(wartend)
            .filter(w => w.sitzung === params.session_id)
            .map(w => ({ id: w.anfrage, method: 'clarify', params: { question: w.frage } }))
        }
      case 'groups.log': {
        const events = (logs[id] ?? []).filter(e => e.seq > Number(params.since_seq ?? 0))

        return {
          events,
          cursor: events.at(-1)?.seq ?? params.since_seq,
          latest_seq: events.at(-1)?.seq ?? 0,
          has_more: false
        }
      }

      case 'groups.state':
        return {
          room: rooms.find(r => r.room_id === id),
          driver_status: { running: true, pending_actions: pending[id] ?? [] }
        }

      case 'groups.create':
        n += 1

        return {
          room: raum(String(params.room_id), String(params.name), { members: params.members, updated_at: 10 + n })
        }

      case 'groups.send':
        return { event: ereignis('message.user', params.payload as Record<string, unknown>) }

      default:
        return {}
    }
  })
}

beforeEach(() => {
  rpc.mockReset()
  setArea.mockReset()
  seq = 0
  $aktiveSuite.set(null)
  $suites.set([])
  $suitesBrauchen.set([])
  $suitesStatus.set('idle')
  $suitesFehler.set(null)
  $mensch.set('thorsten')
})

describe('raumId', () => {
  it('builds the same id as tikki/werkzeuge/raeume.py: prefix, ascii slug, base36 milliseconds', () => {
    // 1790000000000 in base 36, as Python's _base36 writes it.
    expect((1_790_000_000_000).toString(36)).toBe('mubbs7i8')
    expect(raumId('Urlaub Ostsee', 1_790_000_000_000)).toBe('tikki-urlaub-ostsee-mubbs7i8')
  })

  it('folds umlauts, punctuation and length the way the Python slug does', () => {
    expect(raumSlug('Wärmepumpen-Förderung: laufend!')).toBe('warmepumpen-forderung-laufend')
    expect(raumSlug('App-thorsten-2@tikki.team')).toBe('app-thorsten-2-tikki-team')
    expect(raumSlug('🐾')).toBe('raum')
    expect(raumSlug('a'.repeat(60)).length).toBe(40)
  })
})

describe('raumMitglieder', () => {
  it('seats the base crew first, then the chosen roles, each once, unknown slugs dropped', () => {
    const katalog = [
      { slug: 'raumleiter', name: 'Raumleiter', hermes_profil: 'raumleiter', im_raum_ab_start: true },
      { slug: 'deine-ki', name: 'Deine KI', hermes_profil: 'deine-ki', im_raum_ab_start: true },
      { slug: 'rechercheur', name: 'Rechercheur', hermes_profil: 'rechercheur', im_raum_ab_start: false }
    ] as unknown as Parameters<typeof raumMitglieder>[1]

    expect(raumMitglieder(['rechercheur', 'raumleiter', 'niemand'], katalog)).toEqual([
      { member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' },
      { member_id: 'deine-ki', profile: 'deine-ki', handle: 'deine-ki', display_name: 'Deine KI' },
      { member_id: 'rechercheur', profile: 'rechercheur', handle: 'rechercheur', display_name: 'Rechercheur' }
    ])
  })

  it('lets a room-lead clone lead: same handle, other profile; a non-clone is ignored', () => {
    const katalog = [
      { slug: 'raumleiter', name: 'Raumleiter', hermes_profil: 'raumleiter', im_raum_ab_start: true },
      { slug: 'raumleiter-xai', name: 'Raumleiter (xAI)', hermes_profil: 'raumleiter-xai', klon_von: 'raumleiter' },
      { slug: 'rechercheur', name: 'Rechercheur', hermes_profil: 'rechercheur', im_raum_ab_start: false }
    ] as unknown as Parameters<typeof raumMitglieder>[1]

    expect(raumMitglieder([], katalog, 'raumleiter-xai')[0]).toEqual({
      member_id: 'raumleiter',
      profile: 'raumleiter-xai',
      handle: 'raumleiter',
      display_name: 'Raumleiter'
    })
    expect(raumMitglieder([], katalog, 'rechercheur')[0]?.profile).toBe('raumleiter')
    expect(raumMitglieder([], katalog, 'raumleiter-xai')).toHaveLength(1)
  })

  it('reads the real catalogue with clones completed from the room lead', () => {
    const klone = KATALOG.filter(r => r.klon_von === 'raumleiter')
    const original = KATALOG.find(r => r.slug === 'raumleiter')!

    expect(klone.length).toBeGreaterThan(0)

    for (const k of klone) {
      expect(k.werkzeuge).toEqual(original.werkzeuge)
      expect(k.modell.primary).not.toBe(original.modell.primary)
      expect(k.im_raum_ab_start).toBe(false)
    }
  })
})

describe('nachrichtAus', () => {
  it('maps the person and the members with their names, marks (pass) as silence, skips the gateway', () => {
    const [m, r, p, t] = [
      nachrichtAus(mensch('thorsten: @raumleiter Plane X'), MITGLIEDER),
      nachrichtAus(bot('rechercheur', 'Drei Quellen gefunden.'), MITGLIEDER),
      nachrichtAus(bot('raumleiter', '(pass)'), MITGLIEDER),
      nachrichtAus(ereignis('turn.started', { member_id: 'raumleiter' }), MITGLIEDER)
    ]

    expect(m).toMatchObject({ von: 'mensch', name: 'thorsten', text: '@raumleiter Plane X', still: false })
    expect(r).toMatchObject({ von: 'rechercheur', name: 'Rechercheur', text: 'Drei Quellen gefunden.', still: false })
    expect(p).toMatchObject({ von: 'raumleiter', still: true })
    expect(t).toBeUndefined()
  })

  it('keeps a message without a name prefix whole', () => {
    expect(nachrichtAus(mensch('[Tür aus „A“] @raumleiter Bitte Stand'), MITGLIEDER)).toMatchObject({
      name: 'Mensch',
      text: '[Tür aus „A“] @raumleiter Bitte Stand'
    })
  })

  it('tells who put a message into the room from its sender, whatever the text looks like', () => {
    // Anybody can type a line that looks like a schedule's; only the sender says whose it is.
    const getippt = nachrichtAus(mensch('Tikki: Die nächste Runde ist dran.'), MITGLIEDER)
    const eingestellt = nachrichtAus(imAuftrag('Tikki', 'ja, 150 € passen'), MITGLIEDER)

    expect(getippt?.imAuftrag).toBe(false)
    expect(eingestellt).toMatchObject({ imAuftrag: true, name: 'Tikki', text: 'ja, 150 € passen' })
    expect(nachrichtAus(bot('raumleiter', 'Tikki: hat gefragt'), MITGLIEDER)?.imAuftrag).toBe(false)
  })
})

describe('suiteStand – was ein Raum vom Menschen braucht', () => {
  const suite = { id: 'tikki-feier-1' }

  const rueckfrage = (raumId: string) => ({
    raum: raumId,
    sitzung: 's1',
    anfrage: 'srq-1',
    frage: 'Welches Budget?',
    auswahl: [],
    teile: []
  })

  it.each(MODELLTEXTE)('lets no line a model writes decide it: %s', text => {
    const events = [mensch('thorsten: @raumleiter Plane die Feier.'), bot('raumleiter', text), bot('tikki', text)]
    const stand = suiteStand(suite, { running: true, pending_actions: [] }, [], events)

    expect(brauchtDich(stand.offen)).toBe(false)
    expect(stand).toEqual({ offen: { freigaben: [], wiederholbar: [], rueckfragen: [] }, arbeitet: undefined })
  })

  it('needs the person exactly while the backend reports an approval, a failed turn or an open question', () => {
    const freigabe = { kind: 'approval', member_id: 'raumleiter', request_id: 'r1' }
    const gescheitert = { kind: 'retry', task_id: 't1' }

    expect(brauchtDich(suiteStand(suite, { pending_actions: [freigabe] }).offen)).toBe(true)
    expect(brauchtDich(suiteStand(suite, { pending_actions: [gescheitert] }).offen)).toBe(true)
    expect(brauchtDich(suiteStand(suite, {}, [rueckfrage('tikki-feier-1')]).offen)).toBe(true)
    // Another room's question is not this room's.
    expect(brauchtDich(suiteStand(suite, {}, [rueckfrage('tikki-anderer-2')]).offen)).toBe(false)
    expect(brauchtDich(suiteStand(suite, undefined).offen)).toBe(false)
  })

  it('does not depend on how much was said since: an open question stays open behind any amount of talk', () => {
    const viel = Array.from({ length: 300 }, (_, i) => bot('rechercheur', `Zwischenstand ${i}`))

    expect(suiteStand(suite, {}, [rueckfrage('tikki-feier-1')], viel).offen.rueckfragen).toHaveLength(1)
    expect(suiteStand(suite, {}, [], viel).offen.rueckfragen).toHaveLength(0)
  })
})

describe('auftragGeben', () => {
  const suite = {
    id: 'tikki-feier-1',
    mitglieder: [...MITGLIEDER, { member_id: 'tikki', profile: 'tikki', handle: 'tikki', display_name: 'Tikki' }]
  }

  const gesendet = () => (calls().at(-1)![1].payload as { text: string }).text

  it('addresses the room lead when the person names nobody, so the core does not ask every member in turn', async () => {
    gateway([])

    await auftragGeben(suite, '  2000 Euro  ')
    expect(gesendet()).toBe('thorsten: @raumleiter 2000 Euro')

    await auftragGeben(suite, 'Schreib an mail@example.org, @niemand')
    expect(gesendet()).toBe('thorsten: @raumleiter Schreib an mail@example.org, @niemand')
  })

  it('leaves a text alone that already addresses a member (any case) or everyone', async () => {
    gateway([])

    await auftragGeben(suite, '@tikki was meinst du?')
    expect(gesendet()).toBe('thorsten: @tikki was meinst du?')

    await auftragGeben(suite, 'Bitte @Rechercheur, drei Quellen')
    expect(gesendet()).toBe('thorsten: Bitte @Rechercheur, drei Quellen')

    await auftragGeben(suite, '@all kurz melden')
    expect(gesendet()).toBe('thorsten: @all kurz melden')
  })
})

describe('werArbeitet', () => {
  it('names the member whose turn began and has not ended', () => {
    const offen = [ereignis('turn.started', { member_id: 'rechercheur' })]

    expect(werArbeitet(offen)).toBe('rechercheur')
    expect(werArbeitet([...offen, ereignis('turn.settled', { member_id: 'rechercheur' })])).toBeUndefined()
  })
})

describe('ladeSuites', () => {
  it("lists only Tikki's rooms, newest first, and marks the ones that need the person", async () => {
    gateway(
      [
        raum('tikki-app-1', 'App', { updated_at: 5, latest_seq: 2 }),
        raum('bot-relay-x', 'Fremder Raum', { updated_at: 9 }),
        raum('tikki-urlaub-2', 'Urlaub', { updated_at: 7, latest_seq: 1 }),
        raum('tikki-still-3', 'Still', { updated_at: 1, latest_seq: 2 })
      ],
      {
        'tikki-app-1': [mensch('thorsten: los'), bot('raumleiter', 'Ich frage nach.')],
        'tikki-urlaub-2': [mensch('thorsten: los')],
        // A model that only WRITES that it needs something has asked nobody.
        'tikki-still-3': [mensch('thorsten: los'), bot('raumleiter', 'BRAUCHE: Freigabe fürs Budget')]
      },
      { 'tikki-urlaub-2': [{ kind: 'approval', member_id: 'raumleiter', request_id: 'r1' }] },
      { 'tikki-app-1': { sitzung: 's-app', anfrage: 'srq-7', frage: 'Welches Budget?' } }
    )

    await ladeSuites()

    expect($suitesStatus.get()).toBe('bereit')
    expect($suites.get().map(s => s.id)).toEqual(['tikki-urlaub-2', 'tikki-app-1', 'tikki-still-3'])
    expect($suites.get().find(s => s.id === 'tikki-app-1')?.offen?.rueckfragen).toMatchObject([
      { anfrage: 'srq-7', frage: 'Welches Budget?', raum: 'tikki-app-1' }
    ])
    expect(new Set($suitesBrauchen.get())).toEqual(new Set(['tikki-app-1', 'tikki-urlaub-2']))
    expect(calls()[0]).toEqual(['groups.list', { limit: 200 }])
    // The tail read never runs ahead of the log.
    expect(
      calls()
        .filter(([m]) => m === 'groups.log')
        .every(([, p]) => Number(p.since_seq) >= 0)
    ).toBe(true)
  })

  it('reports a failed list as an error, not as an empty history', async () => {
    rpc.mockRejectedValueOnce(new Error('Group Chat worker is unavailable. Restart the Hermes gateway and try again.'))

    await ladeSuites()

    expect($suitesStatus.get()).toBe('fehler')
    expect($suitesFehler.get()).toContain('worker is unavailable')
  })
})

describe('neueSuite', () => {
  it('creates the room with the base crew and the chosen roles, enters it, then sends what the person wrote', async () => {
    gateway([])

    const suite = await neueSuite('Urlaub Ostsee', 'Ein Plan mit Haus und Kosten.', { rollen: ['rechercheur'] })
    await warten()

    expect(methoden().slice(0, 4)).toEqual(['groups.list', 'profiles.list', 'groups.create', 'groups.send'])
    const create = calls()[2]![1]
    const members = create.members as { member_id: string; profile: string }[]

    expect(create.room_id).toMatch(/^tikki-urlaub-ostsee-[0-9a-z]+$/)
    expect(create.name).toBe('Urlaub Ostsee')
    const grundbesatzung = KATALOG.filter(r => r.im_raum_ab_start).map(r => r.slug)
    expect(grundbesatzung.length).toBeGreaterThanOrEqual(2)
    expect(members.map(m => m.member_id)).toEqual([...grundbesatzung, 'rechercheur'])
    expect(members.every(m => m.profile)).toBe(true)
    expect(calls()[3]![1]).toMatchObject({
      room_id: create.room_id,
      payload: { text: 'thorsten: @raumleiter Ein Plan mit Haus und Kosten.', thread_id: 'haupt' }
    })
    expect((calls()[3]![1].event_id as string).startsWith('tikki:')).toBe(true)
    // The person stands in the new room before the brief goes out.
    expect($aktiveSuite.get()).toMatchObject({ id: create.room_id, titel: 'Urlaub Ostsee' })
    expect(suite?.id).toBe(create.room_id)
    expect(setArea).toHaveBeenCalledWith('suites')
  })

  it('adopts an existing room of exactly that name instead of forking it', async () => {
    gateway([raum('tikki-urlaub-ostsee-abc', 'Urlaub Ostsee')])

    await neueSuite('Urlaub Ostsee', '')
    await warten()

    expect(methoden()).not.toContain('groups.create')
    expect(methoden()).not.toContain('groups.send')
    expect($aktiveSuite.get()).toMatchObject({ id: 'tikki-urlaub-ostsee-abc', titel: 'Urlaub Ostsee' })
  })

  it('adopts a room another surface opened after the list was last read', async () => {
    // The app has listed before and has seen no such room …
    gateway([])
    await ladeSuites()
    expect($suitesStatus.get()).toBe('bereit')

    // … then Tikki's tool opens one. The form must find it, not open a second room of that name.
    rpc.mockReset()
    gateway([raum('tikki-urlaub-ostsee-neu', 'Urlaub Ostsee')])

    await neueSuite('Urlaub Ostsee', 'Ein Plan.')
    await warten()

    expect(methoden()).not.toContain('groups.create')
    expect($aktiveSuite.get()?.id).toBe('tikki-urlaub-ostsee-neu')
  })

  it('puts nothing into a room the person left empty, and no room is opened beside the one asked for', async () => {
    gateway([])

    await neueSuite('App', '   ')
    await warten()

    expect(methoden().filter(m => m === 'groups.create')).toHaveLength(1)
    expect(methoden()).not.toContain('groups.send')
  })

  it('hands a chosen rhythm to the schedule, never into the conversation', async () => {
    const zeitplanAnlegen = vi.fn(async () => undefined)

    gateway([])

    const suite = await neueSuite('Förderung', 'Täglich prüfen.', { takt: '0 6 * * *', zeitplanAnlegen })
    await warten()

    expect(zeitplanAnlegen).toHaveBeenCalledWith(expect.objectContaining({ id: suite?.id }), '0 6 * * *')
    expect((calls().find(([m]) => m === 'groups.send')![1].payload as { text: string }).text).toBe(
      'thorsten: @raumleiter Täglich prüfen.'
    )
  })
})

describe('verschmelzen', () => {
  it('seats every member id, handle and profile once, even when two clones lead the two rooms', () => {
    const leiter = (profile: string) => ({ member_id: 'raumleiter', profile, handle: 'raumleiter' })
    const rechner = { member_id: 'rechner', profile: 'rechner', handle: 'rechner' }
    const anders = { member_id: 'Rechner', profile: 'zweitrechner', handle: 'RECHNER' }

    const vereint = vereinteMitglieder(
      [leiter('raumleiter-anthropic'), rechner],
      [leiter('raumleiter-codex'), anders, MITGLIEDER[1]!]
    )

    // The core rejects a roster with a repeated member id, handle or profile — in any case.
    for (const feld of ['member_id', 'handle', 'profile'] as const) {
      const werte = vereint.map(m => m[feld].toLowerCase())

      expect(new Set(werte).size, feld).toBe(werte.length)
    }

    expect(vereint.map(m => m.profile)).toEqual(['raumleiter-anthropic', 'rechner', 'rechercheur'])
  })

  it('leaves both rooms standing and says why when the merged room cannot be created', async () => {
    const a: Suite = { id: 'tikki-a-1', titel: 'Recherche', mitglieder: MITGLIEDER, geaendert: 1, letzteSeq: 0 }
    const b: Suite = { id: 'tikki-b-2', titel: 'Website', mitglieder: MITGLIEDER, geaendert: 1, letzteSeq: 0 }

    rpc.mockImplementation(async (method: string) => {
      if (method === 'groups.create') {
        throw new Error('duplicate member handle')
      }

      return { events: [], cursor: 0, latest_seq: 0, has_more: false }
    })

    expect(await verschmelzen(a, b)).toBeUndefined()
    expect($suitesFehler.get()).toBe('duplicate member handle')
    expect(methoden()).not.toContain('groups.disband')
    expect(await verschmelzen(a, a)).toBeUndefined()
  })

  it('unites the members by profile, seeds the new room with both stands, disbands both and enters the new one', async () => {
    const a: Suite = { id: 'tikki-a-1', titel: 'Recherche', mitglieder: MITGLIEDER, geaendert: 1, letzteSeq: 2 }

    const b: Suite = {
      id: 'tikki-b-2',
      titel: 'Website',
      mitglieder: [
        MITGLIEDER[0]!,
        { member_id: 'frontend-entwickler', profile: 'frontend-entwickler', handle: 'frontend-entwickler' }
      ],
      geaendert: 1,
      letzteSeq: 1
    }

    expect(vereinteMitglieder(a.mitglieder, b.mitglieder).map(m => m.member_id)).toEqual([
      'raumleiter',
      'rechercheur',
      'frontend-entwickler'
    ])

    gateway([], {
      'tikki-a-1': [mensch('thorsten: los'), bot('rechercheur', 'Drei Quellen.')],
      'tikki-b-2': [bot('raumleiter', '(pass)')]
    })

    const neu = await verschmelzen(a, b)

    expect(neu?.titel).toBe('Recherche + Website')
    const create = calls().find(([m]) => m === 'groups.create')![1]

    expect((create.members as { member_id: string }[]).map(m => m.member_id)).toEqual([
      'raumleiter',
      'rechercheur',
      'frontend-entwickler'
    ])
    const text = (calls().find(([m]) => m === 'groups.send')![1].payload as { text: string }).text

    expect(text.startsWith('thorsten: @raumleiter ')).toBe(true)
    expect(text).toContain('## Recherche\n- thorsten: los\n- Rechercheur: Drei Quellen.')
    expect(text).toContain('## Website\n- (noch nichts gesagt)')
    expect(
      calls()
        .filter(([m]) => m === 'groups.disband')
        .map(([, p]) => p.room_id)
    ).toEqual(['tikki-a-1', 'tikki-b-2'])
    expect($aktiveSuite.get()?.id).toBe(neu?.id)
  })
})

describe('besetzbareMitglieder – was dieser Rechner besetzen kann', () => {
  const katalog = [
    { slug: 'raumleiter', name: 'Raumleiter', hermes_profil: 'raumleiter', im_raum_ab_start: true },
    { slug: 'deine-ki', name: 'Deine KI', hermes_profil: 'deine-ki', im_raum_ab_start: true },
    { slug: 'rechner', name: 'Rechner', hermes_profil: 'rechner', im_raum_ab_start: false },
    {
      slug: 'raumleiter-xai',
      name: 'xAI',
      hermes_profil: 'raumleiter-xai',
      im_raum_ab_start: false,
      klon_von: 'raumleiter'
    }
  ] as unknown as Parameters<typeof besetzbareMitglieder>[3]

  it('lässt eine fehlende Nebenrolle weg und gibt einen fehlenden Klon an den Raumleiter zurück', () => {
    const profile = new Set(['raumleiter', 'deine-ki'])

    expect(besetzbareMitglieder(['rechner'], profile, 'raumleiter-xai', katalog).map(m => m.profile)).toEqual([
      'raumleiter',
      'deine-ki'
    ])
    expect(besetzbareMitglieder(['rechner'], null, 'raumleiter-xai', katalog).map(m => m.profile)).toEqual([
      'raumleiter-xai',
      'deine-ki',
      'rechner'
    ])
  })

  it('nennt die fehlende Grundbesatzung statt den Raum halb zu öffnen', () => {
    expect(() => besetzbareMitglieder([], new Set(['raumleiter']), undefined, katalog)).toThrow(RollenFehlenFehler)
    expect(fehlendeRollen(new Error("member 1 profile 'deine-ki' is not local to this gateway"))).toEqual(['deine-ki'])
    expect(fehlendeRollen(new RollenFehlenFehler(['deine-ki', 'tikki']).message)).toEqual(['deine-ki', 'tikki'])
  })
})
