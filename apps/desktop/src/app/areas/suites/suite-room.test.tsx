import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const rpc = vi.fn()
const sprich = vi.fn(async () => 'hermes' as const)

vi.mock('@/store/gateway', () => ({
  activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }),
  requestGatewayForProfile: (_profil: string, ...args: unknown[]) => rpc(...args)
}))
vi.mock('../tikki/stimme', async importOriginal => ({
  ...((await importOriginal()) as object),
  sprich: (...args: unknown[]) => sprich(...(args as []))
}))

const { SuiteRoom } = await import('./suite-room')
const { $suites } = await import('./store')
const { $gatewayState } = await import('@/store/session')
const { VORLESEN_RAUM } = await import('../tikki/stimme')

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
    actor: { kind: 'user', id: 'desktop' },
    payload: { text: 'thorsten: @raumleiter Plant den Urlaub.', thread_id: 'haupt' },
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
    // Written like the old protocol on purpose: no line of it may turn into state.
    payload: { member_id: 'raumleiter', text: 'STAND: Plane.\nBRAUCHE: Dein Budget.\nTAKT: stündlich' },
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

const FREIGABE = {
  kind: 'approval',
  member_id: 'rechercheur',
  task_id: 't1',
  execution_generation: 2,
  request_id: 'r1',
  approval: { tool: 'terminal', command: 'ls' }
}

/** What the backend reports as open in the room; each test sets what it needs. */
const backend: { anstehend: unknown[]; etappeBis: number; jobs: unknown[]; rueckfragen: unknown[] } = {
  anstehend: [],
  // A long log is handed out in stages: one read ends here although the log goes on.
  etappeBis: Infinity,
  jobs: [],
  rueckfragen: []
}

