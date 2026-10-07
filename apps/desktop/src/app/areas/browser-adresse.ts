// The address line's one rule, kept pure so it can be tested without the browser store.

/** What a person types into the address line: a web address as is, a bare host with https, anything else as a web search. */
export function adresseAusEingabe(eingabe: string): string {
  const text = eingabe.trim()

  if (!text) {
    return 'about:blank'
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('about:')) {
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
