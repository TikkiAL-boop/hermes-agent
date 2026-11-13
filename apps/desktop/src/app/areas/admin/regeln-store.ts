// Rules & prompts: the editor's state. It lives in atoms, not in the section
// component — Admin unmounts when the person looks at another area, and the
// text they were writing must still be there when they come back. Every role
// keeps its own draft, so switching roles mid-edit loses nothing either.

import { atom, map } from 'nanostores'

import { getProfileSoul, updateProfileSoul } from '@/api/profiles'

import { KATALOG, ROLLEN } from './katalog'
import { $rollenStand, ladeRollenStand } from './rollen-stand'

export interface RegelEntwurf {
  /** The text as the backend last had it. */
  geladen: string
  /** The text in the editor. */
  text: string
}

export type RegelStand = 'laedt' | 'bereit' | 'ladefehler' | 'speichert' | 'gespeichert'

export interface RegelFehler {
  /** Profiles the text did not reach. */
  profile: string[]
  grund: string
}

/** The role on screen. */
export const $regelRolle = atom<string>(ROLLEN[0]?.slug ?? '')

/** One draft per role, from the first time its rules were read. */
export const $regelEntwuerfe = map<Record<string, RegelEntwurf>>({})

export const $regelStand = map<Record<string, RegelStand>>({})

/** What the last save of a role could not write, until the next attempt. */
export const $regelFehler = map<Record<string, RegelFehler | undefined>>({})

export const regelGeaendert = (entwurf: RegelEntwurf | undefined): boolean =>
  Boolean(entwurf && entwurf.text !== entwurf.geladen)

/**
 * The profiles that carry a role's rules: its own and its clones' — a clone is
 * the same role under another model and has its own copy of the SOUL. Only
 * profiles the backend has; the setup script gives a new one the repo's text.
 */
export const regelProfile = (slug: string, vorhanden: ReadonlySet<string>): string[] =>
  [slug, ...KATALOG.filter(r => r.klon_von === slug).map(r => r.slug)].filter(p => vorhanden.has(p))

const grundVon = (fehler: unknown): string => (fehler instanceof Error ? fehler.message : String(fehler))

const laeufe = new Map<string, number>()

/**
 * Read a role's rules from the backend. Text the person has changed and not
 * saved stays as it is; an untouched editor follows the backend.
 */
export async function ladeRegel(slug: string): Promise<void> {
  if (!slug || regelGeaendert($regelEntwuerfe.get()[slug])) {
    return
  }

  const lauf = (laeufe.get(slug) ?? 0) + 1

  laeufe.set(slug, lauf)
  $regelStand.setKey(slug, 'laedt')

  try {
    const soul = await getProfileSoul(slug)

    // A newer read is on its way, or the person started typing meanwhile.
    if (laeufe.get(slug) !== lauf || regelGeaendert($regelEntwuerfe.get()[slug])) {
      return
    }

    $regelEntwuerfe.setKey(slug, { geladen: soul.content, text: soul.content })
    $regelStand.setKey(slug, 'bereit')
  } catch {
    if (laeufe.get(slug) === lauf) {
      $regelStand.setKey(slug, 'ladefehler')
    }
  }
}

export function schreibeRegel(slug: string, text: string): void {
  const entwurf = $regelEntwuerfe.get()[slug]

  if (entwurf) {
    $regelEntwuerfe.setKey(slug, { ...entwurf, text })
  }
}

/** Drop the unsaved text and read the backend's again. */
export function verwirfRegel(slug: string): Promise<void> {
  const entwurf = $regelEntwuerfe.get()[slug]

  if (entwurf) {
    $regelEntwuerfe.setKey(slug, { ...entwurf, text: entwurf.geladen })
  }

  $regelFehler.setKey(slug, undefined)

  return ladeRegel(slug)
}

const GESPEICHERT_MS = 2000

/**
 * Write the editor's text to the role and to its clones. What could not be
 * written is named in `$regelFehler`; the draft stays unsaved until the role's
 * own profile has it.
 */
export async function speichereRegel(slug: string): Promise<void> {
  const entwurf = $regelEntwuerfe.get()[slug]

  if (!entwurf || $regelStand.get()[slug] === 'speichert') {
    return
  }

  const { text } = entwurf

  $regelStand.setKey(slug, 'speichert')
  $regelFehler.setKey(slug, undefined)

  // Which clones exist is the backend's to say; without its answer no clone may be skipped silently.
  if ($rollenStand.get() === null) {
    await ladeRollenStand()
  }

  const stand = $rollenStand.get()
  const profile = stand ? regelProfile(slug, new Set(Object.keys(stand))) : [slug]
  const ergebnisse = await Promise.allSettled(profile.map(p => updateProfileSoul(p, text)))
  const gescheitert = profile.filter((_, i) => ergebnisse[i]!.status === 'rejected')
  const erster = ergebnisse.find((e): e is PromiseRejectedResult => e.status === 'rejected')

  if (erster) {
    $regelFehler.setKey(slug, { grund: grundVon(erster.reason), profile: gescheitert })
  }

  if (gescheitert.includes(slug)) {
    $regelStand.setKey(slug, 'bereit')

    return
  }

  // The person may have typed on while the save ran: only what was sent counts as saved.
  const jetzt = $regelEntwuerfe.get()[slug]

  $regelEntwuerfe.setKey(slug, { geladen: text, text: jetzt?.text ?? text })
  $regelStand.setKey(slug, 'gespeichert')
  window.setTimeout(() => {
    if ($regelStand.get()[slug] === 'gespeichert') {
      $regelStand.setKey(slug, 'bereit')
    }
  }, GESPEICHERT_MS)
}
