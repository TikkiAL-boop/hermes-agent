// The address line in the Vorzimmer: an address, or words to search for.
//
// What counts as an address, and how it is completed, is Hermes' own
// address-bar rule (`normalizePreviewAddress`) — one resolver for every
// address field in the app. This file only adds what a search box needs on top:
// words are searched for instead of being read as a host name.

import { normalizePreviewAddress } from '@/app/chat/right-rail/preview-browser-bar'

/** The only schemes this line navigates to; anything else Hermes' rule would let through is searched for. */
const SCHEMA = /^(https?|file):\/\//i
/** A host as people type it: a name with a top-level domain, or `localhost`. */
const HOST = /^(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]|$)|^localhost(?::\d+)?(?:[/?#]|$)/i
/** A bare IPv4 address is a device at home, and those speak plain http. */
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/

/**
 * What a person types into the address line: a web address as is, a bare host completed, anything
 * else as a web search. A script-bearing or internal scheme (`javascript://`, `data:`, `chrome://`)
 * is never navigated to — it would run inside the page that is open.
 */
export function adresseAusEingabe(eingabe: string): string {
  const text = eingabe.trim()

  if (!text || text === 'about:blank') {
    return 'about:blank'
  }

  const kandidat = SCHEMA.test(text) || HOST.test(text) ? text : IPV4.test(text) ? `http://${text}` : null
  const adresse = kandidat && !/\s/.test(kandidat) ? normalizePreviewAddress(kandidat) : null

  return adresse && SCHEMA.test(adresse) ? adresse : `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
