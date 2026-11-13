import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { test } from 'vitest'

const require = createRequire(import.meta.url)

// Electron takes its runtime name (menu bar, About, Quit, userData) from
// package.json productName; electron-builder names the bundle and executable
// after the product identity; the Python core finds the built app by
// productName. All three must be the same word, or the menu says one name
// while `hermes desktop`/`hermes update` look for a bundle that is not there.
test('runtime name, packaged file name and core lookup name agree', () => {
  const config: { productName: string; executableName: string } = require('../electron-builder.config.cjs')
  const pkg: { productName: string } = require('../package.json')
  const identity: { displayName: string } = require('../product-identity.cjs')

  assert.equal(identity.displayName, pkg.productName)
  assert.equal(config.productName, pkg.productName)
  assert.equal(config.executableName, pkg.productName)
})

// The DMG's volume name is the first thing Finder shows after the download;
// it has to introduce the product whose icon sits in the window.
test('the mounted DMG is named after the product', () => {
  const config: { productName: string; dmg: { title: string } } = require('../electron-builder.config.cjs')

  assert.ok(config.dmg.title.includes(config.productName), config.dmg.title)
})
