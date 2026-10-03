// Local models: what lies on the backend machine's disk and which model server
// answers right now. The overview asks once at start (`hermes -p tikki pa modelle
// --json` over `cli.exec`, so it runs where the models are, even for a remote
// backend) and shows the result; nothing here downloads, starts or configures
// anything. `cli.exec` ignores the routed `profile` param and runs in the
// backend's launch home, so the profile travels in argv (`-p`), which also
// makes the call independent of a pooled per-profile backend.

import { atom } from 'nanostores'

import { activeGateway } from '@/store/gateway'

import { PA_PROFIL } from './auftraege'

export interface LokalesModell {
  name: string
  pfad: string
  format: string
  quelle: string
  gb: number
  parameter: string | null
  aktiv: string | null
  quant: string | null
  start: string
}

export interface Modellserver {
  adresse: string
  art: string
  modelle: string[]
}

export interface Modellsuche {
  modelle: LokalesModell[]
  server: Modellserver[]
  empfehlung: { raeume: string | null; sprache: string | null }
}

export const MARKE = 'TIKKI-MODELLE '
export const MODELLE_TIMEOUT_S = 60

export const $modellsuche = atom<Modellsuche | null>(null)
export const $modellsucheStatus = atom<'leer' | 'laedt' | 'bereit' | 'fehler'>('leer')

/** Pure: the CLI call the backend runs – profile in argv, never via routing. */
export const modellsucheArgv = (profil = PA_PROFIL): string[] => ['-p', profil, 'pa', 'modelle', '--json']

/** Pure: the `cli.exec` output (stdout + stderr mixed, warnings included) → the marked JSON line. */
export function modellsucheAusAusgabe(output: string): Modellsuche | null {
  const zeile = output
    .split('\n')
    .map(z => z.trim())
    .find(z => z.startsWith(MARKE))

  if (!zeile) {
    return null
  }

  try {
    const roh = JSON.parse(zeile.slice(MARKE.length)) as Partial<Modellsuche>

    return {
      modelle: Array.isArray(roh.modelle) ? roh.modelle : [],
      server: Array.isArray(roh.server) ? roh.server : [],
      empfehlung: { raeume: roh.empfehlung?.raeume ?? null, sprache: roh.empfehlung?.sprache ?? null }
    }
  } catch {
    return null
  }
}

/** Pure: one line per model for the card – „Qwen3-235B-A22B · 235B (22B aktiv) · 4bit · 125 GB“. */
export function modellZeile(m: LokalesModell): string {
  const teile = [
    m.parameter ? (m.aktiv ? `${m.parameter} (${m.aktiv} aktiv)` : m.parameter) : null,
    m.quant,
    `${m.gb} GB`
  ]

  return teile.filter(Boolean).join(' · ')
}

export async function ladeModellsuche(): Promise<Modellsuche | null> {
  $modellsucheStatus.set('laedt')

  try {
    const gateway = activeGateway()

    if (!gateway) {
      throw new Error('gateway not open')
    }

    const antwort = await gateway.request<{ blocked?: boolean; code?: number; output?: string }>(
      'cli.exec',
      { argv: modellsucheArgv(), timeout: MODELLE_TIMEOUT_S },
      (MODELLE_TIMEOUT_S + 10) * 1000
    )

    const ergebnis = antwort?.blocked ? null : modellsucheAusAusgabe(String(antwort?.output ?? ''))

    if (!ergebnis) {
      $modellsucheStatus.set('fehler')

      return null
    }

    $modellsuche.set(ergebnis)
    $modellsucheStatus.set('bereit')

    return ergebnis
  } catch {
    $modellsucheStatus.set('fehler')

    return null
  }
}
