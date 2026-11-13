// Cookie-consent auto-accept for the Browser area's `<webview>` guests.
//
// Tikki's browser should never make the family click "Alle akzeptieren" on
// every site. This module holds the rules; `preview-guest-preload-entry.ts`
// feeds it the guest's DOM. The rules are pure so they can be tested without
// a DOM: an element is described by its id/class attributes, its visible
// text and whether it is rendered.
//
// A wrong click is worse than a missed banner: the same button shape also
// confirms an OAuth grant, a newsletter opt-in or a contract. So both tiers
// fire only on evidence that names cookies or one consent manager:
//   1. Known consent managers (OneTrust, Cookiebot, Didomi, Quantcast, …)
//      by ids or classes only that product ships, plus selectors that say
//      "cookie" and "accept" themselves.
//   2. A generic "accept" button, but ONLY when its own text mentions
//      cookies or it sits inside a container that names cookies or a consent
//      manager. "consent", "cmp-…", "datenschutz" or "banner" alone describe
//      plenty of dialogs that are not cookie banners; a bare "OK" on a
//      normal page is never touched.
//
// Clicks are capped per origin and tab (the entry keeps the count in
// sessionStorage), so neither a banner that refuses to go away nor an accept
// link that reloads the page can turn into a click or reload storm.
//
// The preload is shared with Hermes' agent preview (dev servers, Streamlit,
// local HTML), which has no cookie banners but may well render a
// `class="banner"` with an "OK" link. `consentAllowedFor(url)` keeps the
// auto-click off this machine's and the home network's pages altogether.

export interface ConsentElement {
  /** `id`, `class`, `data-*` attributes joined, lowercase. */
  attrs: string
  /** Trimmed visible text, lowercase. */
  text: string
  /** True when the element has layout (rendered, not display:none). */
  visible: boolean
  /** Attribute soup of the nearest ancestors, see `ancestorAttrsOf`. */
  ancestorAttrs: string
  click(): void
}

/**
 * Selectors that identify an accept button without looking at its text:
 * either an id/class only one consent manager ships, or a selector that names
 * both cookies and accepting. Anything a login, OAuth or newsletter form could
 * plausibly carry (`.consent-accept`, `[data-action="accept-all"]`,
 * `.message-button.primary`) belongs to the generic tier, where the text and
 * the container are checked.
 */
export const KNOWN_CONSENT_SELECTORS: readonly string[] = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#didomi-notice-agree-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '#sp-cc-accept',
  '#truste-consent-button',
  '#axeptio_btn_acceptAll',
  '#cmpwelcomebtnyes',
  '#cmpbntyestxt',
  '.cmpboxbtnyes',
  '.fc-cta-consent',
  '.cc-btn.cc-allow',
  '#bnp_btn_accept',
  '#L2AGLb',
  'button[data-cookiebanner="accept_button"]',
  '[data-testid="uc-accept-all-button"]',
  '#uc-btn-accept-banner',
  '.sp_choice_type_11',
  '.js-accept-cookies',
  '#cookie-accept',
  '#cookies-accept',
  '#acceptAllCookies',
  '#accept-all-cookies',
  '[data-testid="cookie-policy-manage-dialog-accept-button"]',
  '.cookie-consent-accept',
  '.cookie-accept',
  '.cookie-banner__accept'
]

/** Text a generic accept button may carry (German first, then English). */
export const ACCEPT_TEXT =
  /^(?:alle(?:s)? (?:cookies )?(?:akzeptieren|zulassen|erlauben|annehmen)|akzeptieren|zustimmen|einverstanden|verstanden|ich stimme zu|alle auswählen(?: und weiter)?|weiter mit allen|ja, ich stimme zu|accept(?: all)?(?: cookies)?|allow all(?: cookies)?|allow cookies|i (?:agree|accept)|agree(?: and close)?|got it|ok(?:ay)?|yes, i agree|accept & continue|accept and continue|consent|tout accepter|accepter|aceptar(?: todo)?|accetta(?: tutto)?|alles accepteren|accepteren)$/i

