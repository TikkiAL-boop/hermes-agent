import { describe, expect, it } from 'vitest'

import { auftragAusJob } from './auftraege'

describe('auftragAusJob', () => {
  it('reads a gateway cron job in either field spelling and knows when it is paused', () => {
    const a = auftragAusJob({
      job_id: 'j1',
      name: 'Post prüfen',
      schedule_display: 'every 4m',
      next_run_at: 1_800_000_000,
      last_status: 'ok'
    })

    expect(a).toMatchObject({ id: 'j1', name: 'Post prüfen', plan: 'every 4m', aktiv: true, letzterStand: 'ok' })
    expect(a?.naechster).toBe(1_800_000_000_000)

    const b = auftragAusJob({ id: 'j2', schedule: '0 7 * * *', enabled: false, next_run_at: '2026-10-02T07:00:00Z' })
    expect(b).toMatchObject({ id: 'j2', name: 'j2', aktiv: false })
    expect(b?.naechster).toBe(Date.parse('2026-10-02T07:00:00Z'))

    expect(auftragAusJob({})).toBeNull()
  })
})
