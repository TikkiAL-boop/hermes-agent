/**
 * The download build (`.github/workflows/tikki-app-mac.yml`) as data.
 *
 * The packaged app trusts its install stamp: on first launch it fetches the
 * core from the stamped repository, branch and commit. The workflow is where
 * that stamp, the release tag and a write-capable token come together, so the
 * two properties below are checked on the job graph itself rather than left
 * to review.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { test } from 'vitest'
import { parse } from 'yaml'

interface Step {
  uses?: string
  run?: string
  with?: Record<string, unknown>
}

interface Job {
  permissions?: Record<string, string>
  steps: Step[]
}

interface Workflow {
  permissions?: Record<string, string>
  jobs: Record<string, Job>
}

const workflow: Workflow = parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '.github', 'workflows', 'tikki-app-mac.yml'), 'utf-8')
)

const jobs = Object.entries(workflow.jobs)
const steps = jobs.flatMap(([, job]) => job.steps)
const isCheckout = (step: Step) => step.uses?.startsWith('actions/checkout@') === true

// A job-level block replaces the workflow-level one; it does not merge.
const canWrite = (job: Job) => Object.values(job.permissions ?? workflow.permissions ?? {}).includes('write')

test('the write-capable token never shares a job with repository or dependency code', () => {
  for (const [name, job] of jobs) {
    if (canWrite(job)) {
      // No checkout and no local action: nothing from the repository, and so
      // no `npm ci` postinstall script, can run next to the token.
      assert.deepEqual(
        job.steps.filter(step => isCheckout(step) || step.uses?.startsWith('./')),
        [],
        `job ${name} can write`
      )
    }

    for (const step of job.steps.filter(isCheckout)) {
      assert.equal(step.with?.['persist-credentials'], false, `job ${name} leaves the token in .git/config`)
    }
  }
})

test('the commit that is built is the commit that is stamped and tagged', () => {
  // The stamp and the release target are GITHUB_SHA. A checkout of any other
  // ref would ship code the stamp does not describe.
  for (const step of steps.filter(isCheckout)) {
    assert.equal(step.with?.ref, undefined)
  }

  // Scripts take their values from the environment; an expression expanded
  // into the script text is how a ref name becomes a command.
  for (const step of steps) {
    assert.doesNotMatch(step.run ?? '', /\$\{\{/)
  }
})