/**
 * A container is a cookie dialog when its attributes name cookies or one
 * consent manager. The two short vendor names are matched as whole names:
 * `truste-consent-track` is TrustArc but `trusted-shops` is not, and a bare
 * `cmp` id is a consent platform while Adobe AEM prefixes every component
 * class with `cmp-`.
 */
export const CONSENT_CONTAINER =
  /cookie|didomi|onetrust|usercentrics|sourcepoint|sp_message|quantcast|qc-cmp|cmpbox|trustarc|truste(?![a-z])|cc-window|(?:^|[\s=])cmp(?![\w-])/

/** Do these attributes, or the button's own text, say "cookie dialog"? */
export function looksLikeConsentContainer(attrs: string, text = ''): boolean {
  return CONSENT_CONTAINER.test(attrs) || text.includes('cookie')
}

/** How many ancestors may vouch for a button. */
export const MAX_ANCESTOR_DEPTH = 12

/**
 * Pure: the attribute soup of a button's ancestors, nearest first. `<body>`
 * and `<html>` describe the whole page, never a dialog (Modernizr puts a
 * `cookies` feature class on `<html>`), so the walk ends below them.
 */
export function ancestorAttrsOf(chain: readonly { tag: string; attrs: string }[]): string {
  const parts: string[] = []

  for (const node of chain.slice(0, MAX_ANCESTOR_DEPTH)) {
    if (/^(?:body|html)$/i.test(node.tag)) {
      break
    }

    parts.push(node.attrs)
  }

  return parts.join(' ')
}

/** Names that resolve only on this machine or inside the home network. */
const LOCAL_NAME = /^(?:localhost|.+\.(?:localhost|local|lan|internal|home\.arpa|test))$/

function isPrivateIpv4(host: string): boolean {
  const octets = host.split('.').map(Number)

  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false
  }

  const [a, b] = octets

  return (
    a === 0 || // "this network", 0.0.0.0
    a === 10 || // RFC 1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // RFC 6598 shared space (Tailscale, CGNAT)
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // RFC 1918
    (a === 192 && b === 168) // RFC 1918
  )
}

function isPrivateIpv6(host: string): boolean {
  // The URL parser hands IPv6 back compressed and lowercase.
  if (host === '::' || host === '::1') {
    return true
  }

  // IPv4-mapped (`::ffff:c0a8:114`): judge the embedded address.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host)

  if (mapped) {
    const high = parseInt(mapped[1], 16)
    const low = parseInt(mapped[2], 16)

    return isPrivateIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'))
  }

  // fc00::/7 unique local, fe80::/10 link-local.
  return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)
}

/**
 * Pure: is this URL hostname this machine or the home network? Loopback,
 * private and link-local address ranges, special-use names, and single-label
 * names (`macstudio`, `raspberrypi`), which only a local resolver answers.
 */
export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase()

  if (!host) {
    return true
  }

  if (host.includes(':')) {
    return isPrivateIpv6(host)
  }

  return !host.includes('.') || LOCAL_NAME.test(host) || isPrivateIpv4(host)
}

/**
 * Pure: may the auto-accept run on this page? Only on http(s) pages of public
 * hosts. `file:` pages, this machine and the home network are the agent
 * preview's and the family's own pages: nothing there is a cookie banner, and
 * a clicked `<a>` would navigate the guest.
 */
export function consentAllowedFor(url: string): boolean {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  return !isLocalNetworkHost(parsed.hostname)
}

/** Never click these even inside a consent dialog. */
const REJECT_TEXT =
  /ablehnen|einstellungen|verwalten|anpassen|auswahl|mehr|reject|decline|settings|manage|customi[sz]e|options|preferences|choices|learn more|more info|necessary only|nur notwendige|nur erforderliche|später/i

