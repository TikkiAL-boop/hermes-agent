// The briefing button and reading aloud in the Vorzimmer.
//
// The Vorzimmer is an ordinary Hermes session with Tikki. The app never puts
// text into it on its own: no timer, no greeting, no collected data. The
// briefing button is the person's own short request, sent like anything they
// type; Tikki answers with her own tools (`briefing_sammeln`), and a daily
// briefing is a Hermes cron job she can set up when asked. Reading aloud speaks
// with Tikki's own voice (Hermes TTS), the system voice when no provider answers
// (`stimme.ts`).

import { requestComposerSubmit } from '@/app/chat/composer/focus'
import { chatMessageText } from '@/lib/chat-messages/parts'
import { $activeSessionId } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

import { sprich, VORLESEN_UEBERSICHT, vorlesenAktiv } from './stimme'

/**
 * Send the person's request for a briefing into the Vorzimmer chat, exactly as if they had typed
 * it. Only ever called from the button they pressed. False when no chat input is on screen.
 */
export function briefingErbitten(bitte: string): boolean {
  return requestComposerSubmit(bitte, { target: 'main' })
}

// ─── Vorlesen ────────────────────────────────────────────────────────────────

/** While reading is on, every finished reply of the Vorzimmer chat is spoken once (`stimme.ts`). */
export function startVorleser(): () => void {
  let warBeschaeftigt = false
  let gesprochen = ''

  return $sessionStates.listen(states => {
    const id = $activeSessionId.get()
    const state = id ? states[id] : undefined

    if (!state) {
      return
    }

    const fertig = warBeschaeftigt && !state.busy
    warBeschaeftigt = Boolean(state.busy)

    if (!fertig || !vorlesenAktiv(VORLESEN_UEBERSICHT)) {
      return
    }

    const letzte = [...state.messages].reverse().find(m => m.role === 'assistant')
    const text = letzte ? chatMessageText(letzte) : ''

    if (text && text !== gesprochen) {
      gesprochen = text
      void sprich(text)
    }
  })
}
