// Where an app window may navigate by itself.
//
// Every app window shows exactly one document: the renderer entry (the dev
// server in dev, the packaged index.html otherwise), with a `?win=…` query
// that selects the window's role and a HashRouter route behind `#`. Route
// changes are in-page and never reach `will-navigate`. What does reach it:
//
//   - `location.reload()` (error boundary, command palette, install overlay):
//     the same document again;
//   - the "Reload" button of the renderer-load-error page, a `data:` URL that
//     replaces itself with the renderer entry;
//   - a link or form that renderer-side content managed to place in the
//     window (mail HTML, markdown): everything else.
//
// The third kind must never move the window. `file:` used to be allowed
// wholesale in packaged builds, so a relative link in a mail resolved against
// `file://…/index.html` could load any local HTML file with the preload
// bridge attached, or reopen the app as another window role (`?win=hud`).

export type AppNavigationVerdict = 'allow' | 'deny' | 'external'

export interface AppNavigationContext {
  /** What the window shows right now (`webContents.getURL()`). */
  currentUrl: string
  /** Every URL the renderer entry can be loaded from; the first is the default. */
  entryUrls: readonly string[]
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * A URL path with its percent-escapes resolved. Node (`pathToFileURL`) and
 * Chromium do not escape the same characters, so the same file can arrive in
 * two spellings; a malformed escape is compared as written.
 */
function plainPath(url: URL): string {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return url.pathname
  }
}

/** Same document, whatever the hash: scheme, host, path and query all agree. */
const sameDocument = (a: URL, b: URL) =>
  a.protocol === b.protocol && a.host === b.host && plainPath(a) === plainPath(b) && a.search === b.search

/**
 * Does this URL belong to the app itself? A dev server owns its whole origin;
 * a packaged app owns one file, not the filesystem around it.
 */
function isAppUrl(url: URL, entries: readonly URL[]): boolean {
  return entries.some(
    entry =>
      url.protocol === entry.protocol &&
      url.host === entry.host &&
      (entry.protocol !== 'file:' || plainPath(url) === plainPath(entry))
  )
}

/**
 * Pure: what to do with a navigation the page itself started.
 *
 *   - 'allow'    — the window's own document again (a reload), or the renderer
 *                  entry replacing a non-app page (error-page recovery);
 *   - 'deny'     — an app URL that would turn the window into something else
 *                  (another window role, another path on the dev server);
 *   - 'external' — not ours: hand it to the audited external-open route,
 *                  which opens web URLs in the OS browser and only ever
 *                  reveals `file:` targets in the file manager.
 */
export function classifyAppNavigation(targetUrl: string, context: AppNavigationContext): AppNavigationVerdict {
  const target = parse(targetUrl)
  const current = parse(context.currentUrl)

  // A reload changes nothing about what the window shows.
  if (target && current && sameDocument(target, current)) {
    return 'allow'
  }

  const entries = context.entryUrls.map(parse).filter((entry): entry is URL => entry !== null)

  if (!target || !isAppUrl(target, entries)) {
    return 'external'
  }

  if (current && isAppUrl(current, entries)) {
    return 'deny'
  }

  return entries.some(entry => sameDocument(target, entry)) ? 'allow' : 'deny'
}
