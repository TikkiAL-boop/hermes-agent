import { contrastRatio } from '@hermes/shared/color'
import { describe, expect, it } from 'vitest'

import { tikkiTheme } from './presets'
import type { DesktopTerminalPalette, DesktopThemeColors } from './types'

const contrast = (a: string, b: string): number => contrastRatio(a, b) ?? 0

const MODES: Array<[string, DesktopThemeColors, DesktopTerminalPalette]> = [
  ['light', tikkiTheme.colors, tikkiTheme.terminal!],
  ['dark', tikkiTheme.darkColors!, tikkiTheme.darkTerminal!]
]

describe('tikki palette', () => {
  it.each(MODES)('keeps every text pair at WCAG AA in %s', (_mode, c) => {
    const surfaces = [c.background, c.card, c.popover, c.sidebarBackground!, c.muted, c.accent, c.secondary]

    for (const surface of surfaces) {
      expect(contrast(c.foreground, surface), `foreground on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.mutedForeground, surface), `muted text on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(c.primary, surface), `gold on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }

    expect(contrast(c.primaryForeground, c.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.destructiveForeground, c.destructive)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.destructive, c.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.foreground, c.userBubble!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(MODES)('keeps every terminal colour readable on the %s surface', (_mode, c, terminal) => {
    for (const [name, value] of Object.entries(terminal)) {
      if (name === 'selectionBackground') {
        continue
      }

      expect(contrast(value, c.background), name).toBeGreaterThanOrEqual(name === 'black' ? 3 : 4.5)
    }
  })

  it('draws the room without fetching a font from the network', () => {
    expect(tikkiTheme.typography).toHaveProperty('fontUrl', undefined)
  })
})
