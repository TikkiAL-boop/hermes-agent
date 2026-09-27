// brand.ts — the one place where the UI stops saying "Hermes" and says "Tikki".
//
// Upstream ships every locale with the product name spelled out in hundreds
// of strings. Rewriting those files would turn each upstream sync into a
// merge fight, so instead the catalog is passed through this filter once at
// module load. Only the capitalised product name is touched; the lowercase
// `hermes` CLI, config paths, package names and URLs stay as they are.

import type { Translations } from './types'

export const BRAND_NAME = 'Tikki'

const RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // Longer product phrases first so they collapse to the single brand name.
  [/\bHermes (?:Agent|Desktop|Light)\b/g, BRAND_NAME],
  [/\bHermes\b/g, BRAND_NAME]
]

export function brandString(value: string): string {
  let out = value
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement)
  }
  return out
}

type AnyFn = (...args: unknown[]) => unknown

function brandValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return brandString(value)
  }
  if (typeof value === 'function') {
    const fn = value as AnyFn
    return (...args: unknown[]): unknown => brandValue(fn(...args))
  }
  if (Array.isArray(value)) {
    return value.map(brandValue)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = brandValue(entry)
    }
    return out
  }
  return value
}

/** Returns a copy of `translations` with every user-visible "Hermes" renamed. */
export function brandTranslations(translations: Translations): Translations {
  return brandValue(translations) as Translations
}
