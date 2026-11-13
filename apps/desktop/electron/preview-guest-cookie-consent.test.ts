import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  acceptOnce,
  ancestorAttrsOf,
  consentAllowedFor,
  type ConsentElement,
  type ConsentHost,
  installCookieConsentAutoAccept,
  MAX_CONSENT_CLICKS,
  pickGenericAccept
} from './preview-guest-cookie-consent'

function el(partial: Partial<ConsentElement> & { text?: string }, clicked: string[] = []): ConsentElement {
  const text = (partial.text ?? '').toLowerCase()

  return {
    ancestorAttrs: '',
    attrs: '',
    click: () => clicked.push(text || partial.attrs || '?'),
    visible: true,
    ...partial,
    text
  }
}

function host(
  known: Record<string, ConsentElement[]>,
  buttons: ConsentElement[]
): ConsentHost & { timers: (() => void)[]; mutate: () => void } {
  const timers: (() => void)[] = []
  let mutate = () => {}

  return {
    buttons: () => buttons,
    get mutate() {
      return mutate
    },
    onMutate: cb => {
      mutate = cb
    },
    query: selector => known[selector] ?? [],
    schedule: cb => timers.push(cb),
    timers
  }
}

describe('pickGenericAccept', () => {
  test('accepts a German "Alle akzeptieren" inside a cookie container', () => {
    const clicked: string[] = []
    const pick = pickGenericAccept([
      el({ ancestorAttrs: 'div#cookie-banner', text: 'Ablehnen' }, clicked),
      el({ ancestorAttrs: 'div#cookie-banner', text: 'Alle akzeptieren' }, clicked)
    ])

    assert.equal(pick?.text, 'alle akzeptieren')
  })

  test('a bare "OK" outside any consent container is never clicked', () => {
    assert.equal(pickGenericAccept([el({ ancestorAttrs: 'form.login', text: 'OK' })]), null)
  })

  test('a page\'s own class="banner" with an OK link is not a consent dialog', () => {
    // The agent preview (dev server, Streamlit, local HTML) renders banners of
    // its own; an `<a>` clicked there navigates the guest. "banner", "privacy"
    // and "tracking" say nothing about cookies.
    const clicked: string[] = []
    const list = [
      el({ ancestorAttrs: 'class=banner', text: 'OK' }, clicked),
      el({ ancestorAttrs: 'id=privacy-footer', text: 'Accept' }, clicked),
      el({ attrs: 'class=tracking-toggle', text: 'Verstanden' }, clicked)
    ]

    assert.equal(pickGenericAccept(list), null)
    assert.deepEqual(clicked, [])

    // ...while a button that names cookies itself qualifies anywhere.
    const pick = pickGenericAccept([el({ ancestorAttrs: 'class=banner', text: 'Accept cookies' }, clicked)])
    assert.equal(pick?.text, 'accept cookies')
  })

  test('hidden buttons, reject/settings buttons and long labels are skipped', () => {
    const list = [
      el({ ancestorAttrs: 'id=cookie-consent', text: 'Accept all', visible: false }),
      el({ ancestorAttrs: 'id=cookie-consent', text: 'Manage settings' }),
      el({ ancestorAttrs: 'id=cookie-consent', text: 'Nur notwendige Cookies' }),
      el({
        ancestorAttrs: 'id=cookie-consent',
        text: 'accept all cookies and also everything else on this fine website today'
      })
    ]

    assert.equal(pickGenericAccept(list), null)
  })

  test('page-level classes on <body>/<html> never turn the whole page into a cookie dialog', () => {
    // Modernizr marks `<html class="js cookies">`; a login button twelve levels
    // below it is still a login button.
    const ancestorAttrs = ancestorAttrsOf([
      { attrs: 'class=login-form', tag: 'FORM' },
      { attrs: 'class=has-cookie-notice', tag: 'BODY' },
      { attrs: 'class=js cookies', tag: 'HTML' }
    ])

    assert.equal(pickGenericAccept([el({ ancestorAttrs, text: 'OK' })]), null)

    // ...while a real dialog between the button and <body> still vouches for it.
    const inDialog = ancestorAttrsOf([
      { attrs: 'id=cookie-notice', tag: 'DIV' },
      { attrs: '', tag: 'BODY' }
    ])

    assert.equal(pickGenericAccept([el({ ancestorAttrs: inDialog, text: 'OK' })])?.text, 'ok')
  })
})

