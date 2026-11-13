import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { queryAllVisible } from '@/components/pane-shell/pane-visibility'

// The areas have their own tests; the shell around them is under test.
vi.mock('./admin', () => ({ AdminArea: () => <div data-stub="admin" /> }))
vi.mock('./browser-area', () => ({ BrowserArea: () => <div data-stub="browser" /> }))
vi.mock('./post-area', () => ({ PostArea: () => <div data-stub="post" /> }))
vi.mock('./suites/suites-area', () => ({ SuitesArea: () => <div data-stub="suites" /> }))
vi.mock('./terminal-area', () => ({ TerminalArea: () => <div data-stub="terminal" /> }))
vi.mock('./tikki/vorzimmer-rahmen', () => ({
  VorzimmerRahmen: ({ children }: { children: React.ReactNode }) => <div data-stub="vorzimmer">{children}</div>
}))
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'de' }) }))

const AREA_KEY = 'tikki.desktop.area'

/** A fresh renderer: the window kind and the stored area are read once, at module load. */
async function fenster(search: string, gespeichert: null | string) {
  window.history.replaceState(null, '', `/${search}`)
  window.localStorage.clear()

  if (gespeichert) {
    window.localStorage.setItem(AREA_KEY, gespeichert)
  }

  vi.resetModules()

  const { AreaShell } = await import('./shell')
  const store = await import('./store')

  const ansicht = render(
    <AreaShell>
      <div data-chat="" />
    </AreaShell>
  )

  return { ...ansicht, ...store }
}

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
  window.localStorage.clear()
})

describe('AreaShell', () => {
  it('a session window shows its session and nothing of the areas, wherever the main window is', async () => {
    const { $area, container, setArea } = await fenster('?win=secondary', 'post')

    expect(container.querySelector('[data-chat]')).toBeTruthy()
    expect(container.querySelector('[data-area-rail]')).toBeNull()
    expect(container.querySelector('[data-area]')).toBeNull()
    expect(container.querySelector('[data-stub]')).toBeNull()
    expect($area.get()).toBe('tikki')

    // …and it cannot move the main window: both share one localStorage.
    act(() => setArea('admin'))
    expect(window.localStorage.getItem(AREA_KEY)).toBe('post')
  })

  it('the main window opens where it was left and remembers where it goes', async () => {
    const { $area, container, setArea } = await fenster('', 'post')

    expect($area.get()).toBe('post')
    expect(container.querySelector('[data-area-rail]')).toBeTruthy()
    expect(container.querySelector('[data-stub="post"]')).toBeTruthy()

    act(() => setArea('admin'))
    expect(window.localStorage.getItem(AREA_KEY)).toBe('admin')
  })

  it('offers a handle to move the window in every area, and only on what is on screen', async () => {
    const { AREAS, container, setArea } = await fenster('', null)

    for (const area of AREAS) {
      act(() => setArea(area))

      const griffe = queryAllVisible('.tikki-fenstergriff', container)
      const ebene = container.querySelector(`[data-area="${area}"]`)!

      // The rail is there in every area …
      expect(
        griffe.some(griff => griff.matches('[data-area-rail]')),
        area
      ).toBe(true)

      // … and outside the Vorzimmer (whose own header and the chat's tab strip
      // are handles) the area's top edge is one too.
      if (area !== 'tikki') {
        expect(
          griffe.some(griff => ebene.contains(griff)),
          area
        ).toBe(true)
      }

      // A layer that is not on screen leaves no grip behind.
      for (const versteckt of container.querySelectorAll('[data-area][data-pane-hidden]')) {
        expect(versteckt.querySelector('.tikki-fenstergriff'), `${area}: hidden layer`).toBeNull()
      }
    }
  })
})
