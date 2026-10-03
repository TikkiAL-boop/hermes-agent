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
  aufgabenAus,
  auftragGeben,
  brauchtAus,
  fertigAus,
  ladeSuites,
  nachrichtAus,
  neueSuite,
  raumId,
  raumMitglieder,
  raumSlug,
  standAus,
  vereinteMitglieder,
  verschmelzen,
  werArbeitet
} = await import('./store')

const { $kapazitaet, $mensch, $uebungslaeufe } = await import('../admin/betrieb-store')

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

const mensch = (text: string) => ereignis('message.user', { text, thread_id: 'haupt' }, { kind: 'user', id: 'tikki' })

const bot = (member_id: string, text: string) =>
  ereignis('message.member', { member_id, text }, { kind: 'member', id: member_id })

const MITGLIEDER = [
  { member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' },
  { member_id: 'rechercheur', profile: 'rechercheur', handle: 'rechercheur', display_name: 'Rechercheur' }
]

const nachrichten = (events: RaumEreignis[]) =>
  events.map(e => nachrichtAus(e, MITGLIEDER)).filter((m): m is NonNullable<typeof m> => m !== undefined)

// The same three example texts the schedule reads in tests/tikki/test_suite_takt.py.
const BRAUCHE_TEXT = 'STAND: Ort gesucht.\nBRAUCHE: Budget? Vorschlag 150 €'

const SYSTEM_NACHRICHTEN = [
  'thorsten: @raumleiter TAKT-RUNDE 2 · 01.10.2026 12:00: Neue Runde nach Takt (stündlich).',
  '@raumleiter WACHHALTER: bitte weiterarbeiten',
  '[Tür aus „Recherche“] @raumleiter Die Quellen liegen vor.',
  '@raumleiter ÜBUNGSERGEBNIS 2: Übungsraum „App-thorsten-2@tikki.team“ ist zuerst fertig.',
  '@raumleiter LERNEN: Alle Übungsläufe zu „App“ sind durch.'
]

const ZWISCHENRUF = '@rechercheur such inzwischen drei Orte heraus.'
const STAND_OHNE_BRAUCHE = 'STAND: Ort gebucht, Budget nicht mehr nötig.'

const AUFGABEN_TEXT =
  'STAND: zweite Runde\n**AUFGABEN:** (Stand 12:00)\n* [x] Häuser an der Ostsee sammeln\n' +
  '- [ ] Preise vergleichen\n\nTÜR: Recherche | bitte Preise'

/** A gateway with rooms whose logs and driver status are given per room id. */
function gateway(
  rooms: ReturnType<typeof raum>[],
  logs: Record<string, RaumEreignis[]> = {},
  pending: Record<string, unknown[]> = {}
) {
  let n = 0

  rpc.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    const id = String(params.room_id ?? '')

    switch (method) {
      case 'groups.list':
        return { rooms }
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
  $uebungslaeufe.set(1)
  $kapazitaet.set(40)
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
      nachrichtAus(mensch('thorsten: @raumleiter RAUM: X'), MITGLIEDER),
      nachrichtAus(bot('rechercheur', 'Drei Quellen gefunden.'), MITGLIEDER),
      nachrichtAus(bot('raumleiter', '(pass)'), MITGLIEDER),
      nachrichtAus(ereignis('turn.started', { member_id: 'raumleiter' }), MITGLIEDER)
    ]

    expect(m).toMatchObject({ von: 'mensch', name: 'thorsten', text: '@raumleiter RAUM: X', still: false })
    expect(r).toMatchObject({ von: 'rechercheur', name: 'Rechercheur', text: 'Drei Quellen gefunden.', still: false })
    expect(p).toMatchObject({ von: 'raumleiter', still: true })
    expect(t).toBeUndefined()
  })

  it('keeps a message without a name prefix whole', () => {
    expect(nachrichtAus(mensch('[Tür aus „A“] @raumleiter Bitte Stand'), MITGLIEDER)).toMatchObject({
      name: 'Mensch',
      text: '[Tür aus „A“] @raumleiter Bitte Stand',
      system: true
    })
  })

  it('marks what the backend puts into the room as system, the person and the members never', () => {
    expect(SYSTEM_NACHRICHTEN.map(t => nachrichtAus(mensch(t), MITGLIEDER)?.system)).toEqual([
      true,
      true,
      true,
      true,
      true
    ])
    expect(nachrichtAus(mensch('thorsten: ja, 150 € passen'), MITGLIEDER)?.system).toBe(false)
    expect(nachrichtAus(bot('raumleiter', 'WACHHALTER: hat gefragt'), MITGLIEDER)?.system).toBe(false)
  })
})

