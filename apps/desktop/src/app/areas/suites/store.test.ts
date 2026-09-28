import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const setArea = vi.fn()

vi.mock('@/store/gateway', () => ({
  requestGatewayForProfile: (...args: unknown[]) => rpc(...args)
}))
vi.mock('../store', () => ({ setArea: (...args: unknown[]) => setArea(...args) }))
vi.mock('@/store/session-states', async () => {
  const { atom } = await import('nanostores')

  return { $workingSessionIds: atom<string[]>([]) }
})

const { $aktiveSuite, $suites, $suitesFehler, $suitesStatus, ladeSuites, neueSuite, SUITE_PROFIL, SUITE_QUELLE } =
  await import('./store')

const { $kapazitaet, $uebungslaeufe } = await import('../admin/betrieb-store')

const calls = () => rpc.mock.calls.map(([profile, method, params]) => [profile, method, params])

beforeEach(() => {
  rpc.mockReset()
  setArea.mockReset()
  $aktiveSuite.set(null)
  $suites.set([])
  $suitesStatus.set('idle')
  $suitesFehler.set(null)
  $uebungslaeufe.set(1)
  $kapazitaet.set(40)
})

const neuerRaum = () => {
  let n = 0

  rpc.mockImplementation(async (_profile: string, method: string) => {
    if (method === 'session.list') {
      return { sessions: [] }
    }

    if (method === 'session.create') {
      n += 1

      return { session_id: `rt-${n}`, stored_session_id: `st-${n}` }
    }

    return {}
  })
}

const warten = () => new Promise(resolve => setTimeout(resolve, 0))

describe('ladeSuites', () => {
  it('starts with zero suites when the room lead profile has no sessions', async () => {
    rpc.mockResolvedValueOnce({ sessions: [] })

    await ladeSuites()

    expect($suites.get()).toEqual([])
    expect($suitesStatus.get()).toBe('bereit')
    expect(calls()).toEqual([
      [SUITE_PROFIL, 'session.list', { include_hidden: true, limit: 200, profile: SUITE_PROFIL }]
    ])
  })

  it("lists only sessions born as suites, never the profile's other chats", async () => {
    rpc.mockResolvedValueOnce({
      sessions: [
        { id: 'a', title: 'Bot Chat', source: 'desktop' },
        {
          id: 'b',
          resolved_id: 'b2',
          title: 'Urlaub Ostsee',
          source: SUITE_QUELLE,
          message_count: 3,
          preview: 'RAUM: Urlaub'
        }
      ]
    })

    await ladeSuites()

    expect($suites.get()).toEqual([
      {
        id: 'b',
        resolvedId: 'b2',
        titel: 'Urlaub Ostsee',
        vorschau: 'RAUM: Urlaub',
        gestartet: undefined,
        nachrichten: 3
      }
    ])
  })

  it('reports a failed list as an error, not as an empty history', async () => {
    rpc.mockRejectedValueOnce(new Error("Profile 'raumleiter' does not exist"))

    await ladeSuites()

    expect($suitesStatus.get()).toBe('fehler')
    expect($suitesFehler.get()).toContain('does not exist')
  })
})

describe('neueSuite', () => {
  it('looks the title up, creates and titles the session, opens it, then briefs the room lead', async () => {
    rpc.mockImplementation(async (_profile: string, method: string) => {
      if (method === 'session.list') {
        return { sessions: [] }
      }

      if (method === 'session.create') {
        return { session_id: 'rt-1', stored_session_id: 'st-1' }
      }

      return {}
    })

    await neueSuite('Urlaub Ostsee', 'Ein Plan mit Haus und Kosten.')

    const methods = calls().map(([, method]) => method)

    expect(methods.slice(0, 5)).toEqual([
      'session.list',
      'session.create',
      'session.title',
      'prompt.submit',
      'session.list'
    ])
    expect(calls()[1][2]).toMatchObject({
      profile: SUITE_PROFIL,
      source: SUITE_QUELLE,
      title: 'Urlaub Ostsee',
      follow_profile_config: true
    })
    expect(calls()[2][2]).toMatchObject({ session_id: 'rt-1', title: 'Urlaub Ostsee' })
    expect(calls()[3][2]).toMatchObject({
      session_id: 'rt-1',
      text: 'RAUM: Urlaub Ostsee\nZIEL: Ein Plan mit Haus und Kosten.\nBitte plane die erste Runde und melde dich im Raum.'
    })
    // The person stands in the new room before the brief goes out.
    expect($aktiveSuite.get()).toMatchObject({ id: 'st-1', titel: 'Urlaub Ostsee' })
    expect(setArea).toHaveBeenCalledWith('suites')
  })

  it('adopts an existing suite of the same name instead of forking it', async () => {
    rpc.mockResolvedValueOnce({ sessions: [{ id: 'alt', title: 'Urlaub Ostsee', source: SUITE_QUELLE }] })

    await neueSuite('Urlaub Ostsee', '')

    expect(calls().map(([, method]) => method)).toEqual(['session.list'])
    expect($aktiveSuite.get()).toMatchObject({ id: 'alt', titel: 'Urlaub Ostsee' })
  })

  it("briefs the person's room first, then opens practice runs as other rooms with other models", async () => {
    $uebungslaeufe.set(4)
    neuerRaum()

    await neueSuite('App', 'Eine Hausaufgaben-App.')
    await warten()

    const creates = calls().filter(([, method]) => method === 'session.create')
    const briefs = calls().filter(([, method]) => method === 'prompt.submit')

    expect(creates.map(([, , params]) => (params as { title: string }).title)).toEqual([
      'App',
      'App-thorsten-2@tikki.team',
      'App-thorsten-3@tikki.team',
      'App-thorsten-4@tikki.team'
    ])
    expect(briefs[0]![2]).toMatchObject({ session_id: 'rt-1' })
    expect(new Set(creates.slice(1).map(([, , params]) => (params as { model?: string }).model)).size).toBe(3)
    expect((briefs[1]![2] as { text: string }).text).toMatch(/^ÜBUNG 2\/4\nANSATZ: /)

    const prioritaeten = rpc.mock.calls
      .filter(([, method]) => method === 'session.create')
      .map(call => (call[5] as { spawnPriority: string }).spawnPriority)

    expect(prioritaeten).toEqual(['foreground', 'background', 'background', 'background'])
  })

  it('opens only as many practice runs as the house has room for, and none for a standing order', async () => {
    $uebungslaeufe.set(4)
    $kapazitaet.set(2)
    neuerRaum()

    await neueSuite('Recherche', 'Etwas finden.')
    await warten()
    expect(calls().filter(([, method]) => method === 'session.create')).toHaveLength(2)

    rpc.mockReset()
    $kapazitaet.set(40)
    neuerRaum()
    await neueSuite('Förderung', 'Täglich prüfen.', { takt: 'täglich 06:00' })
    await warten()
    expect(calls().filter(([, method]) => method === 'session.create')).toHaveLength(1)
    expect(calls().find(([, method]) => method === 'prompt.submit')![2]).toMatchObject({
      text: expect.stringContaining('\nTAKT: täglich 06:00\n')
    })
  })
})
