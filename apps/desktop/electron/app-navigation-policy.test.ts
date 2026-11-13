import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

import { describe, test } from 'vitest'

import { classifyAppNavigation } from './app-navigation-policy'

// Built the way main.ts builds it, so the test runs on every host's path shape.
const UNPACKED = pathToFileURL('/opt/Tikki App/resources/app.asar.unpacked/dist/index.html').toString()
const ASAR = pathToFileURL('/opt/Tikki App/resources/app.asar/dist/index.html').toString()
const PACKAGED = [UNPACKED, ASAR]
const DEV = ['http://localhost:5173']

const ERROR_PAGE = 'data:text/html;charset=utf-8,%3Ch1%3Erenderer%20failed%3C%2Fh1%3E'

describe('classifyAppNavigation', () => {
  test('content inside the window can never take the window somewhere else', () => {
    // What a relative link, an absolute file link or a form in rendered mail
    // HTML resolves to once the document is `file://…/index.html`.
    const window = { currentUrl: `${UNPACKED}#/post`, entryUrls: PACKAGED }

    const hostile = [
      pathToFileURL('/home/karin/Downloads/a.html').toString(),
      new URL('other.html', UNPACKED).toString(),
      new URL('../../../../etc/passwd', UNPACKED).toString(),
      `${UNPACKED}?win=hud`,
      `${UNPACKED}?q=form-field#/post`,
      `${ASAR}?win=overlay#/`,
      'https://example.org/login',
      'javascript:alert(1)'
    ]

    for (const target of hostile) {
      assert.notEqual(classifyAppNavigation(target, window), 'allow', target)
    }

    // Another role of the app itself is refused outright; nothing of it is
    // worth showing in the OS browser or the file manager.
    assert.equal(classifyAppNavigation(`${UNPACKED}?win=hud`, window), 'deny')
    assert.equal(classifyAppNavigation('https://example.org/login', window), 'external')

    // The dev server owns its origin, and the same rule holds there.
    const dev = { currentUrl: 'http://localhost:5173/#/post', entryUrls: DEV }

    assert.equal(classifyAppNavigation('http://localhost:5173/?win=hud', dev), 'deny')
    assert.equal(classifyAppNavigation('http://localhost:5173/home/karin/a.html', dev), 'deny')
    assert.equal(classifyAppNavigation('http://localhost:8501/', dev), 'external')
  })

  test('every window can still reload itself and recover from the load-error page', () => {
    // location.reload() in any window role, on either shipped copy, in dev.
    for (const [entryUrls, current] of [
      [PACKAGED, `${UNPACKED}#/chat/abc`],
      [PACKAGED, `${UNPACKED}?win=secondary&session=abc#/`],
      [PACKAGED, `${ASAR}?win=overlay#/`],
      [DEV, 'http://localhost:5173/?win=quick#/']
    ] as const) {
      const reload = current.replace(/#.*$/, '')

      assert.equal(classifyAppNavigation(reload, { currentUrl: current, entryUrls }), 'allow', current)
      assert.equal(classifyAppNavigation(current, { currentUrl: current, entryUrls }), 'allow', current)
    }

    // The error page is a data: URL whose Reload button loads the renderer
    // entry, and only that.
    for (const entryUrls of [PACKAGED, DEV]) {
      const onErrorPage = { currentUrl: ERROR_PAGE, entryUrls }

      assert.equal(classifyAppNavigation(entryUrls[0], onErrorPage), 'allow')
      assert.equal(classifyAppNavigation(`${entryUrls[0]}?win=hud`, onErrorPage), 'deny')
    }
  })
})
