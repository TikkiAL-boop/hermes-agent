import { ar } from './ar'
import { brandTranslations } from './brand'
import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { ja } from './ja'
import { ru } from './ru'
import type { Locale, Translations } from './types'
import { zh } from './zh'
import { zhHant } from './zh-hant'

const RAW: Record<Locale, Translations> = {
  en,
  zh,
  'zh-hant': zhHant,
  ja,
  ar,
  ru,
  fr,
  de,
  es
}

// Every locale goes through the brand filter once, so the UI says "Tikki"
// while the upstream locale files stay byte-identical (see brand.ts).
export const TRANSLATIONS: Record<Locale, Translations> = Object.fromEntries(
  Object.entries(RAW).map(([locale, translations]) => [locale, brandTranslations(translations)])
) as Record<Locale, Translations>
