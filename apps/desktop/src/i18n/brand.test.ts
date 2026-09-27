import { describe, expect, test } from 'vitest'

import { brandString, brandTranslations } from './brand'
import { TRANSLATIONS } from './catalog'
import { en } from './en'

describe('brand filter', () => {
  test('renames the product but leaves the CLI, paths and URLs alone', () => {
    expect(brandString('Hermes Agent keeps learning')).toBe('Tikki keeps learning')
    expect(brandString('Hermes Desktop and Hermes Light')).toBe('Tikki and Tikki')
    expect(brandString('Im Hermes-Katalog')).toBe('Im Tikki-Katalog')
    expect(brandString('run `hermes gateway start` in ~/.hermes')).toBe('run `hermes gateway start` in ~/.hermes')
    expect(brandString('https://hermes-agent.nousresearch.com/docs')).toBe('https://hermes-agent.nousresearch.com/docs')
  })

  test('function-valued strings are branded too', () => {
    const branded = brandTranslations({ a: { b: (name: string) => `Hermes darf ${name} verwenden` } } as never) as never as {
      a: { b: (name: string) => string }
    }
    expect(branded.a.b('Slack')).toBe('Tikki darf Slack verwenden')
  })

  test('no locale in the catalog still shows the upstream name', () => {
    const leaks: string[] = []
    const walk = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (/\bHermes\b/.test(value)) leaks.push(path)
      } else if (typeof value === 'function') {
        // Functions are wrapped; probe with neutral arguments.
        const out = (value as (...a: string[]) => unknown)('x', 'y', 'z')
        if (typeof out === 'string' && /\bHermes\b/.test(out)) leaks.push(path + '()')
      } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, `${path}.${k}`)
      }
    }
    for (const [locale, t] of Object.entries(TRANSLATIONS)) walk(t, locale)
    expect(leaks).toEqual([])
    // Sanity: the upstream file itself still says Hermes, so the filter did real work.
    expect(JSON.stringify(en)).toMatch(/Hermes/)
  })
})
