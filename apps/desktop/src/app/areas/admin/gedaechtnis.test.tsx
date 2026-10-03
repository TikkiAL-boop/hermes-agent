import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

vi.mock('@/app/settings/memory/provider-config-panel', () => ({ ProviderConfigPanel: () => null }))

const { GedaechtnisSection, HONCHO_URL } = await import('./gedaechtnis')

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <GedaechtnisSection />
    </I18nProvider>
  )

describe('GedaechtnisSection', () => {
  it('reports the local Honcho service as running when its health endpoint answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { container } = mount()

    await waitFor(() => expect(container.querySelector('[data-honcho-status="laeuft"]')).toBeTruthy())
    expect(fetchMock.mock.calls[0][0]).toBe(`${HONCHO_URL}/health`)
    expect(container.textContent).not.toContain('honcho.sh start')
  })

  it('names the start command when the service is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { container } = mount()

    await waitFor(() => expect(container.querySelector('[data-honcho-status="aus"]')).toBeTruthy())
    expect(container.textContent).toContain('tikki/dienste/honcho/honcho.sh start')
  })
})
