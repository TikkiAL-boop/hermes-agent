import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'
import { createClientSessionState } from '@/lib/chat-runtime'
import { $activeSessionId } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

const { sprich } = vi.hoisted(() => ({ sprich: vi.fn().mockResolvedValue('stumm') }))

vi.mock('./stimme', () => ({ sprich, VORLESEN_UEBERSICHT: 'test.vorlesen', vorlesenAktiv: () => true }))

const { startVorleser } = await import('./briefing')

const antwort = (id: string, text: string): ChatMessage =>
  ({ id, parts: [{ text, type: 'text' }], role: 'assistant' }) as ChatMessage

const sitzung = (busy: boolean, text: string) => ({
  ...createClientSessionState(null, [antwort(`m-${text}`, text)]),
  busy
})

let stop: () => void

beforeEach(() => {
  $sessionStates.set({})
  $activeSessionId.set(null)
  sprich.mockClear()
  stop = startVorleser()
})

afterEach(() => {
  stop()
  $sessionStates.set({})
  $activeSessionId.set(null)
})

describe('startVorleser', () => {
  it('speaks the reply of the chat on screen when its turn finishes', () => {
    $activeSessionId.set('a')
    $sessionStates.set({ a: sitzung(true, 'Guten') })
    $sessionStates.set({ a: sitzung(false, 'Guten Morgen') })

    expect(sprich.mock.calls).toEqual([['Guten Morgen']])
  })

  it('does not read an old reply when the person switches to a quiet chat mid-answer', () => {
    // A is still answering; the person looks at B, which finished long ago.
    $activeSessionId.set('a')
    $sessionStates.set({ a: sitzung(true, 'Ich su'), b: sitzung(false, 'Alte Antwort von gestern') })
    $activeSessionId.set('b')
    $sessionStates.set({ a: sitzung(true, 'Ich suche'), b: sitzung(false, 'Alte Antwort von gestern') })

    expect(sprich).not.toHaveBeenCalled()

    // B's own next turn is still read when it finishes.
    $sessionStates.set({ a: sitzung(true, 'Ich suche'), b: sitzung(true, 'Neu') })
    $sessionStates.set({ a: sitzung(true, 'Ich suche'), b: sitzung(false, 'Neue Antwort') })

    expect(sprich.mock.calls).toEqual([['Neue Antwort']])
  })
})
