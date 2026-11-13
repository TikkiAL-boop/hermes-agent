import { describe, expect, it } from 'vitest'

import { PA_PROFIL } from '../tikki/auftraege'

import { type Anbieter, anbieterZeichen, MARKE, ressourcenArgv, ressourcenAusAusgabe } from './ressourcen'

const anbieter = (teil: Partial<Anbieter>): Anbieter => ({
  name: 'x',
  weg: 'api',
  schluessel: [],
  schluessel_fehlt: [],
  abo: null,
  erreichbar: null,
  befund: '',
  modelle: [],
  ...teil
})

describe('ressourcenAusAusgabe', () => {
  it('finds the marked JSON line between warnings and never needs a key value', () => {
    const output = [
      '[HERMES_HOME fallback] HERMES_HOME is unset …',
      MARKE +
        JSON.stringify({
          zeit: 1_790_000_000,
          anbieter: [anbieter({ name: 'xai', schluessel: ['XAI_API_KEY'], erreichbar: true, modelle: ['grok-4.7'] })],
          abos: [{ name: 'Claude Code', befehl: 'claude', vorhanden: true, version: '2.1', angemeldet: true }],
          lokal: { server: [], modelle: 1 },
          frei: [{ slug: 'raumleiter-xai', weg: 'api', modell: 'xai/grok-4.7', grund: 'xai: erreichbar' }]
        }),
      ''
    ].join('\n')

    const r = ressourcenAusAusgabe(output)

    expect(r?.anbieter[0]?.schluessel).toEqual(['XAI_API_KEY'])
    expect(r?.frei[0]?.slug).toBe('raumleiter-xai')
    expect(r?.lokal).toEqual({ server: [], modelle: 1 })
    expect(ressourcenAusAusgabe('nur Rauschen')).toBeNull()
    expect(ressourcenAusAusgabe(MARKE + '{kaputt')).toBeNull()
  })

  it('names the profile in argv itself, because cli.exec ignores routed profiles', () => {
    // The command must run in the profile it is asked about, whichever that is:
    // `-p <profile>` is a global flag, so it stands before the subcommand.
    const argv = ressourcenArgv('familie')
    const flag = argv.indexOf('-p')

    expect(argv[flag + 1]).toBe('familie')
    expect(flag).toBeLessThan(argv.indexOf('pa'))
    // Unasked, it is the PA's profile — the one the standing orders and the briefing use.
    expect(ressourcenArgv()).toEqual(ressourcenArgv(PA_PROFIL))
  })

  it('marks a provider by what the backend found, subscriptions by their sign-in', () => {
    expect(anbieterZeichen(anbieter({ erreichbar: true }))).toBe('✓')
    expect(anbieterZeichen(anbieter({ erreichbar: false, befund: 'HTTP 404' }))).toBe('⚠')
    expect(anbieterZeichen(anbieter({ schluessel_fehlt: ['XAI_API_KEY'] }))).toBe('–')
    expect(anbieterZeichen(anbieter({ weg: 'abo', abo: true }))).toBe('✓')
    expect(anbieterZeichen(anbieter({ weg: 'abo', abo: false }))).toBe('⚠')
  })
})
