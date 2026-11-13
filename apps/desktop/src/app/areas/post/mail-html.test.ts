import { describe, expect, it } from 'vitest'

import { MAIL_SANDBOX, mailDokument, mailKlickZiel, mailLinkZiel } from './mail-html'

/** The frame's document as the browser would build it. */
const gelesen = (html: string) => {
  const { bilderBlockiert, dokument } = mailDokument(html)

  return { bilderBlockiert, seite: new DOMParser().parseFromString(dokument, 'text/html') }
}

const attribute = (seite: Document) =>
  [...seite.body.querySelectorAll('*')].flatMap(el =>
    [...el.attributes].map(a => ({ el, name: a.name, wert: a.value }))
  )

describe('mailDokument', () => {
  it('keeps what the mail says and drops everything that would run', () => {
    const { seite } = gelesen(
      '<p onclick="x()">Bitte <b>Milch</b><script>alert(1)</script></p><img src="x" onerror="alert(1)"><iframe src="https://evil.example"></iframe><form action="https://evil.example"><input name="pw"><button>ok</button></form><object data="x"></object><embed src="x">'
    )

    expect(seite.body.querySelector('b')!.textContent).toBe('Milch')
    expect(seite.querySelector('script, iframe, form, input, button, object, embed')).toBeNull()
    expect(attribute(seite).filter(a => a.name.startsWith('on'))).toEqual([])
  })

  it('lets the mail restyle nothing but its own elements', () => {
    const { seite } = gelesen(
      '<style>*{display:none}</style><link rel="stylesheet" href="https://evil.example/a.css"><p style="color:red">rot</p>'
    )

    expect(seite.body.querySelector('style, link')).toBeNull()
    // One sheet in the document: the frame's own.
    expect(seite.querySelectorAll('style').length).toBe(1)
    expect(seite.querySelector('link')).toBeNull()
    expect(seite.body.querySelector('p')!.getAttribute('style')).toContain('red')
  })

  it('fetches nothing: a picture outside the mail is not loaded, and the reader is told', () => {
    const { bilderBlockiert, seite } = gelesen(
      '<img src="https://tracker.example/p.gif?wer=thorsten"><img srcset="https://tracker.example/2x.png 2x"><table background="https://tracker.example/bg.png"><tr><td>x</td></tr></table><video poster="https://tracker.example/v.jpg"></video><img src="//tracker.example/p.gif"><img src="/lokal.png">'
    )

    expect(attribute(seite).filter(a => ['background', 'poster', 'src', 'srcset'].includes(a.name))).toEqual([])
    expect(bilderBlockiert).toBe(true)

    // And should the markup ever let one through, the document itself forbids the request.
    const csp = seite.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!

    expect(csp).toContain("default-src 'none'")
    expect(csp).not.toMatch(/https?:|\*|script-src|connect-src|frame-src/)
  })

  it('shows a picture the mail brought along, without a word about blocked ones', () => {
    const { bilderBlockiert, seite } = gelesen(
      '<img src="data:image/png;base64,iVBORw0KGgo="><img src="cid:logo@tikki.team">'
    )

    expect([...seite.body.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual([
      'data:image/png;base64,iVBORw0KGgo=',
      'cid:logo@tikki.team'
    ])
    expect(bilderBlockiert).toBe(false)
  })

  it.each([
    '/settings',
    '#/admin',
    'index.html?win=secondary',
    '//evil.example/x',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'hermes://open/settings',
    'data:text/html,<script>alert(1)</script>'
  ])('a link that is not a full web or mail address leads nowhere: %s', href => {
    const { seite } = gelesen(`<a href="${href}">hier klicken</a>`)
    const link = seite.body.querySelector('a')

    // The words stay; there is nothing behind them to follow into the app or the disk.
    expect(seite.body.textContent).toContain('hier klicken')
    expect(link?.hasAttribute('href') ?? false).toBe(false)
    expect(mailLinkZiel(href)).toBeNull()
  })

  it.each(['https://example.org/a?b=1', 'http://example.org/', 'mailto:karin@tikki.team'])(
    'a link to the web or a mail address stays, and never opens in the frame: %s',
    href => {
      const { seite } = gelesen(`<a href="${href}" target="_self">Link</a>`)
      const link = seite.body.querySelector('a')!

      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(mailLinkZiel(href)).toBe(href)
    }
  )

  it('is shown in a frame that runs no script, opens no window and cannot move the app', () => {
    const rechte = MAIL_SANDBOX.split(/\s+/)

    for (const recht of [
      'allow-scripts',
      'allow-popups',
      'allow-forms',
      'allow-top-navigation',
      'allow-top-navigation-by-user-activation',
      'allow-modals'
    ]) {
      expect(rechte, recht).not.toContain(recht)
    }
  })
})

describe('mailKlickZiel', () => {
  const klickAuf = (html: string, selector: string) => {
    const seite = new DOMParser().parseFromString(html, 'text/html')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    let ziel: null | string | undefined

    seite.addEventListener('click', e => (ziel = mailKlickZiel(e)))
    seite.querySelector(selector)!.dispatchEvent(event)

    return { verhindert: event.defaultPrevented, ziel }
  }

  it('hands a web link to the caller instead of letting the frame follow it', () => {
    expect(klickAuf('<a href="https://example.org/a"><b>hier</b></a>', 'b')).toEqual({
      verhindert: true,
      ziel: 'https://example.org/a'
    })
  })

  it('stops a link that leads into the app, and hands nothing on', () => {
    expect(klickAuf('<a href="/settings"><b>hier</b></a>', 'b')).toEqual({ verhindert: true, ziel: null })
  })

  it('leaves a click on plain text alone', () => {
    expect(klickAuf('<p>Text</p>', 'p')).toEqual({ verhindert: false, ziel: null })
  })
})
