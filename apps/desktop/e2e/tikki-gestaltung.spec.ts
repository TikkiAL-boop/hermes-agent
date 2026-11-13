/**
 * Erkundung (vorläufig): heutiger Stand in allen Bereichen, DPR 2.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

import { type MockBackendFixture, setupMockBackend, waitForAppReady } from './fixtures'
import { allowErrorBanners, expect, test } from './test'

let fixture: MockBackendFixture | null = null

const AUS = path.resolve(import.meta.dirname, '..', 'test-results', 'tikki-erkundung')

test.beforeAll(async () => {
  fixture = await setupMockBackend({
    electronArgs: ['--force-device-scale-factor=2'],
    mockServer: { replyForPrompt: () => 'Guten Morgen. Heute steht nichts Dringendes an – der Vormittag gehört dir.' }
  })
  await waitForAppReady(fixture, 120_000)
  fs.mkdirSync(AUS, { recursive: true })
})

test.afterAll(async () => {
  await fixture?.cleanup()
  fixture = null
})

async function groesse(w: number, h: number) {
  const { app, page } = fixture!

  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getAllWindows()[0]!

      win.unmaximize()
      win.setMinimumSize(Math.min(width, 400), Math.min(height, 620))
      win.setBounds({ x: 0, y: 0, width, height })
    },
    { width: w, height: h }
  )
  await page.waitForTimeout(600)

  return page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }))
}

test('erkundung', async () => {
  test.setTimeout(600_000)
  allowErrorBanners()
  const { page } = fixture!

  for (const [w, h] of [
    [400, 620],
    [1220, 800],
    [2560, 1440],
    [3840, 2160]
  ] as const) {
    console.log('GROESSE', w, h, JSON.stringify(await groesse(w, h)))
    const t0 = Date.now()

    await page.screenshot({ path: path.join(AUS, `groesse-${w}x${h}.png`) })
    console.log('  screenshot ms', Date.now() - t0)
  }

  await groesse(1220, 800)

  const knopf = async (name: string) => {
    await page.locator(`[data-area-rail] button`, { hasText: name }).first().click()
    await page.waitForTimeout(1200)
  }

  for (const [name, datei] of [
    ['Suites', 'suites'],
    ['Browser', 'browser'],
    ['Mail', 'post'],
    ['Terminal', 'terminal'],
    ['Admin', 'admin']
  ] as const) {
    await knopf(name)
    await page.screenshot({ path: path.join(AUS, `alt-${datei}.png`) })

    const nichtJetzt = page.getByRole('button', { name: 'Not now' })

    if (await nichtJetzt.count()) {
      await nichtJetzt.click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(AUS, `alt-${datei}-2.png`) })
    }
  }

  await knopf('Tikki')
  await page.screenshot({ path: path.join(AUS, 'alt-vorzimmer.png') })

  // Eine Unterhaltung mit Werkzeugschritten.
  const composer = page.locator('[data-slot="composer-root"] [contenteditable="true"]').first()

  await composer.click()
  await composer.pressSequentially('Was steht heute an?')
  await composer.press('Enter')
  await expect(page.getByText('Guten Morgen.')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(AUS, 'alt-gespraech.png') })

  await composer.click()
  await composer.pressSequentially('E2E_INTERIM_TRIGGER bitte')
  await composer.press('Enter')
  await page.waitForTimeout(15_000)
  await page.screenshot({ path: path.join(AUS, 'alt-werkzeuge.png') })

  const html = await page.evaluate(() => document.querySelector('[data-slot="aui_thread-viewport"]')?.outerHTML ?? '')

  fs.writeFileSync(path.join(AUS, 'transkript.html'), html)

  // Hermes-Teile
  for (const [route, datei] of [
    ['/settings', 'einstellungen'],
    ['/capabilities', 'faehigkeiten'],
    ['/messaging', 'messaging'],
    ['/artifacts', 'artefakte'],
    ['/cron', 'cron'],
    ['/profiles', 'profile'],
    ['/command-center', 'zentrale']
  ] as const) {
    await page.evaluate(r => {
      location.hash = `#${r}`
    }, route)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(AUS, `alt-hermes-${datei}.png`) })
  }

  fs.writeFileSync(path.join(AUS, 'body.html'), await page.evaluate(() => document.body.outerHTML.slice(0, 600_000)))
})
