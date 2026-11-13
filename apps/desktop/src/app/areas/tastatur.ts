// Whose keys are these? Hermes' hotkeys were written for one surface, the
// chat's layout tree. In Tikki that tree is on screen only in the Vorzimmer;
// everywhere else it is mounted but hidden, and a hotkey that reached it would
// close a session tab, reset the chat or abort a turn the person cannot see.
// So outside the Vorzimmer a hotkey belongs to the area on screen: the area
// answers it where it has the same thing (tabs), app-wide actions stay Hermes',
// and the rest does nothing.

import { closeActiveTerminal, createTerminal, cycleTerminal } from '@/app/right-sidebar/terminal/terminals'
import { KEYBIND_ACTION_IDS } from '@/lib/keybinds/actions'

import { neuerBereichTab, schliesseSichtbarenTab, wechsleBereichTab } from './browser-tabs'
import { $area, type Area } from './store'

type Handler = () => void

/** Actions on the window as a whole — overlays, appearance, other windows: the same in every area. */
const UEBERALL: ReadonlySet<string> = new Set([
  'appearance.toggleMode',
  'keybinds.openPanel',
  'nav.agents',
  'nav.commandCenter',
  'nav.commandPalette',
  'nav.cron',
  'nav.profiles',
  'nav.settings',
  'session.newWindow',
  'view.findInPage',
  'view.findNext',
  'view.findPrevious',
  'view.toggleHud',
  'view.toggleStatusbar'
])

/** The tab keys, where the area has tabs of its own. */
const EIGENE: Partial<Record<Area, Record<string, Handler>>> = {
  browser: {
    'session.newTab': () => void neuerBereichTab(),
    'session.next': () => wechsleBereichTab(1),
    'session.prev': () => wechsleBereichTab(-1),
    'view.closeTab': schliesseSichtbarenTab
  },
  terminal: {
    'session.newTab': () => void createTerminal(),
    'session.next': () => cycleTerminal(1),
    'session.prev': () => cycleTerminal(-1),
    'view.closeTab': closeActiveTerminal,
    'view.closeTerminal': closeActiveTerminal,
    'view.newTerminal': () => void createTerminal(),
    'view.nextTerminal': () => cycleTerminal(1),
    'view.prevTerminal': () => cycleTerminal(-1)
  }
}

/**
 * What a Hermes hotkey does in the area on screen: the area's own handler,
 * `null` when the key has nothing to act on here, or `undefined` when Hermes
 * decides as always (the Vorzimmer, app-wide actions, and actions a plugin
 * contributed — those bring their own context).
 */
export function areaKeybind(actionId: string, area: Area = $area.get()): Handler | null | undefined {
  if (area === 'tikki' || !KEYBIND_ACTION_IDS.includes(actionId)) {
    return undefined
  }

  return EIGENE[area]?.[actionId] ?? (UEBERALL.has(actionId) ? undefined : null)
}
