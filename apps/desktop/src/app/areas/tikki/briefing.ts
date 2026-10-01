// The daily briefing: the app gathers what is new (mail, WhatsApp, rooms that
// wait) and hands it to Tikki in the Vorzimmer, who tells it the way an
// assistant does in the morning. Reading aloud uses the system voice, so it
// works without any voice provider configured.

import { requestComposerSubmit } from '@/app/chat/composer/focus'
import { chatMessageText } from '@/lib/chat-messages/parts'
import { persistString, storedString } from '@/lib/storage'
import { $activeSessionId, $gatewayState } from '@/store/session'
import { $sessionStates } from '@/store/session-states'

import type { Suite } from '../suites/store'

export interface BriefingMail {
  von: string
  betreff: string
  datum: string | null
}

export interface BriefingChat {
  name: string
  letzte: string
}

export interface BriefingDaten {
  datum: Date
  mails: BriefingMail[] | null
  chats: BriefingChat[] | null
  wartend: Pick<Suite, 'id' | 'titel'>[]
  zuletzt: Pick<Suite, 'id' | 'titel'>[]
}

const WA_BRIDGE = 'http://127.0.0.1:8765'
const WA_TOKEN_KEY = 'tikki.briefing.waBridgeToken'

export const waBridgeToken = (): string => storedString(WA_TOKEN_KEY) ?? ''
export const setWaBridgeToken = (token: string) => persistString(WA_TOKEN_KEY, token.trim() || null)

/** Unread mail from the family mailbox, or null when nobody is signed in. */
export async function ungeleseneMails(limit = 12): Promise<BriefingMail[] | null> {
  const mail = window.hermesDesktop?.tikkiMail

  if (!mail) {
    return null
  }

  try {
    const status = await mail.status()

    if (!status.signedIn) {
      return null
    }

    const boxen = await mail.mailboxes()
    const inbox = boxen.find(b => b.specialUse === '\\Inbox') ?? boxen.find(b => /inbox/i.test(b.path)) ?? boxen[0]

    if (!inbox) {
      return []
    }

    const liste = await mail.list(inbox.path, 40)

    return liste
      .filter(m => !m.seen)
      .slice(0, limit)
      .map(m => ({ von: m.from || m.fromAddress, betreff: m.subject || '(ohne Betreff)', datum: m.date }))
  } catch {
    return null
  }
}

/** Chats with something new from the WA-Bridge, or null when the bridge is not running. */
export async function neueWhatsApps(token = waBridgeToken(), basis = WA_BRIDGE): Promise<BriefingChat[] | null> {
  if (!token) {
    return null
  }

  try {
    const res = await fetch(`${basis}/chats`, {
      headers: { 'X-Bridge-Token': token },
      signal: AbortSignal.timeout(2500)
    })

    if (!res.ok) {
      return null
    }

    const daten = (await res.json()) as unknown

    return chatsAusAntwort(daten)
  } catch {
    return null
  }
}

/** The bridge's chat list, whatever its exact shape: name plus last message, unread first. */
export function chatsAusAntwort(daten: unknown): BriefingChat[] {
  const liste = Array.isArray(daten)
    ? daten
    : daten && typeof daten === 'object' && Array.isArray((daten as { chats?: unknown }).chats)
      ? ((daten as { chats: unknown[] }).chats ?? [])
      : []

  return liste
    .map(eintrag => {
      const e = (eintrag ?? {}) as Record<string, unknown>
      const name = String(e.name ?? e.chat ?? e.title ?? '').trim()
      const letzte = String(e.lastMessage ?? e.last ?? e.preview ?? e.text ?? '').trim()
      const ungelesen = Number(e.unread ?? e.unreadCount ?? 0) > 0

      return name ? { name, letzte, ungelesen } : null
    })
    .filter((c): c is { name: string; letzte: string; ungelesen: boolean } => c !== null)
    .filter(c => c.ungelesen || c.letzte)
    .sort((a, b) => Number(b.ungelesen) - Number(a.ungelesen))
    .slice(0, 8)
    .map(({ name, letzte }) => ({ name, letzte }))
}

const datumText = (d: Date) =>
  d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** The brief Tikki receives: plain facts first, then how to tell them. */
