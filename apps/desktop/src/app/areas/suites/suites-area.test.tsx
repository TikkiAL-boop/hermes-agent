import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

const rpc = vi.fn()

vi.mock('@/store/gateway', () => ({
  activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }),
  requestGatewayForProfile: (_profil: string, ...args: unknown[]) => rpc(...args)
}))
// The lobby is under test; the room polls its own log.
vi.mock('./suite-room', () => ({ SuiteRoom: () => null }))

const { SuitesArea, suiteHinweis } = await import('./suites-area')
const { $suites, $suitesStatus } = await import('./store')
const { areaLabels } = await import('../labels')

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

const suite = (id: string, titel: string) => ({ id, titel, mitglieder: [], geaendert: 0, letzteSeq: 0 })

describe('SuitesArea', () => {
  it('opens on an empty history and shows the room lead who sits in every suite', async () => {
    rpc.mockResolvedValue({ rooms: [] })
    const { container, getByText } = mount()

    await waitFor(() => expect(container.querySelector('[data-suites-leer]')).toBeTruthy())
    expect(getByText('Noch keine Suites.')).toBeTruthy()
    const karte = container.querySelector('[data-suite-raumleiter]')

    expect(karte?.textContent).toContain('Raumleiter')
    expect(karte?.textContent).toContain('Hauptmodell')
    expect(karte?.textContent).toContain('Ausweichmodell')
    expect(rpc).toHaveBeenCalledWith('groups.list', { limit: 200 })
  })

  it('offers the form for a new suite, with roles to seat, and asks for a name before it can be opened', async () => {
    rpc.mockResolvedValue({ rooms: [] })
    const { container, getByPlaceholderText, getByRole } = mount()

    await waitFor(() => expect(container.querySelector('[data-suites-leer]')).toBeTruthy())
    fireEvent.click(getByRole('button', { name: /Neue Suite/ }))
    const eroeffnen = getByRole('button', { name: /Suite eröffnen/ }) as HTMLButtonElement

    expect(eroeffnen.disabled).toBe(true)
    expect(container.querySelectorAll('[data-suite-rollen] button').length).toBeGreaterThan(0)
    fireEvent.change(getByPlaceholderText('z. B. Urlaub Ostsee'), { target: { value: 'Urlaub Ostsee' } })
    expect(eroeffnen.disabled).toBe(false)
  })
})

describe('suiteHinweis', () => {
  it('tells what waits for the person before anything else, then who works, else who sits there', () => {
    const s = areaLabels('de').suites
    const basis = { ...suite('a', 'A'), mitglieder: [{ member_id: 'raumleiter', profile: 'raumleiter', handle: 'rl' }] }
    const leer = { freigaben: [], wiederholbar: [], rueckfragen: [] }
    const frage = { raum: 'a', sitzung: 's', anfrage: 'srq-1', frage: 'Welches Budget?', auswahl: [], teile: [] }

    expect(suiteHinweis({ ...basis, arbeitet: 'raumleiter', offen: { ...leer, rueckfragen: [frage] } }, s)).toBe(
      'Welches Budget?'
    )
    expect(suiteHinweis({ ...basis, offen: { ...leer, freigaben: [{ kind: 'approval' }] } }, s)).toBe(s.offeneFreigabe)
    expect(suiteHinweis({ ...basis, offen: { ...leer, wiederholbar: [{ kind: 'retry' }] } }, s)).toBe(
      s.rundeGescheitert
    )
    expect(suiteHinweis({ ...basis, arbeitet: 'raumleiter', offen: leer }, s)).toBe(`rl ${s.arbeitet}`)
    expect(suiteHinweis(basis, s)).toBe(s.mitglieder(1))
  })
})
