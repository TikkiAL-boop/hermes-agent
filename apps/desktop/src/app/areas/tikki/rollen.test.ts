import { describe, expect, it } from 'vitest'

import { KATALOG, ROLLEN } from '../admin/katalog'

import { auftragAusText, botErgebnisse, rolleAusName } from './rollen'

const auftrag = (rolle: string, aufgabe: string) =>
  `AN: ${rolle}\nAUFGABE: ${aufgabe}\nFERTIG WENN:\n- Quelle mit Datum\nABGABE: Liste`

describe('rolleAusName', () => {
  it('resolves every catalogue role by slug, by display name, and forgiving about case and umlauts', () => {
    for (const rolle of ROLLEN) {
      expect(rolleAusName(rolle.slug)?.slug).toBe(rolle.slug)
      expect(rolleAusName(rolle.name)?.slug).toBe(rolle.slug)
      expect(rolleAusName(rolle.name.toUpperCase())?.slug).toBe(rolle.slug)
    }

    expect(rolleAusName('Prüfer')?.slug).toBe('pruefer')
    expect(rolleAusName('Übersetzer')?.slug).toBe('uebersetzer')
    expect(rolleAusName('Raumleiter (Projektleitung)')?.slug).toBe('raumleiter')
  })

  it('names nothing for a role outside the troop', () => {
    expect(rolleAusName('Koch')).toBeUndefined()
    expect(rolleAusName('')).toBeUndefined()
  })
})

describe('auftragAusText', () => {
  it('reads the addressed role and shows the task paragraph instead of the protocol block', () => {
    const { rolle, titel } = auftragAusText(
      auftrag('rechercheur', 'Drei Ferienhäuser an der Ostsee finden,\nmit Preis und Link.')
    )

    expect(rolle?.slug).toBe('rechercheur')
    expect(titel).toBe('Drei Ferienhäuser an der Ostsee finden, mit Preis und Link.')
  })

  it('keeps a free-text goal as its first line with no role', () => {
    const { rolle, titel } = auftragAusText('Finde die Öffnungszeiten der Bibliothek.\nDanach an Karin melden.')

    expect(rolle).toBeUndefined()
    expect(titel).toBe('Finde die Öffnungszeiten der Bibliothek.')
  })
})

describe('botErgebnisse', () => {
  const batch = [
    '[ASYNC DELEGATION BATCH COMPLETE — d-1]',
    'A background fan-out unit you dispatched earlier — 2 subagent(s) — has finished; act on it.',
    '',
    'Dispatched: 2026-09-28 10:00:00 (5m ago)   Total duration: 300s',
    '',
    `--- ✓ TASK 1/2: ${auftrag('rechercheur', 'Ferienhäuser finden')}  (status=completed, api_calls=4, 120.5s) ---`,
    '1. Haus Möwe, 890 €, https://example.test/moewe',
    '2. Haus Düne, 1.200 €',
    'Full live transcript (complete tool/assistant trace): /tmp/x/1.md',
    '',
    `--- ✗ TASK 2/2: ${auftrag('schreiber', 'Einladung schreiben')}  (status=failed, 3.0s) ---`,
    '(failed: provider timeout)',
    'Partial output:',
    'Liebe Familie,'
  ].join('\n')

  it('splits a batch notice into one report per bot, attributed to the addressed role', () => {
    const ergebnisse = botErgebnisse(batch)

    expect(ergebnisse?.map(e => [e.auftrag.rolle?.slug, e.nummer, e.status])).toEqual([
      ['rechercheur', '1/2', 'fertig'],
      ['schreiber', '2/2', 'fehler']
    ])
    expect(ergebnisse?.[0].text).toBe('1. Haus Möwe, 890 €, https://example.test/moewe\n2. Haus Düne, 1.200 €')
    expect(ergebnisse?.[0].text).not.toContain('Full live transcript')
    expect(ergebnisse?.[1].text).toContain('Liebe Familie,')
    expect(ergebnisse?.[0].auftrag.titel).toBe('Ferienhäuser finden')
  })

  it('reads a single completion and an early failure notice', () => {
    const single = [
      '[ASYNC DELEGATION COMPLETE — d-2]',
      'A background subagent you dispatched earlier has finished.',
      '',
      'Dispatched: 2026-09-28 10:00:00 (1m ago)',
      `Original goal: ${auftrag('pruefer', 'Fakten prüfen')}`,
      'Role: leaf   Model: grok-4.7',
      'Status: completed   API calls: 2   Duration: 40s',
      '--- RESULT ---',
      'Alle drei Angaben stimmen.'
    ].join('\n')

    const failed = [
      '[ASYNC DELEGATION TASK FAILED — d-3, task 2/3]',
      'One subagent in a background fan-out you dispatched has failed while its siblings are still running.',
      `Task: ${auftrag('uebersetzer', 'Ins Englische übersetzen')}`,
      'Status: failed   Duration: 12s',
      'Error: model rejected the request'
    ].join('\n')

    expect(botErgebnisse(single)).toEqual([
      {
        auftrag: { rolle: KATALOG.find(r => r.slug === 'pruefer'), titel: 'Fakten prüfen' },
        status: 'fertig',
        text: 'Alle drei Angaben stimmen.'
      }
    ])
    const [fehl] = botErgebnisse(failed) ?? []

    expect(fehl.auftrag.rolle?.slug).toBe('uebersetzer')
    expect(fehl.nummer).toBe('2/3')
    expect(fehl.status).toBe('fehler')
    expect(fehl.text).toContain('model rejected the request')
  })

  it('leaves other background notices alone', () => {
    expect(botErgebnisse('[IMPORTANT: background process 1 finished]')).toBeUndefined()
    expect(botErgebnisse('Cron job done')).toBeUndefined()
  })
})
