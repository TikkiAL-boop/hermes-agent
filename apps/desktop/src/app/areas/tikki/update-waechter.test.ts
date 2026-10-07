import { describe, expect, it } from 'vitest'

import { HERMES_BASIS, updateStandAus } from './update-waechter'

describe('updateStandAus', () => {
  it("turns GitHub's compare and release into what the card shows", () => {
    expect(updateStandAus({ ahead_by: 12 }, { tag_name: 'v2026.10.1' }, 5)).toEqual({
      neueCommits: 12,
      version: 'v2026.10.1',
      geprueft: 5
    })
    expect(updateStandAus({ ahead_by: 0 }, null, 5)).toEqual({ neueCommits: 0, version: null, geprueft: 5 })
    expect(updateStandAus(null, undefined, 5).neueCommits).toBe(0)
  })

  it('compares against a real Hermes commit, recorded by the update script', () => {
    expect(HERMES_BASIS.repo).toBe('NousResearch/hermes-agent')
    expect(HERMES_BASIS.commit).toMatch(/^[0-9a-f]{40}$/)
  })
})
