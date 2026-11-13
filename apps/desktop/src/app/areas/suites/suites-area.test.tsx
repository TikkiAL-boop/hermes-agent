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
const { $neueSuiteOffen, $suites, $suitesStatus } = await import('./store')
const { leereFormular } = await import('./formular')
const { areaLabels } = await import('../labels')

afterEach(cleanup)
beforeEach(() => {
  rpc.mockReset()
  $suites.set([])
  $suitesStatus.set('idle')
  $neueSuiteOffen.set(false)
  leereFormular()
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

  /** Open the form and write a name and a goal into it. */
  const fuelleFormular = async (ansicht: ReturnType<typeof mount>) => {
    await waitFor(() => expect(ansicht.container.querySelector('[data-suites-leer]')).toBeTruthy())
    fireEvent.click(ansicht.getByRole('button', { name: /Neue Suite/ }))
    fireEvent.change(ansicht.getByPlaceholderText('z. B. Urlaub Ostsee'), { target: { value: 'Urlaub Ostsee' } })
    fireEvent.change(ansicht.container.querySelector('[data-suite-form] textarea')!, {
      target: { value: 'Zwei Wochen im Juli, Ferienhaus mit Hund, höchstens 2000 Euro' }
    })
  }

  const imFormular = (container: HTMLElement) => ({
    name: container.querySelector<HTMLInputElement>('[data-suite-form] input')!.value,
    ziel: container.querySelector<HTMLTextAreaElement>('[data-suite-form] textarea')!.value
  })

  const GESCHRIEBEN = { name: 'Urlaub Ostsee', ziel: 'Zwei Wochen im Juli, Ferienhaus mit Hund, höchstens 2000 Euro' }

  it('keeps what the person wrote when the suite could not be opened, so they can try again', async () => {
    rpc.mockImplementation(async (method: string) => {
      if (method === 'groups.list') {
        return { rooms: [] }
      }

      throw new Error('gateway offline')
    })

    const ansicht = mount()

    await fuelleFormular(ansicht)
    fireEvent.submit(ansicht.container.querySelector('[data-suite-form]')!)

    // The attempt went out and failed …
    await waitFor(() => expect(rpc.mock.calls.some(([method]) => method !== 'groups.list')).toBe(true))
    await waitFor(() =>
      expect(ansicht.container.querySelector<HTMLInputElement>('[data-suite-form] input')!.disabled).toBe(false)
    )
    // … and the form is as it was.
    expect(imFormular(ansicht.container)).toEqual(GESCHRIEBEN)
  })

  it('still has the half-written suite after the person looked at another area', async () => {
    rpc.mockResolvedValue({ rooms: [] })

    const erste = mount()

    await fuelleFormular(erste)
    // The shell unmounts the lobby while another area is on screen.
    erste.unmount()

    const zweite = mount()

    await waitFor(() => expect(zweite.container.querySelector('[data-suite-form]')).toBeTruthy())
    expect(imFormular(zweite.container)).toEqual(GESCHRIEBEN)
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