/** Clicks one origin gets per tab, across reloads. */
export const MAX_CONSENT_CLICKS = 4

/** Pick the accept button among generic candidates, or null. */
export function pickGenericAccept(candidates: ConsentElement[]): ConsentElement | null {
  for (const el of candidates) {
    if (!el.visible || !el.text || el.text.length > 60) {
      continue
    }
    if (REJECT_TEXT.test(el.text) && !/^(?:alle|all)/i.test(el.text)) {
      continue
    }
    if (!ACCEPT_TEXT.test(el.text.replace(/\s+/g, ' '))) {
      continue
    }
    if (!looksLikeConsentContainer(el.ancestorAttrs, el.text) && !looksLikeConsentContainer(el.attrs, el.text)) {
      continue
    }

    return el
  }

  return null
}

export interface ConsentHost {
  /** Elements matching one selector across the document and open shadow roots. */
  query(selector: string): ConsentElement[]
  /** All `button`, `[role=button]`, `input[type=submit|button]`, `a` elements. */
  buttons(): ConsentElement[]
  /** Called once with a callback to run on DOM mutations (debounced by caller). */
  onMutate(callback: () => void): void
  /** Timer primitive so tests can run synchronously. */
  schedule(callback: () => void, delayMs: number): void
  /**
   * Clicks this origin already spent in this tab, and where to record the
   * next one. The count outlives the page, so an accept link that reloads the
   * page finds its budget used up instead of a fresh one. A host without such
   * a store gets the budget per page load.
   */
  readClicks?(): number
  writeClicks?(count: number): void
  log?(message: string): void
}

interface ConsentTarget {
  element: ConsentElement
  kind: 'known' | 'generic'
  label: string
}

/** The first known or generic accept button on the page, without clicking it. */
function findAccept(host: ConsentHost): ConsentTarget | null {
  for (const selector of KNOWN_CONSENT_SELECTORS) {
    const hit = host.query(selector).find(el => el.visible)

    if (hit) {
      return { element: hit, kind: 'known', label: selector }
    }
  }

  const generic = pickGenericAccept(host.buttons())

  return generic ? { element: generic, kind: 'generic', label: `"${generic.text}"` } : null
}

/** One pass: click the first known or generic accept button. Returns what was clicked. */
export function acceptOnce(host: ConsentHost, beforeClick?: () => void): 'known' | 'generic' | null {
  const target = findAccept(host)

  if (!target) {
    return null
  }

  beforeClick?.()
  target.element.click()
  host.log?.(`consent: clicked ${target.kind} ${target.label}`)

  return target.kind
}

/**
 * Install the auto-accept loop: try now, again shortly after load (banners
 * mount late), and on DOM mutations (debounced), until the origin's click
 * budget is spent or the page has been quiet for a while. A spent budget
 * installs nothing at all.
 */
export function installCookieConsentAutoAccept(host: ConsentHost, options: { quietAfterMs?: number } = {}): void {
  const quietAfterMs = options.quietAfterMs ?? 45_000
  const startedAt = Date.now()
  let clicks = host.readClicks?.() ?? 0
  let pending = false
  let stopped = false

  if (clicks >= MAX_CONSENT_CLICKS) {
    return
  }

  const attempt = () => {
    pending = false

    if (stopped) {
      return
    }

    // Counted before the click lands: the click itself may unload the page.
    acceptOnce(host, () => {
      clicks += 1
      host.writeClicks?.(clicks)
    })

    if (clicks >= MAX_CONSENT_CLICKS || Date.now() - startedAt > quietAfterMs) {
      stopped = true
    }
  }

  attempt()
  host.schedule(attempt, 800)
  host.schedule(attempt, 2500)
  host.onMutate(() => {
    if (pending || stopped) {
      return
    }

    pending = true
    host.schedule(attempt, 300)
  })
}
