// Binding a suite's chat: the stored session (durable identity, what the
// history lists) to a live runtime id (what the streams key on). The tile
// delegate already owns that resume — one owner, no second resume path.

import { atom, computed } from 'nanostores'
import { useEffect, useMemo, useState } from 'react'

import { getLatestSessionMessages } from '@/api/sessions'
import { reasoningEffortPending, type SessionView } from '@/app/chat/session-view'
import { lastVisibleMessageIsUser } from '@/app/chat/thread-loading'
import { type ChatMessage, toChatMessages } from '@/lib/chat-messages'
import { activeGatewayConnectionId, requestGatewayForProfile } from '@/store/gateway'
import { $connection, $gatewayState, setSessionOwnerHint } from '@/store/session'
import type { SessionOwnerRoute } from '@/store/session-request-router'
import { $sessionStates, holdSessionTranscript, publishSessionState, sessionTileDelegate } from '@/store/session-states'

import { fehlertext, SUITE_PROFIL } from './store'

const NO_MESSAGES: ChatMessage[] = []

/** Every RPC of a suite goes to the room lead's own backend, never the active socket. */
export function suiteOwnerRoute(): SessionOwnerRoute | undefined {
  const connectionId = (activeGatewayConnectionId() ?? $connection.get()?.connectionId ?? '').trim()

  if (!connectionId) {
    return undefined
  }

  const mode = $connection.get()?.mode === 'remote' ? 'remote' : 'local'

  return { connectionId, mode, profile: SUITE_PROFIL }
}

/** The same atom shape the primary chat and the tiles render from, for one bound runtime. */
export function suiteSessionView(storedId: string, runtimeId: string): SessionView {
  const $runtimeId = atom<string | null>(runtimeId)
  const $state = computed($sessionStates, states => states[runtimeId])
  const $messages = computed($state, state => state?.messages ?? NO_MESSAGES)

  return {
    kind: 'tile',
    $awaitingResponse: computed($state, state => Boolean(state?.awaitingResponse)),
    $busy: computed($state, state => Boolean(state?.busy)),
    $cwd: computed($state, state => state?.cwd ?? ''),
    $fast: computed($state, state => Boolean(state?.fast)),
    $lastVisibleIsUser: computed($messages, lastVisibleMessageIsUser),
    $messages,
    $messagesEmpty: computed($messages, messages => messages.length === 0),
    $model: computed($state, state => state?.model ?? ''),
    $provider: computed($state, state => state?.provider ?? ''),
    $reasoningEffort: computed($state, state => state?.reasoningEffort ?? ''),
    $reasoningEffortPending: computed($state, state => (state ? reasoningEffortPending(state) : true)),
    $reasoningEffortWire: computed($state, state => state?.reasoningEffortWire ?? ''),
    $runtimeId,
    $storedId: atom(storedId),
    $turnStartedAt: computed($state, state => state?.turnStartedAt ?? null)
  }
}

/** A resume that omitted its messages and whose prefetch came back empty leaves
 *  a bound runtime with no transcript; read it once from the room lead's backend. */
async function fuelleTranskript(
  storedId: string,
  runtimeId: string,
  ownerRoute: SessionOwnerRoute | undefined
): Promise<void> {
  if (($sessionStates.get()[runtimeId]?.messages.length ?? 0) > 0) {
    return
  }

  try {
    const page = await getLatestSessionMessages(storedId, ownerRoute ?? SUITE_PROFIL)
    const current = $sessionStates.get()[runtimeId]

    if (current && current.messages.length === 0 && page.messages?.length) {
      publishSessionState(runtimeId, { ...current, messages: toChatMessages(page.messages) })
    }
  } catch {
    // The thread shows its own resume notice; nothing to add here.
  }
}

export interface SuiteRuntime {
  fehler: string | null
  ownerRoute: SessionOwnerRoute | undefined
  runtimeId: string | null
  view: SessionView | null
}

/** Resume the suite's session once the gateway is open; re-resume when the suite changes. */
export function useSuiteRuntime(storedId: string): SuiteRuntime {
  const [runtimeId, setRuntimeId] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gatewayOpen, setGatewayOpen] = useState(() => $gatewayState.get() === 'open')
  const ownerRoute = useMemo(() => suiteOwnerRoute(), [])

  useEffect(() => $gatewayState.subscribe(state => setGatewayOpen(state === 'open')), [])

  // The room is neither a tile nor the primary route: without this hold the
  // state cache releases the suite's transcript on the first settled publish.
  useEffect(() => holdSessionTranscript(storedId), [storedId])

  useEffect(() => {
    setRuntimeId(null)
    setFehler(null)

    if (!gatewayOpen) {
      return
    }

    const delegate = sessionTileDelegate()

    if (!delegate) {
      setFehler('session tile delegate unavailable')

      return
    }

    let cancelled = false
    let gebunden: string | null = null

    if (ownerRoute) {
      setSessionOwnerHint(storedId, ownerRoute)
    }

    delegate
      .resumeTile(storedId, { refreshTranscript: true })
      .then(async id => {
        if (cancelled) {
          return
        }

        // The runtime is nobody's tile, so no event has proved its owner yet;
        // without this, every session-scoped RPC on it fails closed.
        if (ownerRoute) {
          setSessionOwnerHint(id, ownerRoute)
        }

        await fuelleTranskript(storedId, id, ownerRoute)
        gebunden = id

        if (!cancelled) {
          setRuntimeId(id)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFehler(fehlertext(error))
        }
      })

    return () => {
      cancelled = true

      // Leaving an idle room releases its session on the backend: Hermes allows one
      // writer per session, and the room's Takt rounds run there while nobody watches.
      if (gebunden && !$sessionStates.get()[gebunden]?.busy) {
        void requestGatewayForProfile(SUITE_PROFIL, 'session.close', {
          profile: SUITE_PROFIL,
          session_id: gebunden
        }).catch(() => undefined)
      }
    }
  }, [gatewayOpen, ownerRoute, storedId])

  const view = useMemo(() => (runtimeId ? suiteSessionView(storedId, runtimeId) : null), [runtimeId, storedId])

  return { fehler, ownerRoute, runtimeId, view }
}
