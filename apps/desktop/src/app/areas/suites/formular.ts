// The "new suite" form as the person has filled it in so far. An atom, not
// component state: the lobby unmounts when they look at another area (to check
// something in the browser, say), and the goal they were writing must still be
// there when they come back.

import { atom } from 'nanostores'

export interface SuiteFormular {
  name: string
  ziel: string
  /** A schedule from the list, `EIGENER_TAKT` for the free field, or empty for a one-off. */
  taktWahl: string
  eigenerTakt: string
  /** Catalogue roles seated from the start. */
  rollen: readonly string[]
  /** Room-lead clone; empty = the room lead itself. */
  leiter: string
}

export const EIGENER_TAKT = '__eigener__'

const LEER: SuiteFormular = { eigenerTakt: '', leiter: '', name: '', rollen: [], taktWahl: '', ziel: '' }

export const $suiteFormular = atom<SuiteFormular>(LEER)

export const schreibeFormular = (teil: Partial<SuiteFormular>): void =>
  $suiteFormular.set({ ...$suiteFormular.get(), ...teil })

export const leereFormular = (): void => $suiteFormular.set(LEER)

/** The Hermes schedule the form stands for, or undefined for a one-off. */
export const formularTakt = ({ eigenerTakt, taktWahl }: SuiteFormular): string | undefined =>
  (taktWahl === EIGENER_TAKT ? eigenerTakt.trim() : taktWahl) || undefined
