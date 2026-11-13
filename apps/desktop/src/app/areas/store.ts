// The four Tikki areas. One atom says which fills the window; the shell keeps
// the expensive ones (chat tree, browser webviews, terminal) mounted and only
// hides the inactive ones, so switching is instant and nothing is lost.

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'
import { isAuxiliaryWindow } from '@/store/windows'

export const AREAS = ['tikki', 'suites', 'browser', 'post', 'terminal', 'admin'] as const

export type Area = (typeof AREAS)[number]

const AREA_KEY = 'tikki.desktop.area'

export const isArea = (value: unknown): value is Area => AREAS.includes(value as Area)

// A session window, the HUD and a popped-out browser show one thing and have
// no rail: they are always "the chat", and they neither read nor write where
// the main window is — all windows share one localStorage.
export const WINDOW_HAS_AREAS = !isAuxiliaryWindow()

const stored = WINDOW_HAS_AREAS ? storedString(AREA_KEY) : null

export const $area = atom<Area>(isArea(stored) ? stored : 'tikki')

if (WINDOW_HAS_AREAS) {
  $area.listen(area => persistString(AREA_KEY, area))
}

export const setArea = (area: Area) => {
  if (WINDOW_HAS_AREAS) {
    $area.set(area)
  }
}
