/**
 * Tikki palette — "Empfangszimmer".
 *
 * Hand-tuned rather than derived from one seed: the room is warm paper and
 * linen in light, warm umber in dark, and the gold of the Tikki identity
 * appears only as an accent (primary, ring, focus) — never as a surface.
 * Every text pair is held at WCAG AA; `tikki.test.ts` pins that floor.
 */

import type { DesktopTerminalPalette, DesktopThemeColors } from './types'

export const TIKKI_COLORS: DesktopThemeColors = {
  background: '#f4f0e8',
  foreground: '#2a2520',
  card: '#fbf9f4',
  cardForeground: '#2a2520',
  muted: '#ebe5d9',
  mutedForeground: '#665d52',
  popover: '#fffdf8',
  popoverForeground: '#2a2520',
  primary: '#7a5a14',
  primaryForeground: '#fffdf7',
  secondary: '#e9e1cf',
  secondaryForeground: '#2a2520',
  accent: '#ede6d6',
  accentForeground: '#2a2520',
  border: '#ddd5c7',
  input: '#fdfbf6',
  ring: '#7a5a14',
  midground: '#7a5a14',
  midgroundForeground: '#fffdf7',
  composerRing: '#a07e2e',
  destructive: '#a8361f',
  destructiveForeground: '#fffdf7',
  sidebarBackground: '#ece6db',
  sidebarBorder: '#ddd5c7',
  userBubble: '#ece4d2',
  userBubbleBorder: '#ddd3bd'
}

export const TIKKI_DARK_COLORS: DesktopThemeColors = {
  background: '#1b1815',
  foreground: '#ece5d8',
  card: '#221e1a',
  cardForeground: '#ece5d8',
  muted: '#2a2520',
  mutedForeground: '#a9a092',
  popover: '#28231e',
  popoverForeground: '#ece5d8',
  primary: '#d6b56d',
  primaryForeground: '#1b1815',
  secondary: '#2e281d',
  secondaryForeground: '#ece5d8',
  accent: '#2a2519',
  accentForeground: '#ece5d8',
  border: '#38322b',
  input: '#1b1815',
  ring: '#d6b56d',
  midground: '#d6b56d',
  midgroundForeground: '#1b1815',
  composerRing: '#b79653',
  destructive: '#e8806c',
  destructiveForeground: '#1b1815',
  sidebarBackground: '#161311',
  sidebarBorder: '#2e2923',
  userBubble: '#2b2620',
  userBubbleBorder: '#3a332a'
}

/** Warm ANSI set for paper: every colour reads at AA on `background`. */
export const TIKKI_TERMINAL: DesktopTerminalPalette = {
  foreground: '#2a2520',
  cursor: '#7a5a14',
  selectionBackground: '#a07e2e40',
  black: '#2a2520',
  red: '#a8361f',
  green: '#4f6b24',
  yellow: '#7a5a14',
  blue: '#33618a',
  magenta: '#814a78',
  cyan: '#2a6b66',
  white: '#665d52',
  brightBlack: '#5a5147',
  brightRed: '#8f2b17',
  brightGreen: '#3f5a18',
  brightYellow: '#6b4d0c',
  brightBlue: '#27527a',
  brightMagenta: '#6f3c67',
  brightCyan: '#1f5b56',
  brightWhite: '#4d453c'
}

export const TIKKI_DARK_TERMINAL: DesktopTerminalPalette = {
  foreground: '#ece5d8',
  cursor: '#d6b56d',
  selectionBackground: '#d6b56d40',
  black: '#6f665a',
  red: '#e8806c',
  green: '#a9c27a',
  yellow: '#d6b56d',
  blue: '#8fb4d6',
  magenta: '#cf9cc4',
  cyan: '#8cc7bf',
  white: '#cfc7b8',
  brightBlack: '#8d8375',
  brightRed: '#f09b8a',
  brightGreen: '#bdd391',
  brightYellow: '#e4c888',
  brightBlue: '#a8c6e2',
  brightMagenta: '#dcb3d3',
  brightCyan: '#a5d6cf',
  brightWhite: '#ece5d8'
}
