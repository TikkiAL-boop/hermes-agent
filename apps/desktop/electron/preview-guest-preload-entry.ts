// Preload for the preview pane's `<webview>` guests. main.ts installs this
// file via `will-attach-webview` on the `persist:hermes-preview` partition
// only (see `installPreviewGuestPreload`), so no other webview inherits it.
//
// The guest runs with contextIsolation, so this preload shares the guest's
// DOM but never its JavaScript world. A preview page's `target="_blank"`
// anchors (Streamlit traceback's "Ask Google" / "Ask …" buttons —
// #112941) are intercepted here in the DOM's capture phase and handed to the
// host renderer via `sendToHost`; the host admits the scheme and routes the
// URL through the audited `hermes:openExternal` channel. A guest URL never
// becomes an Electron popup and this side never opens anything by itself.
//
// Deliberate scope: only trusted anchor clicks are forwarded. A page's direct
// `window.open` calls stay blocked (the webview has no `allowpopups`): hooking
// them would mean reaching into the guest's JS world, and this preload exposes
// nothing there.
//
// Tikki adds one more job to this preload: the Browser area accepts cookie
// banners on its own (preview-guest-cookie-consent.ts). That, too, is DOM
// only — it clicks buttons the page rendered, and nothing else. The same
// webview also shows Hermes' agent preview (dev servers, local files), so the
// auto-click is gated on the page's URL: never on local or `file:` pages.

import { consentAllowedFor, type ConsentElement, installCookieConsentAutoAccept } from './preview-guest-cookie-consent'
import { installGuestExternalHandoff } from './preview-guest-preload'

const electron = require('electron') as {
  ipcRenderer: { sendToHost(channel: string, ...args: unknown[]): void }
}

installGuestExternalHandoff({
  addEventListener: (type, listener, capture) => document.addEventListener(type, listener, capture),
  sendToHost: (channel, ...args) => electron.ipcRenderer.sendToHost(channel, ...args)
})

// ── cookie consent ─────────────────────────────────────────────────────────

const ATTR_NAMES = ['id', 'class', 'name', 'aria-label', 'data-testid', 'data-action', 'role']

function attrSoup(node: Element): string {
  const parts: string[] = []

  for (const name of ATTR_NAMES) {
    const value = node.getAttribute(name)

    if (value) {
      parts.push(`${name}=${value}`)
    }
  }

  return parts.join(' ').toLowerCase()
}

function ancestorSoup(node: Element): string {
  const parts: string[] = []
  let current: Node | null = node.parentNode
  let depth = 0

  while (current && depth < 12) {
    if (current instanceof ShadowRoot) {
      current = current.host
      continue
    }

    if (current instanceof Element) {
      parts.push(attrSoup(current))
    }

    current = current.parentNode
    depth += 1
  }

  return parts.join(' ')
}

function describe(node: Element): ConsentElement {
  return {
    ancestorAttrs: ancestorSoup(node),
    attrs: attrSoup(node),
    click: () => (node as HTMLElement).click?.(),
    text: (node.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase(),
    visible: node.getClientRects().length > 0
  }
}

/** querySelectorAll across the document and every open shadow root. */
function deepQuery(selector: string): Element[] {
  const out: Element[] = []
  const walk = (root: Document | ShadowRoot) => {
    let found: NodeListOf<Element>

    try {
      found = root.querySelectorAll(selector)
    } catch {
      return
    }

    out.push(...found)

    for (const child of root.querySelectorAll('*')) {
      if (child.shadowRoot) {
        walk(child.shadowRoot)
      }
    }
  }

  walk(document)

  return out
}

function startConsent() {
  installCookieConsentAutoAccept({
    buttons: () => deepQuery('button, [role="button"], input[type="submit"], input[type="button"], a').map(describe),
    onMutate: callback => {
      const observer = new MutationObserver(() => callback())
      observer.observe(document.documentElement, { childList: true, subtree: true })
    },
    query: selector => deepQuery(selector).map(describe),
    schedule: (callback, delayMs) => window.setTimeout(callback, delayMs)
  })
}

if (consentAllowedFor(location.href)) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startConsent, { once: true })
  } else {
    startConsent()
  }
}
