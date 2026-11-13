import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

interface Profil {
  gateway_running?: boolean
  model?: string
  name: string
  provider?: string
}

const backend: { antwortet: boolean; profile: Profil[] } = { antwortet: true, profile: [] }

vi.mock('@/api/profiles', () => ({
  getProfiles: async () => {
    if (!backend.antwortet) {
      throw new Error('backend offline')
    }

    return { profiles: backend.profile }
  }
}))
// Hermes' own model panel has its own tests.
vi.mock('@/app/settings/model-settings', () => ({ ModelSettings: () => null }))

const { BotsSection } = await import('./bots')
const { ModelleSection } = await import('./modelle')
const { $rollenStand, $rollenStandStatus, hauptmodell, modellkette } = await import('./rollen-stand')
const { rolle, ROLLEN } = await import('./katalog')

// The page cannot ask a role's port (cross-origin, no CORS): any try fails the test.
const seitenFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

beforeEach(() => {
  backend.antwortet = true
  backend.profile = []
  $rollenStand.set(null)
  $rollenStandStatus.set('leer')
  vi.stubGlobal('fetch', seitenFetch)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  seitenFetch.mockClear()
})

const mount = (Section: () => React.ReactElement) =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <Section />
    </I18nProvider>
  )

const [LAEUFT, STEHT, FEHLT] = ROLLEN.map(r => r.slug) as [string, string, string]

describe('the troop on screen', () => {
  it('says of every bot what the backend says: running, stopped, not set up', async () => {
    backend.profile = [
      { gateway_running: true, model: 'm1', name: LAEUFT, provider: 'p1' },
      { gateway_running: false, model: 'm2', name: STEHT }
    ]

    const { container } = mount(BotsSection)
    const zustand = (slug: string) => container.querySelector(`[data-bot="${slug}"]`)!.getAttribute('data-bot-zustand')

    await waitFor(() => expect(zustand(LAEUFT)).toBe('online'))
    expect(zustand(STEHT)).toBe('offline')
    expect(zustand(FEHLT)).toBe('missing')
    expect(seitenFetch).not.toHaveBeenCalled()
  })

  it('claims nothing about any bot while the backend has not answered', async () => {
    backend.antwortet = false

    const { container } = mount(BotsSection)

    await waitFor(() => expect(container.querySelector('[data-bots-status="fehler"]')).toBeTruthy())

    const zustaende = new Set(
      [...container.querySelectorAll('[data-bot]')].map(karte => karte.getAttribute('data-bot-zustand'))
    )

    expect([...zustaende]).toEqual(['unknown'])
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('shows the model a profile was switched to in Bots and in Models alike', async () => {
    backend.profile = [{ gateway_running: true, model: 'umgestellt', name: LAEUFT, provider: 'anderer' }]

    const bots = mount(BotsSection)

    await waitFor(() =>
      expect(bots.container.querySelector(`[data-bot="${LAEUFT}"] [data-bot-modell]`)!.textContent).toBe(
        'anderer/umgestellt'
      )
    )
    bots.unmount()

    const modelle = mount(ModelleSection)

    const zelle = (slug: string) =>
      modelle.container.querySelector(`[data-modell-rolle="${slug}"] [data-modell-eingestellt]`)!.textContent

    await waitFor(() => expect(zelle(LAEUFT)).toBe('anderer/umgestellt'))
    // A role without a profile runs on nothing; the catalogue's model is not passed off as its model.
    expect(zelle(FEHLT)).not.toContain(rolle(FEHLT)!.modell.primary)
  })
})

describe('modellkette / hauptmodell', () => {
  const r = rolle(LAEUFT)!

  it('follow the profile once it names a model other than the catalogue’s', () => {
    const stand = { [LAEUFT]: { laeuft: true, modell: 'anderer/umgestellt' } }

    expect(modellkette(r, stand)).toBe('anderer/umgestellt')
    expect(hauptmodell(r, stand)).toBe('anderer/umgestellt')
  })

  it('fall back to the catalogue while the backend has not said otherwise', () => {
    for (const stand of [null, {}, { [LAEUFT]: { laeuft: true, modell: null } }]) {
      expect(modellkette(r, stand)).toContain(r.modell.primary)
      expect(hauptmodell(r, stand)).toBe(r.modell.primary)
    }
  })
})
