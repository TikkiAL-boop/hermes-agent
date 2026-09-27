// The four Tikki areas. One atom says which fills the window; the shell keeps
// the expensive ones (chat tree, browser webviews, terminal) mounted and only
// hides the inactive ones, so switching is instant and nothing is lost.

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

export const AREAS = ['tikki', 'browser', 'post', 'terminal', 'admin'] as const

export type Area = (typeof AREAS)[number]

const AREA_KEY = 'tikki.desktop.area'

export const isArea = (value: unknown): value is Area => AREAS.includes(value as Area)

const stored = storedString(AREA_KEY)

export const $area = atom<Area>(isArea(stored) ? stored : 'tikki')

$area.subscribe(area => persistString(AREA_KEY, area))

export const setArea = (area: Area) => $area.set(area)
