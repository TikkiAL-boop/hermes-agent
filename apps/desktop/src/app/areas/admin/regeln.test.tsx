import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

/** The backend as the editor sees it: which profiles exist, each one's SOUL, and what is broken. */
const backend = {
  kaputt: new Set<string>(),
  liest: true,
  profile: [] as string[],
  seelen: {} as Record<string, string>
}

vi.mock('@/api/profiles', () => ({
  getProfiles: async () => ({ profiles: backend.profile.map(name => ({ name })) }),
  getProfileSoul: async (name: string) => {
    if (!backend.liest) {
      throw new Error('backend offline')
    }

    return { content: backend.seelen[name] ?? '' }
  },
  updateProfileSoul: async (name: string, content: string) => {
    if (backend.kaputt.has(name)) {
      throw new Error('Platte voll')
    }

    backend.seelen[name] = content

    return { ok: true }
  }
}))

const { RegelnSection } = await import('./regeln')
const { $regelEntwuerfe, $regelFehler, $regelRolle, $regelStand } = await import('./regeln-store')
const { $rollenStand } = await import('./rollen-stand')
const { RAUMLEITER_KLONE, ROLLEN } = await import('./katalog')

const KLONE = RAUMLEITER_KLONE.map(r => r.slug)
const ANDERE = ROLLEN.find(r => r.slug !== 'raumleiter')!.slug

beforeEach(() => {
  backend.kaputt = new Set()
  backend.liest = true
  backend.profile = ROLLEN.map(r => r.slug)
  backend.seelen = Object.fromEntries(backend.profile.map(p => [p, `Regeln von ${p}`]))
  $regelEntwuerfe.set({})
  $regelFehler.set({})
  $regelStand.set({})
  $regelRolle.set('raumleiter')
  $rollenStand.set(null)
})

afterEach(cleanup)

const mount = () =>
  render(
    <I18nProvider configClient={null} initialLocale="de">
      <RegelnSection />
    </I18nProvider>
  )

const editor = (container: HTMLElement) => container.querySelector('textarea')!

const bereit = async (container: HTMLElement, text: string) =>
  waitFor(() => {
    expect(editor(container).value).toBe(text)
    expect(editor(container).disabled).toBe(false)
  })

const knopf = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll('button')].find(b => b.textContent === name)!

describe('RegelnSection', () => {
  it('keeps what the person was writing when they look at another role or leave the area', async () => {
    const erste = mount()

    await bereit(erste.container, 'Regeln von raumleiter')
    fireEvent.change(editor(erste.container), { target: { value: 'halb fertiger Gedanke' } })

    // Another role and back …
    fireEvent.click(erste.container.querySelector(`[data-regel-rolle="${ANDERE}"]`)!)
    await bereit(erste.container, `Regeln von ${ANDERE}`)
    expect(erste.container.querySelector('[data-regel-rolle="raumleiter"] [data-regel-ungespeichert]')).toBeTruthy()
    fireEvent.click(erste.container.querySelector('[data-regel-rolle="raumleiter"]')!)
    await bereit(erste.container, 'halb fertiger Gedanke')

    // … and the Admin area unmounted and mounted again.
    erste.unmount()

    const zweite = mount()

    await bereit(zweite.container, 'halb fertiger Gedanke')
    expect(backend.seelen.raumleiter).toBe('Regeln von raumleiter')
  })

  it('writes the room lead’s rules to every clone the backend has: they are the same role', async () => {
    backend.profile.push(...KLONE)

    const { container } = mount()

    await bereit(container, 'Regeln von raumleiter')
    fireEvent.change(editor(container), { target: { value: 'neue Regeln' } })
    fireEvent.click(knopf(container, 'Speichern'))

    await waitFor(() => expect(backend.seelen.raumleiter).toBe('neue Regeln'))

    for (const klon of KLONE) {
      expect(backend.seelen[klon], klon).toBe('neue Regeln')
    }

    // A role that is nobody's clone keeps its own text.
    expect(backend.seelen[ANDERE]).toBe(`Regeln von ${ANDERE}`)
  })

  it('names the profile a save did not reach and offers the same save again', async () => {
    const [klon] = KLONE

    backend.profile.push(...KLONE)
    backend.kaputt.add(klon!)

    const { container } = mount()

    await bereit(container, 'Regeln von raumleiter')
    fireEvent.change(editor(container), { target: { value: 'neue Regeln' } })
    fireEvent.click(knopf(container, 'Speichern'))

    await waitFor(() => expect(container.querySelector(`[data-regel-speicherfehler="${klon}"]`)).toBeTruthy())
    expect(container.querySelector('[data-regel-speicherfehler]')!.textContent).toContain('Platte voll')
    expect(backend.seelen[klon!]).not.toBe('neue Regeln')

    backend.kaputt.clear()
    expect(knopf(container, 'Speichern').disabled).toBe(false)
    fireEvent.click(knopf(container, 'Speichern'))

    await waitFor(() => expect(backend.seelen[klon!]).toBe('neue Regeln'))
    await waitFor(() => expect(container.querySelector('[data-regel-speicherfehler]')).toBeNull())
  })

  it('tells a backend that does not answer apart from rules that are empty', async () => {
    backend.liest = false

    const { container } = mount()

    await waitFor(() => expect(container.querySelector('[data-regel-ladefehler]')).toBeTruthy())
    // Nothing to edit, so nothing that could be saved over the real rules.
    expect(editor(container).disabled).toBe(true)

    backend.liest = true
    fireEvent.click(container.querySelector('[data-regel-ladefehler] button')!)
    await bereit(container, 'Regeln von raumleiter')
    expect(container.querySelector('[data-regel-ladefehler]')).toBeNull()
  })
})
