import { describe, expect, it } from 'vitest'

import { adresseAusEingabe } from './browser-adresse'

describe('adresseAusEingabe', () => {
  it('keeps addresses, completes bare hosts, and searches everything else', () => {
    expect(adresseAusEingabe('https://tikki.wiki/fragen')).toBe('https://tikki.wiki/fragen')
    expect(adresseAusEingabe('tikki.wiki')).toBe('https://tikki.wiki')
    expect(adresseAusEingabe('localhost:8000/health')).toBe('http://localhost:8000/health')
    expect(adresseAusEingabe('wärmepumpe förderung 2026')).toBe(
      'https://www.google.com/search?q=w%C3%A4rmepumpe%20f%C3%B6rderung%202026'
    )
    expect(adresseAusEingabe('   ')).toBe('about:blank')
  })

  it.each([
    'javascript://example.org/%0aalert(document.cookie)',
    'JavaScript://x/%0afetch("//evil")',
    'data://text/html,<script>alert(1)</script>',
    'data:text/html,<script>alert(1)</script>',
    'chrome://settings',
    'devtools://devtools/bundled/inspector.html',
    'view-source://example.org',
    'about:config',
    'https://'
  ])('never navigates to anything but a web or file address: %s', eingabe => {
    const ziel = adresseAusEingabe(eingabe)

    // Whatever it is, it ends up as a search for the words — never as a navigation of its own.
    expect(new URL(ziel).origin).toBe('https://www.google.com')
    expect(new URL(ziel).searchParams.get('q')).toBe(eingabe)
  })
})
