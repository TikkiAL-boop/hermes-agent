import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { $activeGatewayRoute } from '@/store/gateway'
import { $gatewayState } from '@/store/session'

import { PA_PROFIL } from './auftraege'
import {
  BRIEFING_VERZUG_MS,
  briefingFaellig,
  briefingGemerkt,
  briefingText,
  chatsAusAntwort,
  letztesBriefing,
  startBriefingAutomatik
} from './briefing'

describe('briefingText', () => {
  it('names every source, says which one is missing, and asks Tikki to speak it', () => {
    const text = briefingText({
      chats: null,
      datum: new Date('2026-09-29T06:00:00'),
      mails: [{ von: 'Schule', betreff: 'Elternabend', datum: '2026-09-28T18:00:00Z' }],
      wartend: [{ id: 'a', titel: 'App' }],
      zuletzt: [{ id: 'b', titel: 'Urlaub Ostsee' }]
    })

    expect(text.startsWith('BRIEFING ')).toBe(true)
    expect(text).toContain('briefing_sammeln')
    expect(text).toContain('POST: 1 ungelesen')
    expect(text).toContain('- Schule: Elternabend (2026-09-28)')
    expect(text).toContain('WHATSAPP: WA-Bridge nicht erreichbar')
    expect(text).toContain('SUITEN, DIE AUF MICH WARTEN: App')
    expect(text).toContain('ZULETZT BESUCHT: Urlaub Ostsee')
    expect(text).toMatch(/Assistentin am Morgen/)
  })

  it('reads a quiet morning as quiet', () => {
    const text = briefingText({ chats: [], datum: new Date(), mails: [], wartend: [], zuletzt: [] })

    expect(text).toContain('POST: keine ungelesenen Mails.')
    expect(text).toContain('WHATSAPP: nichts Neues.')
    expect(text).toContain('SUITEN: keine wartet auf mich.')
  })
})

describe('chatsAusAntwort', () => {
  it('takes the bridge list in either shape, unread first, and drops silent chats', () => {
    const chats = chatsAusAntwort({
      chats: [
        { name: 'Anna', lastMessage: 'Bis später', unread: 0 },
        { name: 'Papa', lastMessage: 'Ruf mal an', unread: 2 },
        { name: 'Leer', lastMessage: '', unread: 0 }
      ]
    })

    expect(chats).toEqual([
      { name: 'Papa', letzte: 'Ruf mal an' },
      { name: 'Anna', letzte: 'Bis später' }
    ])
    expect(chatsAusAntwort([{ chat: 'Karin', last: 'ok', unreadCount: 1 }])).toEqual([{ name: 'Karin', letzte: 'ok' }])
  })
})

describe('briefingFaellig', () => {
  it('greets on arrival only when it is on and the last one is old enough', () => {
    const h = 60 * 60 * 1000

    expect(briefingFaellig(0, 10 * h, true)).toBe(true)
    expect(briefingFaellig(9 * h, 10 * h, true)).toBe(false)
    expect(briefingFaellig(5 * h, 10 * h, true)).toBe(true)
    expect(briefingFaellig(0, 10 * h, false)).toBe(false)
  })
})

describe('startBriefingAutomatik', () => {
  let stop = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    $gatewayState.set('idle')
  })

  afterEach(() => {
    stop()
    $gatewayState.set('idle')
    $activeGatewayRoute.set('default')
    localStorage.clear()
    vi.useRealTimers()
  })

  // Mirrors the Vorzimmer: a delivered briefing stamps the time.
  const ausloeser = () =>
    vi.fn(() => {
      briefingGemerkt()
    })

  it("hands the briefing to Tikki once the gateway opens on Tikki's profile", () => {
    const ausloesen = ausloeser()
    $activeGatewayRoute.set(PA_PROFIL)
    stop = startBriefingAutomatik(ausloesen)

    $gatewayState.set('open')
    vi.advanceTimersByTime(BRIEFING_VERZUG_MS)

    expect(ausloesen).toHaveBeenCalledTimes(1)
    expect(letztesBriefing()).toBeGreaterThan(0)
  })

  it("stays silent in another profile's chat and leaves the briefing due", () => {
    const ausloesen = ausloeser()
    $activeGatewayRoute.set('raumleiter')
    stop = startBriefingAutomatik(ausloesen)

    $gatewayState.set('open')
    vi.advanceTimersByTime(BRIEFING_VERZUG_MS * 2)

    expect(ausloesen).not.toHaveBeenCalled()
    expect(letztesBriefing()).toBe(0)
  })
})
