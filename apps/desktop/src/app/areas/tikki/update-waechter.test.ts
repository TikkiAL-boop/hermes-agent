import { describe, expect, it } from 'vitest'

import { HERMES_BASIS, standAlsCache, standAusCache, updateStandAus } from './update-waechter'

describe('the remembered update state', () => {
  const stand = { neueCommits: 12, version: 'v2026.10.1', geprueft: 5 }

  it('is believed only for the build it was measured against', () => {
    expect(standAusCache(standAlsCache(stand, 'aaa'), 'aaa')).toEqual(stand)
    // After hermes-aktualisieren.sh the base is another commit: "12 behind" was about the old one.
    expect(standAusCache(standAlsCache(stand, 'aaa'), 'bbb')).toBeNull()
  })

  it('does not trust an entry that names no base, or is not an entry at all', () => {
    expect(standAusCache(JSON.stringify(stand), 'aaa')).toBeNull()
    expect(standAusCache('{broken', 'aaa')).toBeNull()
    expect(standAusCache(null, 'aaa')).toBeNull()
  })
})

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
