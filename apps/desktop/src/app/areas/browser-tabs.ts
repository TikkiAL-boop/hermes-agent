// The Browser area's own tabs.
//
// A tab here is a Hermes Browser tab — an entry of `$previewTabs`, rendered by
// Hermes' `PreviewTilePane` — that the AREA holds. Holding means "popped out",
// Hermes' own word for "on screen somewhere else, keep it out of the chat's
// layout tree". The area holds only what was opened in it. A page opened from
// the chat (a link, the agent's dev-server preview) stays beside the chat,
// where the person is looking; a page opened here stays here, mounted, with its
// history. The two lists never hand a tab to each other.

import { atom, computed } from 'nanostores'

import { forgetPreviewConsole } from '@/app/chat/right-rail/preview-console-store'
import { persistString, persistStringArray, storedString, storedStringArray } from '@/lib/storage'
import type { RightRailTabId } from '@/store/layout'
import {
  $browserPages,
  $poppedBrowserTabIds,
  $previewTabs,
  closeRightRailTab,
  forgetBrowserPage,
  markBrowserTabPopped,
  type PreviewTab,
  type PreviewTarget
} from '@/store/preview'

import { adresseAusEingabe } from './browser-adresse'
import { setArea } from './store'

const TABS_KEY = 'tikki.desktop.browser.tabs'
const ACTIVE_KEY = 'tikki.desktop.browser.activeTab'
const LEER = 'about:blank'

/** Ids of the tabs the area holds. Ids are unique across profiles, so one list serves every profile's rail. */
export const $bereichTabIds = atom<readonly string[]>(storedStringArray(TABS_KEY))

export const $activeTab = atom<null | string>(storedString(ACTIVE_KEY))

$bereichTabIds.listen(ids => persistStringArray(TABS_KEY, [...ids]))
$activeTab.listen(id => persistString(ACTIVE_KEY, id))

// What the area holds stays out of the tree — from the first render after a
// restart, and again when Hermes docks a tab back (its own-window pop-out closing).
const halten = () => {
  for (const id of $bereichTabIds.get()) {
    markBrowserTabPopped(id, true)
  }
}

$bereichTabIds.subscribe(halten)
$poppedBrowserTabIds.listen(halten)

/** The area's tabs in the rail on screen (Hermes keeps tabs per profile). */
export const $bereichTabs = computed([$previewTabs, $bereichTabIds], (tabs, ids) =>
  tabs.filter(tab => ids.includes(tab.id))
)

/** The tab the area shows: the remembered one, else the newest. */
export const $sichtbarerTab = computed(
  [$bereichTabs, $activeTab],
  (tabs, aktiv) => tabs.find(tab => tab.id === aktiv) ?? tabs.at(-1) ?? null
)

const leereSeite = (): PreviewTarget => ({ kind: 'url', label: 'Browser', source: LEER, url: LEER })

const neueId = (): RightRailTabId =>
  `url:tikki-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`

/** Open a tab in the area. It is held before Hermes hears of it, so the chat's tree never shows it. */
export function neuerBereichTab(ziel: PreviewTarget = leereSeite()): string {
  const id = neueId()

  $bereichTabIds.set([...$bereichTabIds.get(), id])
  $previewTabs.set([...$previewTabs.get(), { id, target: ziel }])
  $activeTab.set(id)

  return id
}

export function schliesseBereichTab(id: string): void {
  const tabs = $bereichTabs.get()
  const index = tabs.findIndex(tab => tab.id === id)

  if (index === -1) {
    return
  }

  if ($sichtbarerTab.get()?.id === id) {
    $activeTab.set((tabs[index + 1] ?? tabs[index - 1])?.id ?? null)
  }

  forgetBrowserPage(id)
  forgetPreviewConsole(id)
  closeRightRailTab(id)
  $bereichTabIds.set($bereichTabIds.get().filter(x => x !== id))
  markBrowserTabPopped(id, false)
}

/** ⌘W in the Browser area. */
export function schliesseSichtbarenTab(): void {
  const tab = $sichtbarerTab.get()

  if (tab) {
    schliesseBereichTab(tab.id)
  }
}

/** ⌃Tab in the Browser area. */
export function wechsleBereichTab(richtung: 1 | -1): void {
  const tabs = $bereichTabs.get()
  const index = tabs.findIndex(tab => tab.id === $sichtbarerTab.get()?.id)

  if (tabs.length > 1 && index !== -1) {
    $activeTab.set(tabs[(index + richtung + tabs.length) % tabs.length]!.id)
  }
}

/** A tab that shows nothing: opened empty and never navigated. */
const istLeer = (tab: PreviewTab): boolean =>
  tab.target.url === LEER && ($browserPages.get()[tab.id]?.url ?? LEER) === LEER

/**
 * Open an address or a search in the Browser area and walk over to it: the
 * whole app turns into the browser, the rail leads back. An empty tab takes
 * the page; a page the person has open is never replaced.
 */
export function oeffneImBrowser(eingabe: string): void {
  const url = adresseAusEingabe(eingabe)
  let label = url

  try {
    label = new URL(url).hostname || url
  } catch {
    // about:blank and friends keep the raw text
  }

  const ziel: PreviewTarget = { kind: 'url', label, source: url, url }
  const sichtbar = $sichtbarerTab.get()

  if (sichtbar && istLeer(sichtbar)) {
    $previewTabs.set($previewTabs.get().map(tab => (tab.id === sichtbar.id ? { ...tab, target: ziel } : tab)))
    $activeTab.set(sichtbar.id)
  } else {
    neuerBereichTab(ziel)
  }

  setArea('browser')
}
