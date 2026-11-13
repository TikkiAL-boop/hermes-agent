import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

vi.mock('@/app/settings/memory/provider-config-panel', () => ({ ProviderConfigPanel: () => null }))

const { GedaechtnisSection, HONCHO_PORT } = await import('./gedaechtnis')

// The page itself can never tell: a cross-origin answer without CORS headers
// reads as a failed request. Any attempt to ask from here fails the test.
const seitenFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

const bruecke = (tikkiLocalHealth?: (port: number) => Promise<boolean>) => {
  vi.stubGlobal('fetch', seitenFetch)
  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { tikkiLocalHealth } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  seitenFetch.mockClear()
  Reflect.deleteProperty(window, 'hermesDesktop')
})

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <GedaechtnisSection />
    </I18nProvider>
  )

const karte = (container: HTMLElement, status: string) => container.querySelector(`[data-honcho-status="${status}"]`)

describe('GedaechtnisSection', () => {
  it('takes the answer from the main process, which is not bound by the page origin', async () => {
    const probe = vi.fn().mockResolvedValue(true)
    bruecke(probe)
    const { container } = mount()

    await waitFor(() => expect(karte(container, 'laeuft')).toBeTruthy())
    expect(probe).toHaveBeenCalledWith(HONCHO_PORT)
    expect(seitenFetch).not.toHaveBeenCalled()
    expect(container.querySelector('[data-honcho-starthinweis]')).toBeNull()
  })

  it('offers the way to start the service only when it is known to be down', async () => {
    bruecke(vi.fn().mockResolvedValue(false))
    const { container } = mount()

    await waitFor(() => expect(karte(container, 'aus')).toBeTruthy())
    expect(container.querySelector('[data-honcho-starthinweis]')).toBeTruthy()
  })

  it('claims nothing when it cannot ask', async () => {
    bruecke(undefined)
    const { container } = mount()

    await waitFor(() => expect(karte(container, 'unbekannt')).toBeTruthy())
    expect(container.querySelector('[data-honcho-starthinweis]')).toBeNull()
    expect(seitenFetch).not.toHaveBeenCalled()
  })
})
