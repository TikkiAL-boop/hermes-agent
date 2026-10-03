// The last line of branding. The i18n catalog is branded once at load
// (i18n/brand.ts), but upstream also speaks in hardcoded strings — timeouts,
// backend errors ("This chat is open in another Hermes window"), settings
// descriptions. Rewriting those files would turn every upstream update into a
// merge fight, so the rendered page is watched instead: visible text and
// placeholders are branded in place. What people or the model wrote stays as
// written — message bodies, code, inputs, the terminal.

import { BRANDING_ENABLED, brandString } from '@/i18n/brand'

const AUSNAHMEN = [
  '.aui-md',
  '[data-role="user"]',
  'pre',
  'code',
  'textarea',
  'input',
  '[contenteditable="true"]',
  '.xterm',
  'webview',
  '[data-marke-frei]'
].join(',')

const HERMES = /\bHermes\b/

function frei(element: Element | null): boolean {
  return Boolean(element?.closest(AUSNAHMEN))
}

type Marke = (text: string) => string

function textBranden(node: Text, marke: Marke = brandString): void {
  const wert = node.nodeValue

  if (wert && HERMES.test(wert) && !frei(node.parentElement)) {
    const neu = marke(wert)

    if (neu !== wert) {
      node.nodeValue = neu
    }
  }
}

function elementBranden(element: Element, marke: Marke = brandString): void {
  for (const attribut of ['placeholder', 'aria-label']) {
    const wert = element.getAttribute(attribut)

    if (wert && HERMES.test(wert) && !frei(element.parentElement)) {
      element.setAttribute(attribut, marke(wert))
    }
  }
}

/** Brand everything visible under `wurzel` once. */
export function markeAnwenden(wurzel: Node, marke: Marke = brandString): void {
  if (wurzel.nodeType === Node.TEXT_NODE) {
    textBranden(wurzel as Text, marke)

    return
  }

  if (!(wurzel instanceof Element) || frei(wurzel)) {
    return
  }

  elementBranden(wurzel, marke)
  const gang = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)

  for (let node = gang.nextNode(); node; node = gang.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      textBranden(node as Text, marke)
    } else {
      elementBranden(node as Element, marke)
    }
  }
}

/** Keep the page branded while it changes. Returns the stop function. */
export function startMarkenwache(wurzel: HTMLElement = document.body): () => void {
  if (!BRANDING_ENABLED || typeof MutationObserver === 'undefined') {
    return () => undefined
  }

  markeAnwenden(wurzel)

  const beobachter = new MutationObserver(eintraege => {
    for (const eintrag of eintraege) {
      if (eintrag.type === 'characterData') {
        textBranden(eintrag.target as Text)
      } else if (eintrag.type === 'attributes') {
        elementBranden(eintrag.target as Element)
      } else {
        eintrag.addedNodes.forEach(node => markeAnwenden(node))
      }
    }
  })

  beobachter.observe(wurzel, {
    attributeFilter: ['placeholder', 'aria-label'],
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true
  })

  return () => beobachter.disconnect()
}