describe('consentAllowedFor', () => {
  test('runs on web sites only, never on local or file pages', () => {
    for (const url of ['https://www.spiegel.de/', 'http://example.org:8080/x', 'https://tikki.team/post']) {
      assert.equal(consentAllowedFor(url), true, url)
    }

    for (const url of [
      'file:///Users/karin/index.html',
      'http://localhost:8501/',
      'http://127.0.0.1:5173/app',
      'http://127.1.2.3/',
      'http://[::1]:3000/',
      'http://0.0.0.0:8000/',
      'http://pi.local/',
      'about:blank',
      'not a url'
    ]) {
      assert.equal(consentAllowedFor(url), false, url)
    }
  })

  test('the home network is local too: private ranges, link-local, bare names', () => {
    // The agent preview opens dev servers by LAN address or machine name as
    // often as by localhost. One URL per address class.
    const home = {
      'RFC 1918 10/8': 'http://10.0.0.5:8501/',
      'RFC 1918 172.16/12': 'http://172.20.1.9:3000/',
      'RFC 1918 192.168/16': 'http://192.168.1.20:5173/',
      'link-local 169.254/16': 'http://169.254.10.1/',
      'shared space 100.64/10': 'http://100.101.102.103:8080/',
      'IPv6 unique local fc00::/7': 'http://[fd12:3456:789a::1]:3000/',
      'IPv6 link-local fe80::/10': 'http://[fe80::1c2d:3e4f:5a6b:7c8d]/',
      'IPv4-mapped IPv6': 'http://[::ffff:192.168.1.20]/',
      'single-label name': 'http://macstudio:3000/',
      '*.localhost': 'http://app.localhost:3000/',
      'home.arpa': 'http://nas.home.arpa/'
    }

    for (const [kind, url] of Object.entries(home)) {
      assert.equal(consentAllowedFor(url), false, `${kind}: ${url}`)
    }

    // Public neighbours of those ranges stay web sites.
    for (const url of [
      'http://172.32.0.1/',
      'http://192.169.1.1/',
      'http://100.128.0.1/',
      'http://11.0.0.1/',
      'http://[2a00:1450:4001:81b::200e]/',
      'https://local.example.org/'
    ]) {
      assert.equal(consentAllowedFor(url), true, url)
    }
  })
})

