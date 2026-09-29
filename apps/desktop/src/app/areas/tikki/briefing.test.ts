import { describe, expect, it } from 'vitest'

import { briefingText, chatsAusAntwort } from './briefing'

describe('briefingText', () => {
  it('names every source, says which one is missing, and asks Tikki to speak it', () => {
    const text = briefingText({
      chats: null,
      datum: new Date('2026-09-29T06:00:00'),
      mails: [{ von: 'Schule', betreff: 'Elternabend', datum: '2026-09-28T18:00:00Z' }],
      wartend: [{ id: 'a', titel: 'App' }],
      zuletzt: [{ id: 'b', titel: 'Urlaub Ostsee' }]
    })

    expect(text.startsWith('TAGESBRIEFING ')).toBe(true)
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
