import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

/** The secret store of each profile, as `/api/env` serves it: the value goes in and never comes out. */
const tresor = new Map<string, Map<string, string>>()

const fach = (profil: null | string | undefined) => {
  const name = profil ?? '(app)'

  return tresor.get(name) ?? tresor.set(name, new Map()).get(name)!
}

vi.mock('@/api/config', () => ({
  deleteEnvVar: async (key: string, profil?: null | string) => {
    fach(profil).delete(key)

    return { ok: true }
  },
  getEnvVars: async (profil?: null | string) =>
    Object.fromEntries([...fach(profil).keys()].map(key => [key, { is_set: true, redacted_value: '***' }])),
  setEnvVar: async (key: string, value: string, profil?: null | string) => {
    fach(profil).set(key, value)

    return { ok: true }
  }
}))

const { BetriebSection } = await import('./betrieb')
const { $mensch, menschName } = await import('./betrieb-store')
const { $waToken, WA_TOKEN_SCHLUESSEL } = await import('./wa-token')
const { PA_PROFIL } = await import('../tikki/auftraege')
const { nachrichtAus } = await import('../suites/store')

beforeEach(() => {
  tresor.clear()
  $mensch.set('thorsten')
  $waToken.set('unbekannt')
})

afterEach(cleanup)

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <BetriebSection />
    </I18nProvider>
  )

const namensfeld = (container: HTMLElement) => container.querySelector<HTMLInputElement>('[data-betrieb-mensch]')!

/** Type like a person does: one keystroke after the other, the field showing each. */
const tippe = (feld: HTMLInputElement, text: string) => {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.change(feld, { target: { value: text.slice(0, i) } })
  }
}

describe('Betrieb: the name', () => {
  it('lets the person empty the field and type a new name; the name counts when they are done', () => {
    const { container } = mount()
    const feld = namensfeld(container)

    fireEvent.change(feld, { target: { value: '' } })
    expect(feld.value).toBe('')
    // Nothing is taken mid-typing: the rooms keep the old name until the new one is whole.
    expect($mensch.get()).toBe('thorsten')

    tippe(feld, 'Änne-Marie')
    expect(feld.value).toBe('Änne-Marie')
    fireEvent.blur(feld)

    expect($mensch.get()).toBe('Änne-Marie')
    expect(feld.value).toBe('Änne-Marie')
  })

  it('keeps the name there was when the field is left empty', () => {
    const { container } = mount()
    const feld = namensfeld(container)

    fireEvent.change(feld, { target: { value: '   ' } })
    fireEvent.keyDown(feld, { key: 'Enter' })

    expect($mensch.get()).toBe('thorsten')
    expect(feld.value).toBe('thorsten')
  })

  it.each(['Änne-Marie', 'Thorsten', 'o.k', 'x'.repeat(60), 'Dr. Who: [admin] @all'])(
    'every name it takes comes back out of a room unchanged: %s',
    roh => {
      const name = menschName(roh)

      const nachricht = nachrichtAus({
        actor: { id: 'desktop', kind: 'user' },
        created_at: 1,
        event_id: 'e1',
        kind: 'message.user',
        payload: { text: `${name}: guten Morgen` },
        seq: 1
      })

      expect(name).not.toBe('')
      expect(nachricht).toMatchObject({ name, text: 'guten Morgen' })
    }
  )
})

describe('Betrieb: the WhatsApp token', () => {
  const token = (container: HTMLElement) => container.querySelector('[data-betrieb-wa-token]')!
  const eingabe = (container: HTMLElement) => token(container).querySelector<HTMLInputElement>('input')!

  it('goes into the secret store of Tikki’s profile, where her briefing tool reads it', async () => {
    const { container } = mount()

    await waitFor(() => expect(token(container).getAttribute('data-betrieb-wa-token')).toBe('fehlt'))

    fireEvent.change(eingabe(container), { target: { value: '  geheim-123  ' } })
    fireEvent.submit(token(container))

    await waitFor(() => expect(token(container).getAttribute('data-betrieb-wa-token')).toBe('gesetzt'))
    expect(fach(PA_PROFIL).get(WA_TOKEN_SCHLUESSEL)).toBe('geheim-123')
    // Not the app's own profile: the tool would not find it there.
    expect(fach(null).size).toBe(0)
  })

  it('never shows a stored token again, not on screen and not in the page storage', async () => {
    fach(PA_PROFIL).set(WA_TOKEN_SCHLUESSEL, 'geheim-123')

    const { container } = mount()

    await waitFor(() => expect(token(container).getAttribute('data-betrieb-wa-token')).toBe('gesetzt'))

    expect(eingabe(container).value).toBe('')
    expect(eingabe(container).type).toBe('password')
    expect(container.innerHTML).not.toContain('geheim-123')
    expect(JSON.stringify({ ...window.localStorage })).not.toContain('geheim-123')
  })

  it('can be taken away again', async () => {
    fach(PA_PROFIL).set(WA_TOKEN_SCHLUESSEL, 'geheim-123')

    const { container } = mount()

    await waitFor(() => expect(token(container).getAttribute('data-betrieb-wa-token')).toBe('gesetzt'))
    fireEvent.click(token(container).querySelector('button[type="button"]')!)

    await waitFor(() => expect(token(container).getAttribute('data-betrieb-wa-token')).toBe('fehlt'))
    expect(fach(PA_PROFIL).has(WA_TOKEN_SCHLUESSEL)).toBe(false)
  })
})
