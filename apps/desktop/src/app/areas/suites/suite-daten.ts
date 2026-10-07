// What went into a suite and what came out of it, read from its transcript.
// Pure functions over ChatMessage[] so the two screens can be tested without
// a backend and stay honest: nothing here is invented, only found.

import type { ChatMessage } from '@/lib/chat-messages'
import { chatMessageText } from '@/lib/chat-messages/parts'

export type EingabeArt = 'file' | 'folder' | 'url' | 'image' | 'terminal' | 'tool'

export interface Eingabe {
  art: EingabeArt
  /** The reference as the person gave it: a path, a URL, a tool name. */
  wert: string
}

export type AusgabeArt = 'link' | 'datei' | 'bild'

export interface Ausgabe {
  art: AusgabeArt
  /** A URL or an absolute path. */
  wert: string
  /** Markdown link text when there was one, else the file name or host. */
  label: string
}

const CONTEXT_REF_RE = /@(file|folder|url|image|tool|terminal):(?:"([^"\n]+)"|'([^'\n]+)'|`([^`\n]+)`|(\S+))/g
const URL_RE = /https?:\/\/[^\s<>"')`\]]+/g
const MARKDOWN_LINK_RE = /(!?)\[([^\]]*)\]\(([^)\s]+)\)/g
const PATH_RE = /(?:^|[\s("'`])((?:\/|~\/)[^\s"'`<>)]+\.[a-z0-9]{1,8})/gi
const IMAGE_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp)$/i

const DATEI_RE =
  /\.(?:pdf|txt|json|md|csv|xlsx?|docx?|pptx?|html?|zip|tar|gz|mp3|wav|mp4|mov|py|ts|tsx|js|css|yaml|yml)$/i

const unquote = (value: string): string => value.replace(/^["'`]|["'`]$/g, '').replace(/[.,;:!?]+$/, '')

/** Everything the people in the room handed in: attachments and `@ref:` mentions in their messages. */
export function eingabenAusNachrichten(messages: readonly ChatMessage[]): Eingabe[] {
  const seen = new Map<string, Eingabe>()

  const add = (art: EingabeArt, wert: string) => {
    const clean = unquote(wert.trim())

    if (clean && !seen.has(`${art}:${clean}`)) {
      seen.set(`${art}:${clean}`, { art, wert: clean })
    }
  }

  for (const message of messages) {
    if (message.role !== 'user' || message.hidden) {
      continue
    }

    for (const ref of message.attachmentRefs ?? []) {
      const match = /^@(file|folder|url|image|tool|terminal):([\s\S]+)$/.exec(ref.trim())

      if (match) {
        add(match[1] as EingabeArt, match[2])
      }
    }

    const text = chatMessageText(message)

    for (const match of text.matchAll(CONTEXT_REF_RE)) {
      add(match[1] as EingabeArt, match[2] ?? match[3] ?? match[4] ?? match[5] ?? '')
    }

    for (const match of text.matchAll(URL_RE)) {
      add('url', match[0])
    }
  }

  return [...seen.values()]
}

const artAusWert = (wert: string): AusgabeArt =>
  /^https?:\/\//.test(wert) ? 'link' : IMAGE_RE.test(wert) ? 'bild' : 'datei'

const labelAusWert = (wert: string): string => {
  if (/^https?:\/\//.test(wert)) {
    try {
      const url = new URL(wert)

      return url.hostname + (url.pathname !== '/' ? url.pathname : '')
    } catch {
      return wert
    }
  }

  return wert.split('/').pop() || wert
}

/** Everything the room produced: links, files and images the bots reported in their replies. */
export function ausgabenAusNachrichten(messages: readonly ChatMessage[]): Ausgabe[] {
  const seen = new Map<string, Ausgabe>()

  const add = (wert: string, label?: string) => {
    const clean = unquote(wert.trim())

    if (!clean || seen.has(clean)) {
      return
    }

    const art = artAusWert(clean)

    if (art === 'datei' && !DATEI_RE.test(clean)) {
      return
    }

    seen.set(clean, { art, label: label?.trim() || labelAusWert(clean), wert: clean })
  }

  for (const message of messages) {
    if (message.role !== 'assistant' || message.hidden) {
      continue
    }

    const text = chatMessageText(message)

    for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
      add(match[3], match[2])
    }

    for (const match of text.matchAll(URL_RE)) {
      add(match[0])
    }

    for (const match of text.matchAll(PATH_RE)) {
      add(match[1])
    }
  }

  return [...seen.values()]
}

const TAKT = /(?:^|\n)[ \t>*_]*TAKT:[ \t*_]*([^\n]+)/g
const AUS = new Set(['aus', 'stopp', 'stop', 'keiner', 'kein', 'nein', 'off', '-'])

/** The room's standing schedule: the last `TAKT:` line from the person or the room lead; `aus` ends it. */
export function taktAusNachrichten(messages: readonly ChatMessage[]): string | undefined {
  let takt: string | undefined

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }

    for (const treffer of chatMessageText(message).matchAll(TAKT)) {
      takt = treffer[1]!.replace(/[*_`]+$/g, '').trim()
    }
  }

  return takt && !AUS.has(takt.toLowerCase()) ? takt : undefined
}
