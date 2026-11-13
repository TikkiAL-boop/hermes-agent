import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  $activeTerminalId,
  $terminals,
  closeActiveTerminal,
  closeAllTerminals
} from '@/app/right-sidebar/terminal/terminals'

import { TerminalArea } from './terminal-area'

// The tab rail and xterm have their own tests; the area's promise is under test.
vi.mock('@/app/right-sidebar/terminal/chrome', () => ({ TerminalPaneChrome: () => <div data-test-chrome="" /> }))

beforeEach(() => closeAllTerminals())

afterEach(() => {
  cleanup()
  closeAllTerminals()
})

/** Let the area react to what the store just did. */
const danach = () => act(async () => void (await Promise.resolve()))

describe('TerminalArea', () => {
  it('always has a shell: closing the last tab (Cmd+W) opens a fresh one, selected', async () => {
    render(<TerminalArea />)
    await danach()

    const [erste] = $terminals.get()

    expect($terminals.get().length).toBe(1)

    for (let i = 0; i < 3; i++) {
      act(() => closeActiveTerminal())
      await danach()

      expect($terminals.get().length, `after close ${i + 1}`).toBe(1)
      expect($activeTerminalId.get()).toBe($terminals.get()[0]!.id)
    }

    expect($terminals.get()[0]!.id).not.toBe(erste!.id)
  })

  it('keeps that promise to itself: with the area gone, a closed last tab stays closed', async () => {
    const { unmount } = render(<TerminalArea />)

    await danach()
    unmount()

    act(() => closeActiveTerminal())
    await danach()

    // In the chat an empty terminal pane closes; nothing reopens a shell behind the person's back.
    expect($terminals.get()).toEqual([])
  })
})
