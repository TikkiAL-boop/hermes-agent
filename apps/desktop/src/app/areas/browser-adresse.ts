// The address line's one rule, kept pure so it can be tested without the browser store.

/** The only schemes the address line navigates to. Everything else that looks like one is searched for. */
const SCHEMA = /^(https?|file):\/\//i

const istAdresse = (text: string): boolean => {
  try {
    new URL(text)

    return true
  } catch {
    return false
  }
}

/**
 * What a person types into the address line: a web address as is, a bare host with https, anything
 * else as a web search. A script-bearing or internal scheme (`javascript://`, `data:`, `chrome://`)
 * is never navigated to — it would run inside the page that is open — the same line Hermes' own
 * address bar draws (`normalizePreviewAddress`).
 */
export function adresseAusEingabe(eingabe: string): string {
  const text = eingabe.trim()

  if (!text || text === 'about:blank') {
    return 'about:blank'
  }

  if (SCHEMA.test(text) && istAdresse(text)) {
    return text
  }

  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:[/?#]|$)/i.test(text) && !/\s/.test(text)) {
    return `https://${text}`
  }

  if (/^localhost(?::\d+)?(?:[/?#]|$)/i.test(text) || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?(?:[/?#]|$)/.test(text)) {
    return `http://${text}`
  }

  return `https://www.google.com/search?q=${encodeURIComponent(text)}`
}
