import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const rpc = vi.fn()
const submit = vi.fn((..._args: unknown[]) => true)

vi.mock('@/store/gateway', () => ({
  activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }),
  requestGatewayForProfile: (_profil: string, ...args: unknown[]) => rpc(...args)
}))
vi.mock('@/app/chat/composer/focus', () => ({ requestComposerSubmit: (...args: unknown[]) => submit(...args) }))
// Neighbours with their own tests; the frame is under test.
vi.mock('../browser-tabs', () => ({ oeffneImBrowser: vi.fn() }))
vi.mock('@/api/profiles', () => ({ getProfiles: async () => ({ profiles: backend.profile }) }))
vi.mock('./update-waechter', async () => {
  const { atom } = await import('nanostores')

  return { $updateStand: atom(null), startUpdateWaechter: () => () => undefined }
})

const { VorzimmerRahmen } = await import('./vorzimmer-rahmen')
const { $gatewayState } = await import('@/store/session')
const { $suites, $suitesBrauchen } = await import('../suites/store')
const { $modellsucheStatus } = await import('./modelle')
const { $rollenStand } = await import('../admin/rollen-stand')
const { rolle } = await import('../admin/katalog')

/** Every RPC that only reads. Anything else would be the app acting on its own. */
const LESEND = new Set(['groups.list', 'groups.log', 'groups.state', 'session.active_list', 'session.events.since'])

const raum = (room_id: string, name: string) => ({
  room_id,
  name,
  members: [{ member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' }],
  updated_at: 1,
  latest_seq: 0
})

/** What the backend holds; a test changes it the way another surface would. */
const backend: {
  profile: { model?: string; name: string; provider?: string }[]
  raeume: ReturnType<typeof raum>[]
  wartend: string[]
} = { profile: [], raeume: [], wartend: [] }

beforeEach(() => {
  vi.useFakeTimers()
  rpc.mockReset()
  submit.mockClear()
  backend.profile = []
  backend.raeume = []
  backend.wartend = []
  $rollenStand.set(null)
  $suites.set([])
  $suitesBrauchen.set([])
  // The model search is its own feature (and its own test); it has run.
  $modellsucheStatus.set('bereit')
  $gatewayState.set('open')

  rpc.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    switch (method) {
      case 'groups.list':
        return { rooms: backend.raeume }

      case 'groups.log':
        return { events: [], cursor: 0, latest_seq: 0, has_more: false }

      case 'groups.state':
        return { driver_status: { pending_actions: [] } }

      case 'session.active_list':
        return {
          sessions: backend.wartend.map((id, i) => ({ id: `s${i}`, status: 'waiting', title: `Group: ${id}` }))
        }

      case 'session.events.since':
        return { open_requests: [{ id: 'srq-1', method: 'clarify', params: { question: 'Welches Budget?' } }] }

      case 'cron.manage':
        return params.action === 'list' ? { jobs: [] } : { success: true }

      default:
        return {}
    }
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <VorzimmerRahmen>
        <div data-test-chat="" />
      </VorzimmerRahmen>
    </I18nProvider>
  )

const vergehen = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('VorzimmerRahmen', () => {
  it('puts nothing into the conversation on its own, however long the app stays open', async () => {
    mount()
    await vergehen(26 * 3_600_000)

    expect(submit).not.toHaveBeenCalled()

    const schreibend = rpc.mock.calls.filter(
      ([method, params]) => !LESEND.has(method) && !(method === 'cron.manage' && params?.action === 'list')
    )

    expect(schreibend).toEqual([])
  })

  it("sends the person's own short request when they press the briefing button, and only then", async () => {
    const { container } = mount()

    await vergehen(0)
    fireEvent.click(container.querySelector('[data-vorzimmer-briefing]')!)

    expect(submit.mock.calls).toEqual([['Gib mir bitte ein Briefing.', { target: 'main' }]])
  })

  it('shows a room another surface opened, and that it waits, without the person doing anything', async () => {
    const { container } = mount()

    await vergehen(0)
    expect(container.querySelector('[data-vorzimmer-suite]')).toBeNull()

    // Tikki opens a room with her tool; its lead asks a question.
    backend.raeume = [raum('tikki-urlaub-1', 'Urlaub')]
    backend.wartend = ['tikki-urlaub-1']
    await vergehen(61_000)

    const wartet = [...container.querySelectorAll('[data-vorzimmer-suite="tikki-urlaub-1"]')]

    expect(wartet.length).toBeGreaterThan(0)
    expect(wartet.some(knopf => knopf.textContent?.includes('Welches Budget?'))).toBe(true)
  })

  it("names the model Tikki's profile is set to, not the one a fresh setup would write", async () => {
    const tikki = rolle('tikki')!

    backend.profile = [{ model: 'eigenes-modell', name: 'tikki', provider: 'eigener-anbieter' }]

    const { container } = mount()

    await vergehen(0)

    expect(container.textContent).toContain('eigener-anbieter/eigenes-modell')
    expect(container.textContent).not.toContain(tikki.modell.primary)
  })

  it('has a handle to move the window by: the Vorzimmer is the one area the shell gives none', async () => {
    const { container } = mount()

    await vergehen(0)

    expect(container.querySelector('[data-vorzimmer] .tikki-fenstergriff')).toBeTruthy()
  })
})
