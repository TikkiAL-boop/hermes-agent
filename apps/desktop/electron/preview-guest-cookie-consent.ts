// Cookie-consent auto-accept for the Browser area's `<webview>` guests.
//
// Tikki's browser should never make the family click "Alle akzeptieren" on
// every site. This module holds the rules; `preview-guest-preload-entry.ts`
// feeds it the guest's DOM. The rules are pure so they can be tested without
// a DOM: an element is described by its id/class attributes, its visible
// text and whether it is rendered.
//
// Two tiers:
//   1. Known consent managers (OneTrust, Cookiebot, Didomi, Quantcast, …)
//      by their stable button ids or classes. These are unambiguous.
//   2. A generic "accept" button, but ONLY when it sits inside a container
//      whose id/class smells like a cookie/consent/GDPR dialog. A bare
//      "OK" on a normal page is never touched.
//
// Clicks are capped per page so a banner that refuses to go away cannot
// turn into a click storm.
//
// The preload is shared with Hermes' agent preview (dev servers, Streamlit,
// local HTML), which has no cookie banners but may well render a
// `class="banner"` with an "OK" link. `consentAllowedFor(url)` keeps the
// auto-click off local and file pages altogether.

export interface ConsentElement {
  /** `id`, `class`, `data-*` attributes joined, lowercase. */
  attrs: string
  /** Trimmed visible text, lowercase. */
  text: string
  /** True when the element has layout (rendered, not display:none). */
  visible: boolean
  /** Attribute soup of the nearest ancestors (up to the dialog root). */
  ancestorAttrs: string
  click(): void
}

/** Stable selectors of well-known consent managers, most common first. */
export const KNOWN_CONSENT_SELECTORS: readonly string[] = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#didomi-notice-agree-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '#sp-cc-accept',
  '#truste-consent-button',
  '#accept-choices',
  '#axeptio_btn_acceptAll',
  '#consent_prompt_submit',
  '#cmpwelcomebtnyes',
  '#cmpbntyestxt',
  '.fc-cta-consent',
  '.cc-btn.cc-allow',
  '.cc-allow',
  '.js-accept-cookies',
  '#cookie-accept',
  '#cookies-accept',
  '#acceptAllCookies',
  '#accept-all-cookies',
  '#bnp_btn_accept',
  '#L2AGLb',
  'button[data-cookiebanner="accept_button"]',
  '[data-testid="uc-accept-all-button"]',
  '[data-testid="cookie-policy-manage-dialog-accept-button"]',
  '[data-testid="GDPR-accept"]',
  '[data-action="accept-all"]',
  '[data-cc-action="accept"]',
  '.sp_choice_type_11',
  '.message-button.primary',
  '#gdpr-consent-accept',
  '#consent-accept',
  '.consent-accept',
  '.cookie-consent-accept',
  '.cookie-accept',
  '.cookie-banner__accept',
  '#uc-btn-accept-banner',
  '.cmp-accept',
  '.cmpboxbtnyes'
]

/** Text a generic accept button may carry (German first, then English). */
export const ACCEPT_TEXT =
  /^(?:alle(?:s)? (?:cookies )?(?:akzeptieren|zulassen|erlauben|annehmen)|akzeptieren|zustimmen|einverstanden|verstanden|ich stimme zu|alle auswählen(?: und weiter)?|weiter mit allen|ja, ich stimme zu|accept(?: all)?(?: cookies)?|allow all(?: cookies)?|allow cookies|i (?:agree|accept)|agree(?: and close)?|got it|ok(?:ay)?|yes, i agree|accept & continue|accept and continue|consent|tout accepter|accepter|aceptar(?: todo)?|accetta(?: tutto)?|alles accepteren|accepteren)$/i

/** A container looks like a consent dialog when its attributes say so. */
export const CONSENT_CONTAINER =
  /cookie|consent|cmp|gdpr|datenschutz|didomi|onetrust|usercentrics|sourcepoint|quantcast|cookiebot|truste|trustarc|cc-window/

/**
 * Weak words: a page's own `class="banner"` or a privacy footer is not a
 * dialog. They count only when cookie/consent appears beside them, in the
 * attributes or in the button's text.
 */
const WEAK_CONTAINER = /banner|privacy|tracking/
const WEAK_CONTEXT = /cookie|consent/

/** Do these attributes (plus the button's text) describe a consent dialog? */
export function looksLikeConsentContainer(attrs: string, text = ''): boolean {
  if (CONSENT_CONTAINER.test(attrs)) {
    return true
  }

  return WEAK_CONTAINER.test(attrs) && WEAK_CONTEXT.test(text)
}

/** Hosts that are this machine (or the home network): never a site with a cookie banner. */
const LOCAL_HOST = /^(?:localhost|0\.0\.0\.0|127(?:\.\d{1,3}){3}|::1|.+\.local)$/i

/**
 * Pure: may the auto-accept run on this page? Only on http(s) pages of
 * non-local hosts. `file:`, localhost, 127.0.0.0/8, ::1, 0.0.0.0 and `*.local`
 * are the agent preview's and the family's own pages: nothing there is a
 * cookie banner, and a clicked `<a>` would navigate the guest.
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

  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')

  return host.length > 0 && !LOCAL_HOST.test(host)
}

/** Never click these even inside a consent dialog. */
const REJECT_TEXT =
  /ablehnen|einstellungen|verwalten|anpassen|auswahl|mehr|reject|decline|settings|manage|customi[sz]e|options|preferences|choices|learn more|more info|necessary only|nur notwendige|nur erforderliche|später/i

export const MAX_CLICKS_PER_PAGE = 4

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
  log?(message: string): void
}

/** One pass: click the first known or generic accept button. Returns what was clicked. */
export function acceptOnce(host: ConsentHost): 'known' | 'generic' | null {
  for (const selector of KNOWN_CONSENT_SELECTORS) {
    const hit = host.query(selector).find(el => el.visible)

    if (hit) {
      hit.click()
      host.log?.(`consent: clicked known ${selector}`)

      return 'known'
    }
  }

  const generic = pickGenericAccept(host.buttons())

  if (generic) {
    generic.click()
    host.log?.(`consent: clicked generic "${generic.text}"`)

    return 'generic'
  }

  return null
}

/**
 * Install the auto-accept loop: try now, again shortly after load (banners
 * mount late), and on DOM mutations (debounced), until the per-page click
 * budget is spent or the page has been quiet for a while.
 */
export function installCookieConsentAutoAccept(host: ConsentHost, options: { quietAfterMs?: number } = {}): void {
  const quietAfterMs = options.quietAfterMs ?? 45_000
  const startedAt = Date.now()
  let clicks = 0
  let pending = false
  let stopped = false

  const attempt = () => {
    pending = false

    if (stopped) {
      return
    }

    if (acceptOnce(host)) {
      clicks += 1
    }

    if (clicks >= MAX_CLICKS_PER_PAGE || Date.now() - startedAt > quietAfterMs) {
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
