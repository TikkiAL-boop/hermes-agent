// A mail's HTML is a stranger's document. It is shown in a frame of its own —
// never inside the app's document, where its styles could paint over the app
// and its links would resolve against the app's own URL. Three layers, each
// enough for what it guards:
//
//   - the frame is sandboxed without scripts, forms, popups or top navigation;
//   - its document carries its own CSP: nothing is fetched (no remote image
//     tells the sender the mail was opened), only inline styles apply;
//   - the markup is sanitised first: no active elements, links only to the web
//     or a mail address, and no reference to anything outside the mail.
//
// A link does not navigate. The reader hands it to the OS through the audited
// `hermes:openExternal` route (`mailLinkZiel` says which ones).

import DOMPurify from 'dompurify'

const CSP = "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'"

/** Without scripts the origin is inert; the reader needs it to hear a click on a link. */
export const MAIL_SANDBOX = 'allow-same-origin'

const WEB_ODER_MAIL = /^(?:https?:\/\/|mailto:)/i

/**
 * Where a link in a mail may lead: the web or a mail address, written out in
 * full. Everything else — relative paths (they would resolve against the app),
 * `file:`, `javascript:`, app schemes — leads nowhere.
 */
export function mailLinkZiel(href: null | string | undefined): null | string {
  const roh = (href ?? '').trim()

  if (!WEB_ODER_MAIL.test(roh)) {
    return null
  }

  try {
    return new URL(roh).href
  } catch {
    return null
  }
}

/** Attributes that make the reader's machine fetch something. */
const LADENDE_ATTRIBUTE = ['src', 'srcset', 'background', 'poster'] as const

const IN_DER_MAIL = /^(?:data:image\/|cid:)/i

export interface MailDokument {
  /** The whole document for the frame's `srcdoc`. */
  dokument: string
  /** The mail pointed at pictures outside itself; they are not loaded. */
  bilderBlockiert: boolean
}

const RAHMEN_STIL =
  'html{color-scheme:light}body{margin:16px;background:#fff;color:#1a1a1a;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#0b57d0}'

/** The mail's HTML as a document that is safe to put into the sandboxed frame. */
export function mailDokument(html: string): MailDokument {
  // An instance of its own: hooks are per instance, and the app's other sanitisers keep theirs.
  const purify = DOMPurify(window)
  let bilderBlockiert = false

  purify.addHook('afterSanitizeAttributes', node => {
    if (!(node instanceof Element)) {
      return
    }

    if (node.hasAttribute('href')) {
      const ziel = mailLinkZiel(node.getAttribute('href'))

      if (ziel) {
        node.setAttribute('href', ziel)
        // No popups in the frame: a click the reader does not catch opens nothing at all.
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      } else {
        node.removeAttribute('href')
      }
    }

    for (const name of LADENDE_ATTRIBUTE) {
      const wert = node.getAttribute(name)

      if (wert !== null && !(name === 'src' && IN_DER_MAIL.test(wert.trim()))) {
        node.removeAttribute(name)
        bilderBlockiert = true
      }
    }
  })

  const inhalt = purify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'base', 'link', 'meta'],
    USE_PROFILES: { html: true }
  })

  return {
    bilderBlockiert,
    dokument: `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${RAHMEN_STIL}</style></head><body>${inhalt}</body></html>`
  }
}

/**
 * A click inside the frame. A link never navigates the frame; one that leads
 * to the web or a mail address is returned for the OS to open.
 */
export function mailKlickZiel(event: Event): null | string {
  const ziel = event.target as Element | null
  const link = ziel?.closest?.('a[href], area[href]')

  if (!link) {
    return null
  }

  event.preventDefault()

  return mailLinkZiel(link.getAttribute('href'))
}
