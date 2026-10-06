// Tikki's voice, shared by the overview and the rooms. Speaking goes through
// Hermes' own voice pipeline: `playSpeechText` synthesizes with the profile's
// TTS provider (tts.provider: edge, piper, xai, …) and plays it in THIS window —
// provider-direct, else the gateway's /api/audio/speak-stream, else POST
// /api/audio/speak. The browser's system voice is the fallback when Hermes has
// no usable provider. Listening uses the same microphone path as the Hermes
// composer: MediaRecorder → provider-direct STT, else /api/audio/transcribe
// (stt.provider: local = faster-whisper on the backend machine).
//
// Not `voice.tts` / `voice.record`: those RPCs speak and listen on the
// backend's own speaker and microphone (TUI path), which is the wrong machine
// as soon as the app talks to a remote backend.

import { blobToDataUrl } from '@/app/session/hooks/use-prompt-actions/utils'
import { transcribeAudio } from '@/hermes'
import { persistString, storedString } from '@/lib/storage'
import { transcribeAudioClientDirect } from '@/lib/voice-client-direct'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'

import { RAUMLEITER } from '../suites/store'

export type Stimme = 'hermes' | 'browser' | 'stumm'

/** Read-aloud switches, remembered per surface (best-effort storage, see lib/storage). */
export const VORLESEN_UEBERSICHT = 'tikki.briefing.vorlesen'
export const VORLESEN_RAUM = 'tikki.raum.vorlesen'

export const vorlesenAktiv = (schluessel: string): boolean => storedString(schluessel) === '1'
export const setVorlesenAktiv = (schluessel: string, an: boolean) => persistString(schluessel, an ? '1' : null)

/** Pure: which voice speaks — Hermes when it played, else the system voice when the browser has one. */
export function stimmeWaehlen(hermesGespielt: boolean, browserDa: boolean): Stimme {
  if (hermesGespielt) {
    return 'hermes'
  }

  return browserDa ? 'browser' : 'stumm'
}

export interface Vorlesbar {
  seq: number
  von: string
  text: string
  still: boolean
  system: boolean
}

/**
 * Pure: which room messages are read now — only the room lead's own words,
 * only those after `abSeq`, never `(pass)` or anything the backend put into
 * the room. Returns the new cursor too, so a backlog seen while reading is
 * off is skipped rather than read later.
 */
export function neuVorzulesen(
  nachrichten: readonly Vorlesbar[],
  abSeq: number,
  sprecher: string = RAUMLEITER
): { seq: number; texte: string[] } {
  const neu = nachrichten.filter(n => n.seq > abSeq)

  return {
    seq: neu.reduce((max, n) => Math.max(max, n.seq), abSeq),
    texte: neu.filter(n => n.von === sprecher && !n.still && !n.system && n.text.trim()).map(n => n.text)
  }
}

export const browserStimmeDa = (): boolean => typeof speechSynthesis !== 'undefined'

/** The system voice; German when the machine has one. */
export function browserSprechen(text: string): void {
  if (!browserStimmeDa()) {
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

/** Hermes speaks with the active profile's TTS provider; true when audio played. */
const hermesSprechen = (text: string): Promise<boolean> => playSpeechText(text, { source: 'read-aloud' })

export interface Sprecher {
  browser: (text: string) => void
  browserDa: () => boolean
  hermes: (text: string) => Promise<boolean>
}

const STANDARD: Sprecher = { browser: browserSprechen, browserDa: browserStimmeDa, hermes: hermesSprechen }

// One voice at a time: a second text waits for the first, and a stop drops
// everything queued. Without the generation a stop would look to the Hermes
// rung like "not played" and the browser voice would finish the sentence.
let kette: Promise<unknown> = Promise.resolve()
let generation = 0

/** Speak through Hermes, else the system voice; resolves with who spoke. */
export function sprich(text: string, sprecher: Sprecher = STANDARD): Promise<Stimme> {
  const rede = text.trim()
  const meine = generation

  const lauf = kette.then(async (): Promise<Stimme> => {
    if (!rede || meine !== generation) {
      return 'stumm'
    }

    let gespielt = false

    try {
      gespielt = await sprecher.hermes(rede)
    } catch {
      // No provider, no backend, no audio: the system voice takes over.
    }

    if (meine !== generation) {
      return 'stumm'
    }

    const stimme = stimmeWaehlen(gespielt, sprecher.browserDa())

    if (stimme === 'browser') {
      sprecher.browser(rede)
    }

    return stimme
  })

  kette = lauf.catch(() => undefined)

  return lauf
}

/** Silence both voices and forget what was still queued. */
export function vorlesenStopp(): void {
  generation += 1
  stopVoicePlayback()

  if (browserStimmeDa()) {
    speechSynthesis.cancel()
  }
}

/** The room's microphone take → text, the way the Hermes composer does it. */
export async function transkribieren(audio: Blob): Promise<string> {
  const direkt = await transcribeAudioClientDirect(audio)

  if (direkt !== null) {
    return direkt
  }

  return (await transcribeAudio(await blobToDataUrl(audio), audio.type)).transcript
}
