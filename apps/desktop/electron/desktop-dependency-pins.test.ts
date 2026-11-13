/**
 * Every desktop dependency is an exact version, and the lockfile agrees.
 *
 * The main process bundles its dependencies and some of them handle secrets
 * (the mail client's IMAP/SMTP libraries see the mailbox password). A range
 * (`^`/`~`) lets the next lockfile refresh pull a newer release of that code
 * without anyone having chosen it. `desktop-electron-pin.test.ts` holds this
 * line for Electron alone; this is the same contract for the whole manifest,
 * without naming any package or version.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { test } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const WORKSPACE = 'apps/desktop'

const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/

interface LockPackage {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8'))

const manifest: Required<Pick<LockPackage, 'dependencies' | 'devDependencies'>> = readJson(`${WORKSPACE}/package.json`)

// Registry packages only: a `file:` sibling (apps/shared) is this repository.
const declared = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies }).filter(
  ([, spec]) => !/^(?:file|link|workspace):/.test(spec)
)

test('every desktop dependency is pinned to an exact version', () => {
  const ranges = declared.filter(([, spec]) => !EXACT_SEMVER.test(spec)).map(([name, spec]) => `${name}@${spec}`)

  assert.deepEqual(ranges, [], 'pin these to the version the lockfile resolves')
})

test('the lockfile records and resolves exactly the declared versions', () => {
  const packages: Record<string, LockPackage> = readJson('package-lock.json').packages
  const recorded = { ...packages[WORKSPACE].dependencies, ...packages[WORKSPACE].devDependencies }

  for (const [name, spec] of declared) {
    // A workspace-local copy shadows the hoisted one, as in node resolution.
    const resolved = packages[`${WORKSPACE}/node_modules/${name}`] ?? packages[`node_modules/${name}`]

    assert.equal(recorded[name], spec, `${name}: lockfile still records another spec`)
    assert.equal(resolved?.version, spec, `${name}: lockfile resolves another version`)
  }
})
