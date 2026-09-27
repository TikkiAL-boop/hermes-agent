import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  acceptOnce,
  type ConsentElement,
  type ConsentHost,
  installCookieConsentAutoAccept,
  MAX_CLICKS_PER_PAGE,
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

  test('hidden buttons, reject/settings buttons and long labels are skipped', () => {
    const list = [
      el({ ancestorAttrs: 'consent', text: 'Accept all', visible: false }),
      el({ ancestorAttrs: 'consent', text: 'Manage settings' }),
      el({ ancestorAttrs: 'consent', text: 'Nur notwendige Cookies' }),
      el({ ancestorAttrs: 'consent', text: 'accept all cookies and also everything else on this fine website today' })
    ]

    assert.equal(pickGenericAccept(list), null)
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
    const h = host({}, [el({ ancestorAttrs: 'div.gdpr-modal', text: 'Zustimmen' }, clicked)])

    assert.equal(acceptOnce(h), 'generic')
    assert.deepEqual(clicked, ['zustimmen'])
  })

  test('returns null when nothing matches', () => {
    assert.equal(acceptOnce(host({}, [])), null)
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
    assert.equal(clicked.length, MAX_CLICKS_PER_PAGE)

    // Budget spent: further mutations do nothing.
    h.mutate()
    assert.equal(h.timers.length, 0)
    assert.equal(clicked.length, MAX_CLICKS_PER_PAGE)
  })
})
