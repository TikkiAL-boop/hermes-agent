// The update watcher: Hermes moves fast, Tikki merges by hand. The app compares
// the Hermes commit tikki-app was last built on (tikki/hermes-basis.json,
// written by hermes-aktualisieren.sh) with Hermes' main on GitHub and says how
// far behind it is. It never updates anything itself.

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

import basis from '../../../../../../tikki/hermes-basis.json'

export interface UpdateStand {
  /** Commits on Hermes main since the base commit; 0 = up to date. */
  neueCommits: number
  /** Newest Hermes release tag, when GitHub lists one. */
  version: string | null
  /** When this was last checked (ms since epoch). */
  geprueft: number
}

const CACHE_KEY = 'tikki.update.stand'
const ALLE_MS = 6 * 60 * 60 * 1000

export const HERMES_BASIS = basis as {
  repo: string
  zweig: string
  commit: string
  datum: string
  hermes_version: string
}

function gespeichert(): UpdateStand | null {
  try {
    const raw = storedString(CACHE_KEY)
    const wert = raw ? (JSON.parse(raw) as UpdateStand) : null

    return wert && typeof wert.neueCommits === 'number' ? wert : null
  } catch {
    return null
  }
}

export const $updateStand = atom<UpdateStand | null>(gespeichert())

/** Pure: GitHub's compare and release answers → what the card shows. */
export function updateStandAus(vergleich: unknown, release: unknown, jetzt = Date.now()): UpdateStand {
  const v = (vergleich ?? {}) as { ahead_by?: unknown; total_commits?: unknown }
  const r = (release ?? {}) as { tag_name?: unknown; name?: unknown }
  const zahl = Number(v.ahead_by ?? v.total_commits ?? 0)
  const tag = typeof r.tag_name === 'string' ? r.tag_name : typeof r.name === 'string' ? r.name : null

  return { neueCommits: Number.isFinite(zahl) && zahl > 0 ? Math.round(zahl) : 0, version: tag, geprueft: jetzt }
}

async function github(pfad: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com/repos/${HERMES_BASIS.repo}${pfad}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8000)
  })

  return res.ok ? res.json() : null
}

/** Ask GitHub once; failures leave the last known state in place. */
export async function pruefeUpdate(): Promise<UpdateStand | null> {
  try {
    const [vergleich, release] = await Promise.all([
      github(`/compare/${HERMES_BASIS.commit}...${HERMES_BASIS.zweig}`),
      github('/releases/latest').catch(() => null)
    ])

    if (!vergleich) {
      return $updateStand.get()
    }

    const stand = updateStandAus(vergleich, release)
    $updateStand.set(stand)
    persistString(CACHE_KEY, JSON.stringify(stand))

    return stand
  } catch {
    return $updateStand.get()
  }
}

/** Check on start (unless checked recently) and then every six hours. Returns the stop function. */
export function startUpdateWaechter(): () => void {
  const letzter = $updateStand.get()?.geprueft ?? 0

  if (Date.now() - letzter > ALLE_MS) {
    void pruefeUpdate()
  }

  const timer = window.setInterval(() => void pruefeUpdate(), ALLE_MS)

  return () => window.clearInterval(timer)
}
