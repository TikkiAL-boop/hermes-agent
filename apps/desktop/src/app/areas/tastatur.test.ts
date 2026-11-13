import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { KEYBIND_ACTION_IDS } from '@/lib/keybinds/actions'
import { $poppedBrowserTabIds, closeRightRail } from '@/store/preview'

import { $bereichTabIds, $bereichTabs, neuerBereichTab, schliesseBereichTab } from './browser-tabs'
import { type Area, AREAS } from './store'
import { areaKeybind } from './tastatur'

const aufraeumen = () => {
  for (const id of $bereichTabIds.get()) {
    schliesseBereichTab(id)
  }

  $poppedBrowserTabIds.set(new Set())
  closeRightRail()
  window.localStorage.clear()
}

beforeEach(aufraeumen)
afterEach(aufraeumen)

const FREMDE: Area[] = AREAS.filter(area => area !== 'tikki')

describe('areaKeybind', () => {
  it('leaves every hotkey to Hermes in the Vorzimmer, where the chat is on screen', () => {
    for (const id of KEYBIND_ACTION_IDS) {
      expect(areaKeybind(id, 'tikki'), id).toBeUndefined()
    }
  })

  it('never lets a key act on the chat from an area that hides it', () => {
    // Keys that change the chat: its tabs, its session, its turn, its panes.
    const amChat = KEYBIND_ACTION_IDS.filter(id => /^(session|composer|chat|pane|layout)\./.test(id)).filter(
      id => id !== 'session.newWindow'
    )

    expect(amChat.length).toBeGreaterThan(0)

    for (const area of FREMDE) {
      for (const id of amChat) {
        // Either the area answers with something of its own, or the key does nothing — never `undefined` (= Hermes).
        expect(areaKeybind(id, area), `${id} in ${area}`).not.toBeUndefined()
      }
    }
  })

  it('keeps the keys of the window as a whole working everywhere', () => {
    for (const area of FREMDE) {
      expect(areaKeybind('nav.commandPalette', area)).toBeUndefined()
      expect(areaKeybind('nav.settings', area)).toBeUndefined()
    }
  })

  it('does not decide for a hotkey a plugin contributed', () => {
    expect(areaKeybind('some-plugin.do-thing', 'post')).toBeUndefined()
  })

  it("answers the tab keys with the Browser area's own tabs", () => {
    neuerBereichTab({ kind: 'url', label: 'a', source: 'https://a.example/', url: 'https://a.example/' })
    neuerBereichTab({ kind: 'url', label: 'b', source: 'https://b.example/', url: 'https://b.example/' })

    areaKeybind('view.closeTab', 'browser')?.()
    expect($bereichTabs.get().map(tab => tab.target.url)).toEqual(['https://a.example/'])

    areaKeybind('session.newTab', 'browser')?.()
    expect($bereichTabs.get()).toHaveLength(2)
  })
})
