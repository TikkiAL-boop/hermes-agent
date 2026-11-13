import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

// Every section has its own tests (or is a Hermes panel); the frame around them is under test.
const abschnitt = (name: string) => () => <div data-abschnitt={name} />

vi.mock('./betrieb', () => ({ BetriebSection: abschnitt('betrieb') }))
vi.mock('./bots', () => ({ BotsSection: abschnitt('bots') }))
vi.mock('./gedaechtnis', () => ({ GedaechtnisSection: abschnitt('gedaechtnis') }))
vi.mock('./modelle', () => ({ ModelleSection: abschnitt('modelle') }))
vi.mock('./nutzer', () => ({ NutzerSection: abschnitt('nutzer') }))
vi.mock('./rechner', () => ({ RechnerSection: abschnitt('rechner') }))
vi.mock('./regeln', () => ({ RegelnSection: abschnitt('regeln') }))
vi.mock('./schluessel', () => ({ SchluesselSection: abschnitt('schluessel') }))
vi.mock('./system', () => ({ SystemSection: abschnitt('system') }))

const { AdminArea } = await import('./index')
const { ADMIN_SECTIONS } = await import('./sections')

afterEach(cleanup)

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <AdminArea />
    </I18nProvider>
  )

const offen = (container: HTMLElement) => container.querySelector('[data-abschnitt]')!.getAttribute('data-abschnitt')

describe('AdminArea', () => {
  it('is where the person left it after they looked at another area', () => {
    // The shell unmounts Admin while another area is on screen.
    for (const ziel of ADMIN_SECTIONS) {
      const erste = mount()
      const knoepfe = [...erste.container.querySelectorAll('nav button')]

      fireEvent.click(knoepfe[ADMIN_SECTIONS.indexOf(ziel)]!)
      expect(offen(erste.container)).toBe(ziel)
      erste.unmount()

      const zweite = mount()

      expect(offen(zweite.container), ziel).toBe(ziel)
      zweite.unmount()
    }
  })
})