afterEach(cleanup)
beforeEach(() => {
  rpc.mockReset()
  sprich.mockClear()
  events.length = 5
  backend.anstehend = [FREIGABE]
  backend.etappeBis = Infinity
  backend.jobs = []
  backend.rueckfragen = []
  window.localStorage.removeItem(VORLESEN_RAUM)
  $gatewayState.set('open')
  $suites.set([suite, { id: 'tikki-kueste-2', titel: 'Küste', mitglieder: MITGLIEDER, geaendert: 0, letzteSeq: 0 }])

  rpc.mockImplementation(async (method: string, params: Record<string, unknown>) => {
    switch (method) {
      case 'groups.log': {
        const seite = events.filter(e => e.seq > Number(params.since_seq ?? 0) && e.seq <= backend.etappeBis)

        return {
          events: seite,
          cursor: seite.at(-1)?.seq ?? params.since_seq,
          latest_seq: events.at(-1)!.seq,
          has_more: false
        }
      }

      case 'groups.state':
        return { room: suite, driver_status: { running: true, pending_actions: backend.anstehend } }

      case 'session.active_list':
        return {
          sessions: backend.rueckfragen.length
            ? [{ id: 's-rl', status: 'waiting', title: 'Group: tikki-urlaub-1' }]
            : []
        }

      case 'session.events.since':
        return { open_requests: backend.rueckfragen }

      case 'request.answer':
        backend.rueckfragen = []

        return {}

      case 'groups.retry':
        backend.anstehend = []

        return {}

      case 'cron.manage':
        return { jobs: backend.jobs }

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
  it('shows who said what, hides (pass), shows who thinks and the approval the backend reports', async () => {
    const { container } = mount()

    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(2))
    const [m, r] = [...container.querySelectorAll('[data-suite-nachricht]')]

    expect(m?.getAttribute('data-suite-nachricht')).toBe('mensch')
    expect(m?.textContent).toContain('thorsten')
    expect(m?.textContent).toContain('@raumleiter Plant den Urlaub.')
    expect(r?.textContent).toContain('Raumleiter')
    expect(container.textContent).not.toContain('(pass)')
    expect(container.querySelector('[data-suite-denkt]')?.getAttribute('data-suite-denkt')).toBe('rechercheur')
    expect(container.querySelector('[data-suite-arbeitet="true"]')?.getAttribute('data-suite-stuhl')).toBe(
      'rechercheur'
    )
    await waitFor(() => expect(container.querySelector('[data-suite-freigaben]')?.textContent).toContain('Rechercheur'))
    expect(container.querySelector('[data-suite-brauche]')).toBeTruthy()
  })

  it('takes nothing a model writes for state: no badge, no schedule, nothing to answer', async () => {
    backend.anstehend = []
    const { container } = mount()

    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(2))
    // The words are shown as what they are: something the room lead said.
    expect(container.querySelector('[data-suite-log]')?.textContent).toContain('BRAUCHE: Dein Budget.')
    expect(container.querySelector('[data-suite-brauche]')).toBeNull()
    expect(container.querySelector('[data-suite-takt-marke]')).toBeNull()
    expect(container.querySelector('[data-suite-freigaben]')).toBeNull()
  })

  it("shows a member's open question and sends the person's answer to exactly that request", async () => {
    backend.anstehend = []
    backend.rueckfragen = [
      { id: 'srq-7', method: 'clarify', params: { question: 'Welches Budget?', choices: ['1000 €', '2000 €'] } }
    ]
    const { container, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-rueckfrage="srq-7"]')).toBeTruthy())
    expect(container.querySelector('[data-suite-rueckfrage]')?.textContent).toContain('Welches Budget?')
    expect(container.querySelector('[data-suite-brauche]')).toBeTruthy()

    fireEvent.click(getByRole('button', { name: '2000 €' }))

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('request.answer', { id: 'srq-7', result: { answer: '2000 €' } })
    )
    // Answered on the backend: the card and the badge go with the state, not with a later message.
    await waitFor(() => expect(container.querySelector('[data-suite-rueckfrage]')).toBeNull())
    expect(container.querySelector('[data-suite-brauche]')).toBeNull()
    expect(rpc.mock.calls.some(([method]) => method === 'groups.send')).toBe(false)
  })

  it('offers a failed turn again and shows the schedule Hermes holds for the room', async () => {
    backend.anstehend = [{ kind: 'retry', task_id: 't9' }]
    backend.jobs = [{ job_id: 'j1', name: 'Raumrunde tikki-urlaub-1', schedule_display: 'every 1h' }]
    const { container, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-wiederholen="t9"]')).toBeTruthy())
    await waitFor(() =>
      expect(container.querySelector('[data-suite-takt-marke]')?.getAttribute('data-suite-takt-marke')).toBe('every 1h')
    )

    fireEvent.click(getByRole('button', { name: 'Noch einmal versuchen' }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('groups.retry', { room_id: 'tikki-urlaub-1', task_id: 't9' }))
  })

  it('sends what the person types with the name in front and to the room lead, and answers an approval with groups.approve', async () => {
    const { container, getByLabelText, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-freigaben]')).toBeTruthy())

    fireEvent.change(getByLabelText(/In den Raum sprechen/), { target: { value: '2000 Euro' } })
    fireEvent.keyDown(getByLabelText(/In den Raum sprechen/), { key: 'Enter' })

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith(
        'groups.send',
        expect.objectContaining({
          room_id: 'tikki-urlaub-1',
          payload: { text: 'thorsten: @raumleiter 2000 Euro', thread_id: 'haupt' }
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

  it('offers a microphone next to send and a read-aloud switch in the header that is remembered', async () => {
    const { container, getByLabelText } = mount()

    await waitFor(() => expect(container.querySelector('[data-suite-log]')).toBeTruthy())

    const mikro = container.querySelector('[data-suite-mikro]')
    expect(mikro?.getAttribute('data-suite-mikro')).toBe('idle')
    expect(mikro?.getAttribute('aria-label')).toBe('Mikrofon: sprechen statt tippen')
    expect(mikro?.hasAttribute('title')).toBe(false)

    const schalter = getByLabelText(/Raumleiter vorlesen/)
    expect(schalter.getAttribute('data-suite-vorlesen')).toBe('aus')
    fireEvent.click(schalter)
    expect(schalter.getAttribute('data-suite-vorlesen')).toBe('an')
    expect(schalter.getAttribute('aria-pressed')).toBe('true')
    expect(window.localStorage.getItem(VORLESEN_RAUM)).toBe('1')
    fireEvent.click(schalter)
    expect(schalter.getAttribute('data-suite-vorlesen')).toBe('aus')
    expect(window.localStorage.getItem(VORLESEN_RAUM)).toBeNull()
  })

  it('reads only what the room lead says after the room was opened, never its history', async () => {
    window.localStorage.setItem(VORLESEN_RAUM, '1')
    const { container, getByLabelText } = mount()

    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(2))
    expect(sprich).not.toHaveBeenCalled()

    events.push(
      {
        seq: 6,
        event_id: 'e6',
        kind: 'message.member',
        actor: { kind: 'member', id: 'rechercheur' },
        payload: { member_id: 'rechercheur', text: 'Drei Häuser gefunden.' },
        created_at: 1_790_000_005
      },
      {
        seq: 7,
        event_id: 'e7',
        kind: 'message.member',
        actor: { kind: 'member', id: 'raumleiter' },
        payload: { member_id: 'raumleiter', text: 'Drei Häuser, ich sortiere.' },
        created_at: 1_790_000_006
      }
    )
    // Sending reloads the log right away (the poll would, two seconds later).
    fireEvent.change(getByLabelText(/In den Raum sprechen/), { target: { value: 'Weiter' } })
    fireEvent.keyDown(getByLabelText(/In den Raum sprechen/), { key: 'Enter' })

    await waitFor(() => expect(sprich).toHaveBeenCalledTimes(1))
    expect(sprich).toHaveBeenCalledWith('Drei Häuser, ich sortiere.')
  })

  it('reads none of a long log that arrives in stages, only what is said once the room has caught up', async () => {
    const sagt = (seq: number, text: string) => ({
      seq,
      event_id: `e${seq}`,
      kind: 'message.member',
      actor: { kind: 'member', id: 'raumleiter' },
      payload: { member_id: 'raumleiter', text },
      created_at: 1_790_000_000 + seq
    })

    const sprechen = (text: string) => {
      fireEvent.change(getByLabelText(/In den Raum sprechen/), { target: { value: text } })
      fireEvent.keyDown(getByLabelText(/In den Raum sprechen/), { key: 'Enter' })
    }

    window.localStorage.setItem(VORLESEN_RAUM, '1')
    events.push(sagt(6, 'Schon lange gesagt.'), sagt(7, 'Auch schon lange gesagt.'))
    // The first read ends at 5 although the log goes on to 7.
    backend.etappeBis = 5
    const { container, getByLabelText } = mount()

    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(2))

    // The second stage reaches the end of the log: still history.
    backend.etappeBis = Infinity
    sprechen('Weiter')
    await waitFor(() => expect(container.querySelectorAll('[data-suite-nachricht]').length).toBe(4))
    expect(sprich).not.toHaveBeenCalled()

    events.push(sagt(8, 'Das ist neu.'))
    sprechen('Und jetzt?')
    await waitFor(() => expect(sprich).toHaveBeenCalledTimes(1))
    expect(sprich).toHaveBeenCalledWith('Das ist neu.')
  })

  it("speaks through a door as the person's own message in the other room, addressed to its room lead", async () => {
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
          payload: { text: 'thorsten: @raumleiter Bitte den Stand', thread_id: 'haupt' }
        })
      )
    )
  })
})
