import type { Locale } from '@/i18n'

import type { Area } from './store'

interface AreaLabels {
  areas: Record<Area, string>
  browser: { close: string; newTab: string; untitled: string }
  post: { comingSoon: string; inbox: string; title: string }
  rail: { label: string }
}

const de: AreaLabels = {
  areas: { browser: 'Browser', post: 'Post', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Tab schließen', newTab: 'Neuer Tab', untitled: 'Neue Seite' },
  post: {
    comingSoon: 'Das Postfach kommt als Nächstes: Posteingang, Schreiben, Anhänge, und Tikki liest mit.',
    inbox: 'Posteingang',
    title: 'Post'
  },
  rail: { label: 'Bereiche' }
}

const en: AreaLabels = {
  areas: { browser: 'Browser', post: 'Mail', terminal: 'Terminal', tikki: 'Tikki' },
  browser: { close: 'Close tab', newTab: 'New tab', untitled: 'New page' },
  post: {
    comingSoon: 'Mail is next: inbox, compose, attachments, and Tikki reads along.',
    inbox: 'Inbox',
    title: 'Mail'
  },
  rail: { label: 'Areas' }
}

/** Tikki is a German-first product; every other locale falls back to English. */
export const areaLabels = (locale: Locale): AreaLabels => (locale === 'de' ? de : en)
