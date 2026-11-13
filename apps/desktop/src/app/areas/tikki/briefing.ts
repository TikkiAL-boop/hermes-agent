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

/**
 * While reading is on, every reply that finishes in the chat on screen is
 * spoken once (`stimme.ts`).
 *
 * "Finished" is said of a session, so it is tracked per session: with one flag
 * for "the active one", switching from a session that is still answering to a
 * quiet one looked like that quiet one had just finished, and its old reply
 * was read out. A reply that finishes in a session the person has left is not
 * spoken — reading aloud follows what is on screen.
 */
export function startVorleser(): () => void {
  const beschaeftigt = new Map<string, boolean>()
  let gesprochen = ''

  return $sessionStates.listen(states => {
    const aktiv = $activeSessionId.get()

    for (const id of [...beschaeftigt.keys()]) {
      if (!(id in states)) {
        beschaeftigt.delete(id)
      }
    }

    for (const [id, state] of Object.entries(states)) {
      const fertig = beschaeftigt.get(id) === true && !state.busy

      beschaeftigt.set(id, Boolean(state.busy))

      if (!fertig || id !== aktiv || !vorlesenAktiv(VORLESEN_UEBERSICHT)) {
        continue
      }

      const letzte = state.messages.findLast(m => m.role === 'assistant')
      const text = letzte ? chatMessageText(letzte) : ''

      if (text && text !== gesprochen) {
        gesprochen = text
        void sprich(text)
      }
    }
  })
}
