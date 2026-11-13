import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $dockedPreviewTabs, $poppedBrowserTabIds, $previewTabs, closeRightRail, openPreview } from '@/store/preview'

import {
  $bereichTabIds,
  $bereichTabs,
  $sichtbarerTab,
  neuerBereichTab,
  oeffneImBrowser,
  schliesseBereichTab
} from './browser-tabs'
import { $area } from './store'

const seite = (url: string) => ({ kind: 'url' as const, label: url, source: url, url })

const aufraeumen = () => {
  for (const id of $bereichTabIds.get()) {
    schliesseBereichTab(id)
  }

  $bereichTabIds.set([])
  $poppedBrowserTabIds.set(new Set())
  closeRightRail()
  $area.set('tikki')
  window.localStorage.clear()
}

beforeEach(aufraeumen)
afterEach(aufraeumen)

// How an address is spelled (trailing slash or not) is the address resolver's business, not this test's.
const urls = (tabs: readonly { target: { url: string } }[]) => tabs.map(tab => new URL(tab.target.url).href)

describe("the Browser area's tabs and the chat's", () => {
  it('a link opened from the chat shows beside the chat, even after the Browser area was used', () => {
    // The person browsed in the area, then went back to the Vorzimmer.
    oeffneImBrowser('https://wetter.example')
    $area.set('tikki')

    // A link in a reply, or the agent's dev-server preview.
    openPreview(seite('http://localhost:5173/'))

    // It is on screen where the person is — in the chat's layout tree …
    expect(urls($dockedPreviewTabs.get())).toEqual(['http://localhost:5173/'])
    // … and it neither landed in nor replaced what the area holds.
    expect(urls($bereichTabs.get())).toEqual(['https://wetter.example/'])
  })

  it('shows in the area only what was opened there', () => {
    openPreview(seite('https://aus-dem-chat.example/'))
    neuerBereichTab(seite('https://im-bereich.example/'))

    expect(urls($bereichTabs.get())).toEqual(['https://im-bereich.example/'])
    expect(urls($dockedPreviewTabs.get())).toEqual(['https://aus-dem-chat.example/'])
    // Every tab is rendered by exactly one of the two surfaces.
    expect($previewTabs.get()).toHaveLength(2)
  })

  it('never replaces a page the person has open: an address opens beside it', () => {
    oeffneImBrowser('https://erste.example')
    oeffneImBrowser('https://zweite.example')

    expect(urls($bereichTabs.get())).toEqual(['https://erste.example/', 'https://zweite.example/'])
    expect(urls([$sichtbarerTab.get()!])).toEqual(['https://zweite.example/'])
    expect($area.get()).toBe('browser')
  })

  it('an empty tab takes the first address instead of staying behind', () => {
    neuerBereichTab()
    oeffneImBrowser('https://erste.example')

    expect(urls($bereichTabs.get())).toEqual(['https://erste.example/'])
  })

  it('closing a tab in the area leaves the chat side alone and gives the tab back to nobody', () => {
    openPreview(seite('https://aus-dem-chat.example/'))
    const id = neuerBereichTab(seite('https://im-bereich.example/'))

    schliesseBereichTab(id)

    expect($bereichTabs.get()).toEqual([])
    expect(urls($dockedPreviewTabs.get())).toEqual(['https://aus-dem-chat.example/'])
    expect($poppedBrowserTabIds.get().has(id)).toBe(false)
  })
})
