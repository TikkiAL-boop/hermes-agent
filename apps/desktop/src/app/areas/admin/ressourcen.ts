// Model resources (the MR bot's view): which provider keys answer, which
// subscription CLIs are installed and signed in, which local server runs, and
// which room-lead clone is free right now. Admin → Modelle asks the backend
// once per click (`hermes -p tikki pa ressourcen --json` over `cli.exec`, so
// the probe runs where the keys are) and shows the result; nothing here holds a
// key – the backend reports names only.

import { atom } from 'nanostores'

import { activeGateway } from '@/store/gateway'

import { PA_PROFIL } from '../tikki/auftraege'

export interface Anbieter {
  name: string
  weg: 'abo' | 'api' | 'lokal'
  schluessel: string[]
  schluessel_fehlt: string[]
  abo: boolean | null
  erreichbar: boolean | null
  befund: string
  modelle: string[]
}

export interface Abo {
  name: string
  befehl: string
  vorhanden: boolean
  version: string
  angemeldet: boolean | null
}

export interface Frei {
  slug: string
  weg: 'abo' | 'api' | 'lokal'
  modell: string
  grund: string
}

export interface Ressourcen {
  zeit: number
  anbieter: Anbieter[]
  abos: Abo[]
  lokal: { server: { adresse: string; art: string; modelle: string[] }[]; modelle: number }
  frei: Frei[]
}

export const MARKE = 'TIKKI-RESSOURCEN '
export const RESSOURCEN_TIMEOUT_S = 90

export const $ressourcen = atom<Ressourcen | null>(null)
export const $ressourcenStatus = atom<'leer' | 'laedt' | 'bereit' | 'fehler'>('leer')

/** Pure: the CLI call the backend runs – profile in argv, never via routing. */
export const ressourcenArgv = (profil = PA_PROFIL): string[] => ['-p', profil, 'pa', 'ressourcen', '--json']

const liste = <T>(wert: unknown): T[] => (Array.isArray(wert) ? (wert as T[]) : [])

/** Pure: the `cli.exec` output (stdout + stderr mixed, warnings included) → the marked JSON line. */
export function ressourcenAusAusgabe(output: string): Ressourcen | null {
  const zeile = output
    .split('\n')
    .map(z => z.trim())
    .find(z => z.startsWith(MARKE))

  if (!zeile) {
    return null
  }

  try {
    const roh = JSON.parse(zeile.slice(MARKE.length)) as Partial<Ressourcen>

    return {
      zeit: typeof roh.zeit === 'number' ? roh.zeit : 0,
      anbieter: liste<Anbieter>(roh.anbieter),
      abos: liste<Abo>(roh.abos),
      lokal: { server: liste(roh.lokal?.server), modelle: roh.lokal?.modelle ?? 0 },
      frei: liste<Frei>(roh.frei)
    }
  } catch {
    return null
  }
}

export type Zeichen = '✓' | '⚠' | '–'

/** Pure: one glyph per provider – ✓ answers (or subscription signed in), ⚠ set but failing, – nothing set. */
export function anbieterZeichen(a: Anbieter): Zeichen {
  if (a.weg === 'abo' && a.erreichbar === null) {
    return a.abo ? '✓' : '⚠'
  }

  if (a.erreichbar === true) {
    return '✓'
  }

  return a.erreichbar === false ? '⚠' : '–'
}

export async function ladeRessourcen(): Promise<Ressourcen | null> {
  $ressourcenStatus.set('laedt')

  try {
    const gateway = activeGateway()

    if (!gateway) {
      throw new Error('gateway not open')
    }

    const antwort = await gateway.request<{ blocked?: boolean; code?: number; output?: string }>(
      'cli.exec',
      { argv: ressourcenArgv(), timeout: RESSOURCEN_TIMEOUT_S },
      (RESSOURCEN_TIMEOUT_S + 10) * 1000
    )

    const ergebnis = antwort?.blocked ? null : ressourcenAusAusgabe(String(antwort?.output ?? ''))

    if (!ergebnis) {
      $ressourcenStatus.set('fehler')

      return null
    }

    $ressourcen.set(ergebnis)
    $ressourcenStatus.set('bereit')

    return ergebnis
  } catch {
    $ressourcenStatus.set('fehler')

    return null
  }
}