describe('brauchtAus / fertigAus / standAus', () => {
  it("is set by the room lead's BRAUCHE after the last human message and cleared by a later one", () => {
    const bisBrauche = [
      mensch('thorsten: @raumleiter RAUM: X'),
      bot('raumleiter', 'STAND: Plane.\nBRAUCHE: Dein Budget für die Reise.'),
      bot('rechercheur', 'BRAUCHE: nichts von dir, nur vom Raumleiter.')
    ]

    expect(brauchtAus(nachrichten(bisBrauche))).toBe('Dein Budget für die Reise.')
    expect(standAus(nachrichten(bisBrauche))).toBe('Plane.')
    expect(brauchtAus(nachrichten([...bisBrauche, mensch('thorsten: 2000 Euro.')]))).toBeUndefined()
    expect(brauchtAus(nachrichten([mensch('thorsten: hallo'), bot('raumleiter', 'STAND: läuft')]))).toBeUndefined()
  })

  it('reads FERTIG the same way', () => {
    const fertig = [mensch('thorsten: los'), bot('raumleiter', 'FERTIG: Packliste liegt vor.')]

    expect(fertigAus(nachrichten(fertig))).toBe(true)
    expect(fertigAus(nachrichten([...fertig, mensch('thorsten: danke, weiter')]))).toBe(false)
    expect(fertigAus(nachrichten([...fertig, mensch(SYSTEM_NACHRICHTEN[1]!)]))).toBe(true)
  })

  it('keeps BRAUCHE open across system messages until the room lead closes with STAND/FERTIG or the person answers', () => {
    const offen = [mensch('thorsten: @raumleiter Plane die Feier.'), bot('raumleiter', BRAUCHE_TEXT)]

    for (const text of SYSTEM_NACHRICHTEN) {
      offen.push(mensch(text))
      expect(brauchtAus(nachrichten(offen)), text).toBe('Budget? Vorschlag 150 €')
    }

    // The last room-lead message counts; one without STAND/FERTIG leaves the question standing.
    expect(brauchtAus(nachrichten([...offen, bot('raumleiter', ZWISCHENRUF)]))).toBe('Budget? Vorschlag 150 €')
    expect(
      brauchtAus(nachrichten([...offen, bot('raumleiter', ZWISCHENRUF), bot('raumleiter', STAND_OHNE_BRAUCHE)]))
    ).toBeUndefined()
    expect(brauchtAus(nachrichten([...offen, mensch('thorsten: ja, 150 € passen')]))).toBeUndefined()
  })
})

