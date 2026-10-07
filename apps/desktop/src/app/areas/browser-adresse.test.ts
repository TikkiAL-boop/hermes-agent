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
})