export function briefingText({ chats, datum, mails, wartend, zuletzt }: BriefingDaten): string {
  const zeilen = [
    `BRIEFING ${datumText(datum)}`,
    'Ruf zuerst briefing_sammeln auf; was die App hier schon weiß, kommt dazu:'
  ]

  if (mails === null) {
    zeilen.push('POST: nicht angemeldet (Bereich Post).')
  } else if (mails.length === 0) {
    zeilen.push('POST: keine ungelesenen Mails.')
  } else {
    zeilen.push(`POST: ${mails.length} ungelesen`)
    zeilen.push(...mails.map(m => `- ${m.von}: ${m.betreff}${m.datum ? ` (${m.datum.slice(0, 10)})` : ''}`))
  }

  if (chats === null) {
    zeilen.push('WHATSAPP: WA-Bridge nicht erreichbar oder kein Token hinterlegt.')
  } else if (chats.length === 0) {
    zeilen.push('WHATSAPP: nichts Neues.')
  } else {
    zeilen.push(`WHATSAPP: ${chats.length} Chats mit Neuem`)
    zeilen.push(...chats.map(c => `- ${c.name}: ${c.letzte || '(neue Nachricht)'}`))
  }

  zeilen.push(
    wartend.length
      ? `SUITEN, DIE AUF MICH WARTEN: ${wartend.map(s => s.titel).join(', ')}`
      : 'SUITEN: keine wartet auf mich.'
  )

  if (zuletzt.length) {
    zeilen.push(`ZULETZT BESUCHT: ${zuletzt.map(s => s.titel).join(', ')}`)
  }

  zeilen.push(
    '',
    'Trag mir das vor wie meine Assistentin am Morgen: erst, was du erledigt hast, dann das Wichtigste, dann der Rest, in drei bis acht Sätzen, ohne Aufzählung. Wenn etwas eine Entscheidung von mir braucht, sag es zum Schluss.'
  )

  return zeilen.join('\n')
}

/** Hand the briefing to Tikki. False when no chat input is on screen. */
export function briefingAbgeben(text: string): boolean {
  return requestComposerSubmit(text, { target: 'main' })
}

// ─── Automatik ───────────────────────────────────────────────────────────────

const ZULETZT_KEY = 'tikki.briefing.zuletzt'
const AUTOMATIK_KEY = 'tikki.briefing.automatik'
/** A briefing on arrival is due again after this long. */
export const BRIEFING_ABSTAND_MS = 4 * 60 * 60 * 1000
/** Give the gateway and the chat a moment before Tikki starts talking. */
export const BRIEFING_VERZUG_MS = 12_000

export const briefingAutomatik = (): boolean => storedString(AUTOMATIK_KEY) !== '0'
export const setBriefingAutomatik = (an: boolean) => persistString(AUTOMATIK_KEY, an ? null : '0')
export const letztesBriefing = (): number => Number(storedString(ZULETZT_KEY) ?? 0) || 0
export const briefingGemerkt = (zeit = Date.now()) => persistString(ZULETZT_KEY, String(zeit))

/** Pure: does Tikki greet with a briefing now? Off, or one recently given, means no. */
export function briefingFaellig(zuletzt: number, jetzt: number, an: boolean, abstandMs = BRIEFING_ABSTAND_MS): boolean {
  return an && jetzt - zuletzt >= abstandMs
}

/**
 * When the gateway opens and no briefing was given lately, hand one to Tikki
 * after a short delay. Returns the stop function.
 */
export function startBriefingAutomatik(ausloesen: () => Promise<void> | void): () => void {
  let timer: number | undefined

  const stop = $gatewayState.subscribe(state => {
    window.clearTimeout(timer)

    if (state !== 'open' || !briefingFaellig(letztesBriefing(), Date.now(), briefingAutomatik())) {
      return
    }

    timer = window.setTimeout(() => {
      if (briefingFaellig(letztesBriefing(), Date.now(), briefingAutomatik())) {
        void ausloesen()
      }
    }, BRIEFING_VERZUG_MS)
  })

  return () => {
    window.clearTimeout(timer)
    stop()
  }
}

// ─── Vorlesen ────────────────────────────────────────────────────────────────

const VORLESEN_KEY = 'tikki.briefing.vorlesen'

export const vorlesenAktiv = (): boolean => storedString(VORLESEN_KEY) === '1'
export const setVorlesenAktiv = (an: boolean) => persistString(VORLESEN_KEY, an ? '1' : null)

/** Speak with the system voice; German when available. */
export function vorlesen(text: string): void {
  if (typeof speechSynthesis === 'undefined' || !text.trim()) {
    return
  }

  speechSynthesis.cancel()
  const rede = new SpeechSynthesisUtterance(text.replace(/[*_`#>]/g, ''))
  rede.lang = 'de-DE'
  const stimme = speechSynthesis.getVoices().find(v => v.lang.startsWith('de'))

  if (stimme) {
    rede.voice = stimme
  }

  speechSynthesis.speak(rede)
}

export function vorlesenStopp(): void {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.cancel()
  }
}

/** While reading is on, every finished reply of the Vorzimmer chat is spoken once. */
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

    if (!fertig || !vorlesenAktiv()) {
      return
    }

    const letzte = [...state.messages].reverse().find(m => m.role === 'assistant')
    const text = letzte ? chatMessageText(letzte) : ''

    if (text && text !== gesprochen) {
      gesprochen = text
      vorlesen(text)
    }
  })
}
