// The bot troop catalogue lives in the repo root (`tikki/rollen/KATALOG.json`)
// so the setup script on the Hermes machine and the admin UI read one file.
import raw from '../../../../../../tikki/rollen/KATALOG.json'

export interface KatalogRolle {
  slug: string
  name: string
  icon: string
  kurz: string
  kategorie: string
  modell: { primary: string; fallback: string }
  werkzeuge: string[]
  freigabe: string
  port: number
  hermes_profil: string
  im_raum_ab_start: boolean
  /** A clone: the same role (SOUL, tools) under another profile with another model chain. */
  klon_von?: string
}

const roh = raw as Partial<KatalogRolle>[]
const nachSlug = new Map(roh.map(r => [r.slug, r]))

/** Every entry, clones completed from their original (they only spell out model, port, name). */
export const KATALOG: KatalogRolle[] = roh.map(r => {
  const quelle = r.klon_von ? nachSlug.get(r.klon_von) : undefined

  return (quelle ? { ...quelle, ...r } : r) as KatalogRolle
})

/** The roles a person picks from: no clones (they are the room lead under another model). */
export const ROLLEN: KatalogRolle[] = KATALOG.filter(r => !r.klon_von)

/** The room lead's clones, by profile slug. */
export const RAUMLEITER_KLONE: KatalogRolle[] = KATALOG.filter(r => r.klon_von === 'raumleiter')

export const rolle = (slug: string): KatalogRolle | undefined => KATALOG.find(r => r.slug === slug)
