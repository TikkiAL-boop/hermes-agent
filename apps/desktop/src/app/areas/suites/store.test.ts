import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const setArea = vi.fn()

vi.mock('@/store/gateway', () => ({
  requestGatewayForProfile: (...args: unknown[]) => rpc(...args)
}))
vi.mock('../store', () => ({ setArea: (...args: unknown[]) => setArea(...args) }))

const { $aktiveSuite, $suites, $suitesFehler, $suitesStatus, ladeSuites, neueSuite, SUITE_PROFIL, SUITE_QUELLE } =
  await import('./store')

const calls = () => rpc.mock.calls.map(([profile, method, params]) => [profile, method, params])

beforeEach(() => {
  rpc.mockReset()
  setArea.mockReset()
  $aktiveSuite.set(null)
  $suites.set([])
  $suitesStatus.set('idle')
  $suitesFehler.set(null)
})

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
})