describe('acceptOnce', () => {
  test('a known consent manager wins over generic text matching', () => {
    const clicked: string[] = []
    const h = host({ '#onetrust-accept-btn-handler': [el({ attrs: 'id=onetrust-accept-btn-handler' }, clicked)] }, [
      el({ ancestorAttrs: 'cookie', text: 'Accept' }, clicked)
    ])

    assert.equal(acceptOnce(h), 'known')
    assert.deepEqual(clicked, ['id=onetrust-accept-btn-handler'])
  })

  test('falls back to a generic accept button', () => {
    const clicked: string[] = []
    const h = host({}, [el({ ancestorAttrs: 'class=cookie-modal', text: 'Zustimmen' }, clicked)])

    assert.equal(acceptOnce(h), 'generic')
    assert.deepEqual(clicked, ['zustimmen'])
  })

  test('returns null when nothing matches', () => {
    assert.equal(acceptOnce(host({}, [])), null)
  })

  test('consent dialogs that are not cookie banners are never clicked', () => {
    // Each page renders one accept-shaped button, reachable both by a selector
    // a consent form could carry and by its text. None of them names cookies
    // or a consent manager, so nobody may press it for the user.
    const pages: Record<string, { selector: string; button: Partial<ConsentElement> }> = {
      'OAuth grant': {
        button: { ancestorAttrs: 'id=consent-form', attrs: 'class=consent-accept', text: 'Zustimmen' },
        selector: '.consent-accept'
      },
      'Adobe AEM component': {
        button: { ancestorAttrs: 'class=cmp-container cmp-teaser', attrs: 'class=cmp-accept cmp-button', text: 'OK' },
        selector: '.cmp-accept'
      },
      'shop trust badge': {
        button: { ancestorAttrs: 'class=trusted-shops-layer', attrs: 'data-action=accept-all', text: 'Verstanden' },
        selector: '[data-action="accept-all"]'
      },
      'privacy consent form': {
        button: { ancestorAttrs: 'class=datenschutz-einwilligung', attrs: 'id=consent-accept', text: 'Ich stimme zu' },
        selector: '#consent-accept'
      },
      'newsletter opt-in': {
        button: { ancestorAttrs: 'class=gdpr-modal message', attrs: 'class=message-button primary', text: 'Accept' },
        selector: '.message-button.primary'
      }
    }

    for (const [name, page] of Object.entries(pages)) {
      const clicked: string[] = []
      const button = el(page.button, clicked)

      assert.equal(acceptOnce(host({ [page.selector]: [button] }, [button])), null, name)
      assert.deepEqual(clicked, [], name)
    }

    // The same vendor words as whole names are consent managers and still count.
    for (const ancestorAttrs of ['id=truste-consent-track', 'id=cmp class=overlay', 'class=qc-cmp2-container']) {
      const clicked: string[] = []

      assert.equal(acceptOnce(host({}, [el({ ancestorAttrs, text: 'Zustimmen' }, clicked)])), 'generic', ancestorAttrs)
      assert.deepEqual(clicked, ['zustimmen'], ancestorAttrs)
    }
  })
})

describe('installCookieConsentAutoAccept', () => {
  test('tries immediately, on the delayed passes and on mutations, capped per page', () => {
    const clicked: string[] = []
    const button = el({ ancestorAttrs: 'cookie', text: 'Accept all' }, clicked)
    const h = host({}, [button])

    installCookieConsentAutoAccept(h)
    assert.equal(clicked.length, 1, 'immediate pass')

    // Two delayed passes are scheduled at install time.
    assert.equal(h.timers.length, 2)
    h.timers.splice(0).forEach(cb => cb())
    assert.equal(clicked.length, 3)

    // A mutation schedules one more (debounced) pass.
    h.mutate()
    h.mutate()
    assert.equal(h.timers.length, 1, 'mutation passes are debounced')
    h.timers.splice(0).forEach(cb => cb())
    assert.equal(clicked.length, MAX_CONSENT_CLICKS)

    // Budget spent: further mutations do nothing.
    h.mutate()
    assert.equal(h.timers.length, 0)
    assert.equal(clicked.length, MAX_CONSENT_CLICKS)
  })

  test('an accept link that reloads the page runs out of budget instead of looping', () => {
    // The banner's accept control is an `<a href>`: every click loads the page
    // again and the banner is back. The tab's stored count is all that
    // survives a reload, so it has to end the loop.
    const clicked: string[] = []
    let stored = 0

    const loadPage = () => {
      const h = host({}, [el({ ancestorAttrs: 'id=cookie-banner', text: 'Accept all' }, clicked)])

      installCookieConsentAutoAccept({
        ...h,
        readClicks: () => stored,
        writeClicks: count => {
          stored = count
        }
      })

      return h
    }

    for (let reload = 0; reload < MAX_CONSENT_CLICKS * 3; reload++) {
      loadPage()
    }

    assert.equal(clicked.length, MAX_CONSENT_CLICKS)

    // A spent budget installs nothing: no timers, no mutation observer.
    const idle = loadPage()

    assert.equal(idle.timers.length, 0)
    idle.mutate()
    assert.equal(idle.timers.length, 0)
    assert.equal(clicked.length, MAX_CONSENT_CLICKS)
  })
})