describe('aufgabenAus', () => {
  it('parses checked and unchecked items of the AUFGABEN block and nothing else', () => {
    const text = [
      'STAND: zweite Runde',
      'AUFGABEN:',
      '- [x] Häuser an der Ostsee sammeln',
      '- [ ] Preise vergleichen',
      '* [ ] Packliste',
      '',
      'TÜR: Recherche Küste'
    ].join('\n')

    expect(aufgabenAus(text)).toEqual([
      { text: 'Häuser an der Ostsee sammeln', erledigt: true },
      { text: 'Preise vergleichen', erledigt: false },
      { text: 'Packliste', erledigt: false }
    ])
    expect(aufgabenAus('- [ ] ohne Kopf')).toEqual([])
  })

  it('reads a bold header with a remark and star bullets the way the schedule does', () => {
    expect(aufgabenAus(AUFGABEN_TEXT)).toEqual([
      { text: 'Häuser an der Ostsee sammeln', erledigt: true },
      { text: 'Preise vergleichen', erledigt: false }
    ])
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
        raum('tikki-still-3', 'Still', { updated_at: 1 })
      ],
      {
        'tikki-app-1': [mensch('thorsten: los'), bot('raumleiter', 'BRAUCHE: Freigabe fürs Budget')],
        'tikki-urlaub-2': [mensch('thorsten: los')]
      },
      { 'tikki-urlaub-2': [{ kind: 'approval', member_id: 'raumleiter', request_id: 'r1' }] }
    )

    await ladeSuites()

    expect($suitesStatus.get()).toBe('bereit')
    expect($suites.get().map(s => s.id)).toEqual(['tikki-urlaub-2', 'tikki-app-1', 'tikki-still-3'])
    expect($suites.get().find(s => s.id === 'tikki-app-1')).toMatchObject({ brauche: 'Freigabe fürs Budget' })
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
  it('creates the room with the base crew and the chosen roles, enters it, then briefs the room lead', async () => {
    gateway([])

    const suite = await neueSuite('Urlaub Ostsee', 'Ein Plan mit Haus und Kosten.', { rollen: ['rechercheur'] })
    await warten()

    expect(methoden().slice(0, 3)).toEqual(['groups.list', 'groups.create', 'groups.send'])
    const create = calls()[1]![1]
    const members = create.members as { member_id: string; profile: string }[]

    expect(create.room_id).toMatch(/^tikki-urlaub-ostsee-[0-9a-z]+$/)
    expect(create.name).toBe('Urlaub Ostsee')
    const grundbesatzung = KATALOG.filter(r => r.im_raum_ab_start).map(r => r.slug)
    expect(grundbesatzung.length).toBeGreaterThanOrEqual(2)
    expect(members.map(m => m.member_id)).toEqual([...grundbesatzung, 'rechercheur'])
    expect(members.every(m => m.profile)).toBe(true)
    expect(calls()[2]![1]).toMatchObject({
      room_id: create.room_id,
      payload: {
        text: 'thorsten: @raumleiter RAUM: Urlaub Ostsee\nZIEL: Ein Plan mit Haus und Kosten.\nBitte plane die erste Runde und melde dich im Raum.',
        thread_id: 'haupt'
      }
    })
    expect((calls()[2]![1].event_id as string).startsWith('tikki:')).toBe(true)
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

  it("briefs the person's room first, then opens practice runs as sibling rooms named for the person", async () => {
    $uebungslaeufe.set(4)
    gateway([])

    await neueSuite('App', 'Eine Hausaufgaben-App.')
    await warten()

    const creates = calls().filter(([m]) => m === 'groups.create')
    const briefs = calls().filter(([m]) => m === 'groups.send')

    expect(creates.map(([, p]) => p.name)).toEqual([
      'App',
      'App-thorsten-2@tikki.team',
      'App-thorsten-3@tikki.team',
      'App-thorsten-4@tikki.team'
    ])
    expect(creates.map(([, p]) => p.room_id)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^tikki-app-thorsten-2-tikki-team-/)])
    )
    expect((briefs[0]![1].payload as { text: string }).text).toMatch(/^thorsten: @raumleiter RAUM: App\n/)
    expect((briefs[1]![1].payload as { text: string }).text).toMatch(/^thorsten: @raumleiter ÜBUNG 2\/4\nANSATZ: /)
  })

  it('opens only as many practice runs as the house has room for, and none for a standing order', async () => {
    $uebungslaeufe.set(4)
    $kapazitaet.set(2)
    gateway([])

    await neueSuite('Recherche', 'Etwas finden.')
    await warten()
    expect(methoden().filter(m => m === 'groups.create')).toHaveLength(2)

    rpc.mockReset()
    $suites.set([])
    $suitesStatus.set('idle')
    $kapazitaet.set(40)
    gateway([])
    await neueSuite('Förderung', 'Täglich prüfen.', { takt: 'täglich 06:00' })
    await warten()
    expect(methoden().filter(m => m === 'groups.create')).toHaveLength(1)
    expect((calls().find(([m]) => m === 'groups.send')![1].payload as { text: string }).text).toContain(
      '\nTAKT: täglich 06:00\n'
    )
  })
})

describe('verschmelzen', () => {
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

    expect(
      text.startsWith('thorsten: @raumleiter Dieser Raum ist aus zwei Räumen verschmolzen: „Recherche“ und „Website“')
    ).toBe(true)
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
