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
}

export const KATALOG: KatalogRolle[] = raw as KatalogRolle[]

export const rolle = (slug: string): KatalogRolle | undefined => KATALOG.find(r => r.slug === slug)
