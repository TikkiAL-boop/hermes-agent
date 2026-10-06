import { describe, expect, it, vi } from 'vitest'

import { neuVorzulesen, type Sprecher, sprich, stimmeWaehlen, vorlesenStopp } from './stimme'

const nachricht = (
  seq: number,
  von: string,
  text: string,
  extra: Partial<{ still: boolean; system: boolean }> = {}
) => ({
  seq,
  von,
  text,
  still: false,
  system: false,
  ...extra
})

describe('stimmeWaehlen', () => {
  it('prefers Hermes, falls back to the system voice, and stays silent without either', () => {
    expect(stimmeWaehlen(true, true)).toBe('hermes')
    expect(stimmeWaehlen(true, false)).toBe('hermes')
    expect(stimmeWaehlen(false, true)).toBe('browser')
    expect(stimmeWaehlen(false, false)).toBe('stumm')
  })
})

describe('neuVorzulesen', () => {
  const log = [
    nachricht(1, 'mensch', 'thorsten: @raumleiter RAUM: Urlaub'),
    nachricht(2, 'raumleiter', 'STAND: Plane.'),
    nachricht(3, 'rechercheur', '(pass)', { still: true }),
    nachricht(4, 'raumleiter', '(pass)', { still: true }),
    nachricht(5, 'mensch', 'TAKT-RUNDE 3', { system: true }),
    nachricht(6, 'rechercheur', 'Drei Häuser gefunden.'),
    nachricht(7, 'raumleiter', 'BRAUCHE: Dein Budget.'),
    nachricht(8, 'raumleiter', '   ')
  ]

  it('reads only what the room lead said after the mark, never (pass), the person or the system', () => {
    expect(neuVorzulesen(log, 1)).toEqual({ seq: 8, texte: ['STAND: Plane.', 'BRAUCHE: Dein Budget.'] })
  })

  it('reads nothing that was already there and moves the mark to the end', () => {
    expect(neuVorzulesen(log, 8)).toEqual({ seq: 8, texte: [] })
    expect(neuVorzulesen(log, 6)).toEqual({ seq: 8, texte: ['BRAUCHE: Dein Budget.'] })
    expect(neuVorzulesen([], 4)).toEqual({ seq: 4, texte: [] })
  })
})

describe('sprich', () => {
  const sprecher = (hermes: Sprecher['hermes'], browserDa = true) => {
    const s: Sprecher = { browser: vi.fn(), browserDa: () => browserDa, hermes: vi.fn(hermes) }

    return s
  }

  it('speaks with Hermes when it plays and leaves the system voice alone', async () => {
    const s = sprecher(async () => true)

    expect(await sprich('Guten Morgen.', s)).toBe('hermes')
    expect(s.hermes).toHaveBeenCalledWith('Guten Morgen.')
    expect(s.browser).not.toHaveBeenCalled()
  })

  it('falls back to the system voice when Hermes has no provider or fails', async () => {
    const still = sprecher(async () => false)

    const kaputt = sprecher(async () => {
      throw new Error('HTTP 500: No TTS provider available')
    })

    expect(await sprich('Hallo', still)).toBe('browser')
    expect(still.browser).toHaveBeenCalledWith('Hallo')
    expect(await sprich('Hallo', kaputt)).toBe('browser')
    expect(kaputt.browser).toHaveBeenCalledWith('Hallo')
    expect(
      await sprich(
        'Hallo',
        sprecher(async () => false, false)
      )
    ).toBe('stumm')
    expect(
      await sprich(
        '   ',
        sprecher(async () => true)
      )
    ).toBe('stumm')
  })

  it('speaks one text after the other and drops everything after a stop', async () => {
    const reihenfolge: string[] = []
    let frei: () => void = () => undefined

    const s: Sprecher = {
      browser: vi.fn(),
      browserDa: () => true,
      hermes: vi.fn(async text => {
        reihenfolge.push(`start ${text}`)
        await new Promise<void>(resolve => (frei = resolve))
        reihenfolge.push(`ende ${text}`)

        return false
      })
    }

    const erste = sprich('eins', s)
    const zweite = sprich('zwei', s)
    await Promise.resolve()
    expect(reihenfolge).toEqual(['start eins'])

    vorlesenStopp()
    frei()

    expect(await erste).toBe('stumm')
    expect(await zweite).toBe('stumm')
    expect(reihenfolge).toEqual(['start eins', 'ende eins'])
    // Hermes answered "not played" only because we stopped it — the system voice must not finish the sentence.
    expect(s.browser).not.toHaveBeenCalled()
  })
})
