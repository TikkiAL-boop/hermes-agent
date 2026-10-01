import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const rpc = vi.fn()

vi.mock('@/store/gateway', () => ({ activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }) }))

const { SuiteRoom } = await import('./suite-room')
const { $suites } = await import('./store')
const { $gatewayState } = await import('@/store/session')

const MITGLIEDER = [
  { member_id: 'raumleiter', profile: 'raumleiter', handle: 'raumleiter', display_name: 'Raumleiter' },
  { member_id: 'rechercheur', profile: 'rechercheur', handle: 'rechercheur', display_name: 'Rechercheur' }
]

const suite = { id: 'tikki-urlaub-1', titel: 'Urlaub', mitglieder: MITGLIEDER, geaendert: 1, letzteSeq: 5 }

const events = [
  {
    seq: 1,
    event_id: 'e1',
    kind: 'message.user',
    actor: { kind: 'user', id: 'tikki' },
    payload: { text: 'thorsten: @raumleiter RAUM: Urlaub', thread_id: 'haupt' },
    created_at: 1_790_000_000
  },
  {
    seq: 2,
    event_id: 'e2',
    kind: 'turn.started',
    actor: { kind: 'gateway', id: 'gw' },
    payload: { member_id: 'raumleiter' },
    created_at: 1_790_000_001
  },
  {
    seq: 3,
    event_id: 'e3',
    kind: 'message.member',
    actor: { kind: 'member', id: 'rechercheur' },
    payload: { member_id: 'rechercheur', text: '(pass)' },
    created_at: 1_790_000_002
  },
  {
    seq: 4,
    event_id: 'e4',
    kind: 'message.member',
    actor: { kind: 'member', id: 'raumleiter' },
    payload: {
      member_id: 'raumleiter',
      text: 'STAND: Plane.\nAUFGABEN:\n- [x] Küste wählen\n- [ ] Haus suchen\nBRAUCHE: Dein Budget.'
    },
    created_at: 1_790_000_003
  },
  {
    seq: 5,
    event_id: 'e5',
    kind: 'turn.started',
    actor: { kind: 'gateway', id: 'gw' },
    payload: { member_id: 'rechercheur' },
    created_at: 1_790_000_004
  }
]

afterEach(cleanup)
beforeEach(() => {
  rpc.mockReset()
  $gatewayState.set('open')
  $suites.set([suite, { id: 'tikki-kueste-2', titel: 'Küste', mitglieder: MITGLIEDER, geaendert: 0, letzteSeq: 0 }])

  rpc.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    switch (method) {
      case 'groups.log': {
        const seite = events.filter(e => e.seq > Number(params.since_seq ?? 0))

        return { events: seite, cursor: seite.at(-1)?.seq ?? params.since_seq, latest_seq: 5, has_more: false }
      }

      case 'groups.state':
        return {
          room: suite,
          driver_status: {
            running: true,
            pending_actions: [
              {
                kind: 'approval',
                member_id: 'rechercheur',
                task_id: 't1',
                execution_generation: 2,
                request_id: 'r1',
                approval: { tool: 'terminal', command: 'ls' }
              }
            ]
          }
        }

      case 'groups.send':
        return { event: { ...events[0], seq: 6, payload: params.payload } }

      default:
        return {}
    }
  })
})

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <SuiteRoom suite={suite} />
    </I18nProvider>
  )

describe('SuiteRoom', () => {
  it('shows who said what, hides (pass), reads the walls from the room lead, and shows who thinks', async () => {
    const { container } = mount()

    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(2))
    const [m, r] = [...container.querySelectorAll('[data-suite-nachricht]')]

    expect(m?.getAttribute('data-suite-nachricht')).toBe('mensch')
    expect(m?.textContent).toContain('thorsten')
    expect(m?.textContent).toContain('@raumleiter RAUM: Urlaub')
    expect(r?.textContent).toContain('Raumleiter')
    expect(container.textContent).not.toContain('(pass)')
    expect(container.querySelector('[data-suite-denkt]')?.getAttribute('data-suite-denkt')).toBe('rechercheur')
    expect(container.querySelector('[data-suite-arbeitet="true"]')?.getAttribute('data-suite-stuhl')).toBe(
      'rechercheur'
    )
    expect([...container.querySelectorAll('[data-suite-todos] li')].map(li => li.textContent)).toEqual([
      'Küste wählen',
      'Haus suchen'
    ])
    expect(container.querySelector('[data-suite-brauche]')?.textContent).toContain('Dein Budget.')
    expect(container.querySelector('[data-suite-freigaben]')?.textContent).toContain('Rechercheur')
  })

  it('sends what the person types with the name in front, and answers an approval with groups.approve', async () => {
    const { container, getByLabelText, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-freigaben]')).toBeTruthy())

    fireEvent.change(getByLabelText(/In den Raum sprechen/), { target: { value: '2000 Euro' } })
    fireEvent.keyDown(getByLabelText(/In den Raum sprechen/), { key: 'Enter' })

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'groups.send',
        expect.objectContaining({
          room_id: 'tikki-urlaub-1',
          payload: { text: 'thorsten: 2000 Euro', thread_id: 'haupt' }
        })
      )
    )

    fireEvent.click(getByRole('button', { name: 'Einmal erlauben' }))

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('groups.approve', {
        room_id: 'tikki-urlaub-1',
        member_id: 'rechercheur',
        task_id: 't1',
        execution_generation: 2,
        choice: 'once',
        request_id: 'r1'
      })
    )
  })

  it('speaks through a door into another room, addressed to its room lead', async () => {
    const { container, getByLabelText, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-log]')).toBeTruthy())
    fireEvent.click(getByRole('button', { name: 'Türen' }))
    fireEvent.click(container.querySelector('[data-suite-tuer="tikki-kueste-2"]')!)
    fireEvent.change(getByLabelText('Nachricht an den anderen Raum'), { target: { value: 'Bitte den Stand' } })
    fireEvent.click(getByRole('button', { name: 'Durch die Tür schicken' }))

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'groups.send',
        expect.objectContaining({
          room_id: 'tikki-kueste-2',
          payload: { text: '[Tür aus „Urlaub“] @raumleiter Bitte den Stand', thread_id: 'haupt' }
        })
      )
    )
  })
})
