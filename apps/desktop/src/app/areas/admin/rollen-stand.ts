// The troop as the backend has it: which role profiles exist, whether the
// gateway serves them, and the model each is configured with. The catalogue
// (`katalog.ts`) only knows what a fresh setup would write — a model chosen in
// the profile wins over it (`rollen_config.py`), so anything on screen that
// says "who runs on what" reads it here. One REST call (`/api/profiles`): it
// goes through Hermes' bridge, so it also holds for a remote backend.

import { atom } from 'nanostores'

import { getProfiles } from '@/api/profiles'
import type { ProfileInfo } from '@/types/hermes'

import type { KatalogRolle } from './katalog'

export interface RollenStand {
  /** The gateway is up and serves this profile (its own, or the one host gateway for all roles). */
  laeuft: boolean
  /** `provider/model` as configured in the profile; null when it names none. */
  modell: string | null
}

/** By profile name. `null` until the backend has answered — then nothing is claimed about any role. */
export const $rollenStand = atom<Record<string, RollenStand> | null>(null)

export const $rollenStandStatus = atom<'leer' | 'laedt' | 'bereit' | 'fehler'>('leer')

// `/api/profiles` reports it; the shared type predates the field.
type Profil = ProfileInfo & { gateway_running?: boolean }

const modellName = (profil: Profil): string | null =>
  profil.model ? (profil.provider ? `${profil.provider}/${profil.model}` : profil.model) : null

/**
 * What to show as a role's models: the catalogue's chain while its profile
 * runs on the catalogue's model (or the backend has not said), else the model
 * the profile was switched to — its fallbacks are then the profile's own and
 * nothing here knows them.
 */
export const modellkette = (rolle: KatalogRolle, stand: Record<string, RollenStand> | null): string => {
  const eingestellt = stand?.[rolle.slug]?.modell

  return !eingestellt || eingestellt === rolle.modell.primary
    ? `${rolle.modell.primary} · ${rolle.modell.fallback}`
    : eingestellt
}

/** The main model alone, same rule. */
export const hauptmodell = (rolle: KatalogRolle, stand: Record<string, RollenStand> | null): string =>
  stand?.[rolle.slug]?.modell ?? rolle.modell.primary

let lauf = 0

/** Ask the backend. A failed call keeps the last answer on screen and says so in the status. */
export async function ladeRollenStand(): Promise<void> {
  const meiner = ++lauf

  if ($rollenStand.get() === null) {
    $rollenStandStatus.set('laedt')
  }

  try {
    const { profiles } = await getProfiles()

    if (meiner !== lauf) {
      return
    }

    $rollenStand.set(
      Object.fromEntries(
        (profiles as Profil[]).map(p => [p.name, { laeuft: p.gateway_running === true, modell: modellName(p) }])
      )
    )
    $rollenStandStatus.set('bereit')
  } catch {
    if (meiner === lauf) {
      $rollenStandStatus.set('fehler')
    }
  }
}

const ALLE_MS = 30_000

/** Keep the answer fresh while something shows it. Returns the stop function. */
export function beobachteRollenStand(): () => void {
  void ladeRollenStand()
  const timer = window.setInterval(() => void ladeRollenStand(), ALLE_MS)

  return () => window.clearInterval(timer)
}
