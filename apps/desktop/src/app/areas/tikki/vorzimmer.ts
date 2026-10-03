// The Vorzimmer hands work over by protocol: when Tikki's finished reply
// carries `RAUM:` and `ZIEL:` lines, the room opens on its own — in the
// background, the person stays where they are, a toast offers the way in.
// The exact-name adopt in neueSuite makes a repeated handoff a no-op.

import { chatMessageText } from '@/lib/chat-messages/parts'
import { notify } from '@/store/notifications'
import { $sessionStates, runtimeSessionOwner } from '@/store/session-states'

import { oeffneImBrowser } from '../browser-area'
import { neueSuite, oeffneSuite, RAUMLEITER } from '../suites/store'

export interface RaumAuftrag {
  name: string
  ziel: string
  annahmen?: string
  takt?: string
}

function zeile(text: string, schluessel: string): string | undefined {
  const treffer = [...text.matchAll(new RegExp(`(?:^|\\n)[ \\t>*_]*${schluessel}:[ \\t*_]*([^\\n]+)`, 'g'))]

  const wert = treffer
    .at(-1)?.[1]
    ?.replace(/[*_`]+$/g, '')
    .trim()

  return wert || undefined
}

/** `ÖFFNE: <Adresse oder Suche>` in a Vorzimmer reply: Tikki asks the app to show a page. */
export function oeffneAusText(text: string): string | undefined {
  return zeile(text, 'ÖFFNE') ?? zeile(text, 'OEFFNE')
}

/** The room order in a Vorzimmer reply, or undefined when the reply is talk, not an order. */
export function raumAuftragAusText(text: string): RaumAuftrag | undefined {
  const name = zeile(text, 'RAUM')
  const ziel = zeile(text, 'ZIEL')

  if (!name || !ziel) {
    return undefined
  }

  const annahmen = zeile(text, 'ANNAHMEN')
  const takt = zeile(text, 'TAKT')

  return { name, ziel, ...(annahmen ? { annahmen } : {}), ...(takt ? { takt } : {}) }
}

const ownerProfil = (runtimeId: string): string | undefined => {
  const owner = runtimeSessionOwner(runtimeId)

  return typeof owner === 'string' ? owner : (owner?.profile ?? undefined)
}

async function uebergeben(auftrag: RaumAuftrag): Promise<void> {
  const suite = await neueSuite(auftrag.name, auftrag.ziel, {
    annahmen: auftrag.annahmen,
    oeffnen: false,
    takt: auftrag.takt
  })

  if (suite) {
    notify({
      action: { label: 'Suite betreten', onClick: () => oeffneSuite(suite) },
      id: `suite-eroeffnet:${suite.id}`,
      kind: 'success',
      message: auftrag.takt
        ? `Dauerauftrag, Takt ${auftrag.takt}. Der Raumleiter plant die erste Runde.`
        : 'Der Raumleiter plant die erste Runde.',
      title: `Suite „${auftrag.name}“ ist eröffnet`
    })
  }
}

/**
 * Watch every session for a turn that just settled (busy → idle). The room
 * lead's own sessions are skipped (rooms are no sessions of this app, their
 * members' turns run on the gateway): only the Vorzimmer opens rooms.
 * Returns the unsubscribe.
 */
export function startVorzimmerWache(): () => void {
  const warBeschaeftigt = new Map<string, boolean>()
  const erledigt = new Set<string>()

  return $sessionStates.listen(states => {
    for (const [runtimeId, state] of Object.entries(states)) {
      const vorher = warBeschaeftigt.get(runtimeId)
      warBeschaeftigt.set(runtimeId, Boolean(state.busy))

      if (!vorher || state.busy || ownerProfil(runtimeId) === RAUMLEITER) {
        continue
      }

      const letzte = [...state.messages].reverse().find(message => message.role === 'assistant')
      const text = letzte ? chatMessageText(letzte) : ''
      const auftrag = text ? raumAuftragAusText(text) : undefined
      const adresse = text ? oeffneAusText(text) : undefined
      const schluessel = `${state.storedSessionId ?? runtimeId}:${letzte?.id ?? ''}`

      if ((auftrag || adresse) && !erledigt.has(schluessel)) {
        erledigt.add(schluessel)

        if (auftrag) {
          void uebergeben(auftrag)
        }

        if (adresse) {
          oeffneImBrowser(adresse)
        }
      }
    }
  })
}
