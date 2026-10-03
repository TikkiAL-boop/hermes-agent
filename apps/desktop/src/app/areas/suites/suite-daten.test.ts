import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat-messages'

import { ausgabenAusNachrichten, eingabenAusNachrichten, taktAusNachrichten } from './suite-daten'

const user = (text: string, attachmentRefs?: string[]): ChatMessage => ({
  id: `u-${text.length}`,
  parts: [{ type: 'text', text }],
  role: 'user',
  ...(attachmentRefs ? { attachmentRefs } : {})
})

const bot = (text: string): ChatMessage => ({
  id: `a-${text.length}`,
  parts: [{ type: 'text', text }],
  role: 'assistant'
})

describe('eingabenAusNachrichten', () => {
  it('collects what people handed in, once each, and ignores what the bots said', () => {
    const eingaben = eingabenAusNachrichten([
      user('Schau dir @file:"/Users/karin/Angebot Möwe.pdf" an und https://example.test/haus', [
        '@image:/tmp/strand.png'
      ]),
      user('Nochmal https://example.test/haus bitte, dazu @folder:~/Urlaub'),
      bot('Ich habe https://example.test/ergebnis geschrieben.')
    ])

    expect(eingaben).toEqual([
      { art: 'image', wert: '/tmp/strand.png' },
      { art: 'file', wert: '/Users/karin/Angebot Möwe.pdf' },
      { art: 'url', wert: 'https://example.test/haus' },
      { art: 'folder', wert: '~/Urlaub' }
    ])
  })
})

describe('ausgabenAusNachrichten', () => {
  it('collects links, files and images the bots produced, labelled from the markdown when there is one', () => {
    const ausgaben = ausgabenAusNachrichten([
      user('Bitte eine Packliste.'),
      bot(
        'Fertig: [Packliste](/Users/karin/Urlaub/packliste.md) und das Bild /tmp/karte.png.\nQuelle: https://example.test/ferien/haus?x=1'
      ),
      bot('Die Datei /Users/karin/Urlaub/packliste.md ist aktualisiert. Ein Wort ohne Endung: /etc/hosts')
    ])

    // Order is not a contract: one pass per pattern, so compare as sets.
    const sortiert = <T extends { wert: string }>(liste: readonly T[]): T[] =>
      [...liste].sort((a, b) => (a.wert < b.wert ? -1 : 1))

    expect(sortiert(ausgaben)).toEqual(
      sortiert([
        { art: 'datei', label: 'Packliste', wert: '/Users/karin/Urlaub/packliste.md' },
        { art: 'bild', label: 'karte.png', wert: '/tmp/karte.png' },
        { art: 'link', label: 'example.test/ferien/haus', wert: 'https://example.test/ferien/haus?x=1' }
      ])
    )
  })
})

describe('taktAusNachrichten', () => {
  it('takes the last schedule line from either side, and "aus" ends it', () => {
    expect(
      taktAusNachrichten([user('RAUM: X\nTAKT: täglich 06:00'), bot('Bestätigt.\n**TAKT:** alle 30 Minuten')])
    ).toBe('alle 30 Minuten')
    expect(taktAusNachrichten([user('TAKT: täglich 06:00'), user('TAKT: aus')])).toBeUndefined()
  })
})
