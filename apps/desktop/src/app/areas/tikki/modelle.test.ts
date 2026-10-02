import { describe, expect, it } from 'vitest'

import { MARKE, modellsucheAusAusgabe, modellZeile } from './modelle'

describe('modellsucheAusAusgabe', () => {
  it('finds the marked JSON line between warnings and ignores everything else', () => {
    const output = [
      '[HERMES_HOME fallback] HERMES_HOME is unset …',
      MARKE +
        JSON.stringify({
          modelle: [{ name: 'Qwen3-235B-A22B-4bit', gb: 125.3, parameter: '235B', aktiv: '22B', quant: '4bit' }],
          server: [{ adresse: 'http://127.0.0.1:1234/v1', art: 'lmstudio', modelle: ['qwen3-235b-a22b'] }],
          empfehlung: { raeume: 'Qwen3-235B-A22B-4bit', sprache: null }
        }),
      ''
    ].join('\n')

    const s = modellsucheAusAusgabe(output)

    expect(s?.modelle).toHaveLength(1)
    expect(s?.server[0]?.modelle).toEqual(['qwen3-235b-a22b'])
    expect(s?.empfehlung).toEqual({ raeume: 'Qwen3-235B-A22B-4bit', sprache: null })
    expect(modellsucheAusAusgabe('nur Rauschen')).toBeNull()
    expect(modellsucheAusAusgabe(MARKE + '{kaputt')).toBeNull()
  })

  it('describes a model with what matters for choosing it', () => {
    const basis = { name: 'x', pfad: '/m', format: 'mlx', quelle: 'huggingface', start: '' }

    expect(modellZeile({ ...basis, gb: 125.3, parameter: '235B', aktiv: '22B', quant: '4bit' })).toBe(
      '235B (22B aktiv) · 4bit · 125.3 GB'
    )
    expect(modellZeile({ ...basis, gb: 0.1, parameter: null, aktiv: null, quant: null })).toBe('0.1 GB')
  })
})
