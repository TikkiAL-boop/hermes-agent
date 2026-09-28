import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const rpc = vi.fn()

vi.mock('@/store/gateway', () => ({ requestGatewayForProfile: (...args: unknown[]) => rpc(...args) }))
// The lobby is under test; the room pulls the whole chat surface with it.
vi.mock('./suite-room', () => ({ SuiteRoom: () => null }))

const { SuitesArea, verlaufGruppen } = await import('./suites-area')
const { $suites, $suitesStatus } = await import('./store')

afterEach(cleanup)
beforeEach(() => {
  rpc.mockReset()
  $suites.set([])
  $suitesStatus.set('idle')
})

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <SuitesArea />
    </I18nProvider>
  )

describe('SuitesArea', () => {
  it('opens on an empty history and shows the room lead who sits in every suite', async () => {
    rpc.mockResolvedValue({ sessions: [] })
    const { container, getByText } = mount()

    await waitFor(() => expect(container.querySelector('[data-suites-leer]')).toBeTruthy())
    expect(getByText('Noch keine Suites.')).toBeTruthy()
    const karte = container.querySelector('[data-suite-raumleiter]')

    expect(karte?.textContent).toContain('Raumleiter')
    expect(karte?.textContent).toContain('Hauptmodell')
    expect(karte?.textContent).toContain('Ausweichmodell')
  })

  it('offers the form for a new suite and asks for a name before it can be opened', async () => {
    rpc.mockResolvedValue({ sessions: [] })
    const { container, getByPlaceholderText, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suites-leer]')).toBeTruthy())
    fireEvent.click(getByRole('button', { name: /Neue Suite/ }))
    const eroeffnen = getByRole('button', { name: /Suite eröffnen/ }) as HTMLButtonElement

    expect(eroeffnen.disabled).toBe(true)
    fireEvent.change(getByPlaceholderText('z. B. Urlaub Ostsee'), { target: { value: 'Urlaub Ostsee' } })
    expect(eroeffnen.disabled).toBe(false)
  })
})

describe('verlaufGruppen', () => {
  it("hangs practice runs under their project's room and leaves orphans standing alone", () => {
    const gruppen = verlaufGruppen([
      { id: 'u3', titel: 'App-thorsten-3@tikki.team' },
      { id: 'h', titel: 'App' },
      { id: 'u2', titel: 'App-thorsten-2@tikki.team' },
      { id: 'w', titel: 'Weg-thorsten-2@tikki.team' }
    ])

    expect(gruppen.map(g => [g.suite.id, g.uebungen.map(u => u.id)])).toEqual([
      ['h', ['u2', 'u3']],
      ['w', []]
    ])
  })
})
