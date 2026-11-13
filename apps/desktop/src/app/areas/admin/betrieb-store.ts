// Betrieb: who sits at this machine. Kept per install; the backend reads none
// of it — the name goes in front of what the person says in a room, so several
// people stay apart there.

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

function gespeichert<T extends number | string>(key: string, start: T) {
  const $wert = atom<T>(start)
  $wert.listen(wert => persistString(key, String(wert)))

  return $wert
}

export const $mensch = gespeichert(
  'tikki.betrieb.mensch',
  (storedString('tikki.betrieb.mensch') ?? '').trim() || 'thorsten'
)

const MENSCH_MAX = 40

/**
 * A name as the rooms can carry it. The app puts `<name>: ` in front of what
 * the person says and both clients read it back from there (`NAME_PRAEFIX` in
 * `suites/store.ts`), so a name has no whitespace and none of `:@[]` and is at
 * most 40 long. Everything else is the person's: capitals, umlauts, hyphens.
 */
export const menschName = (roh: string): string => roh.replace(/[\s:@[\]]/g, '').slice(0, MENSCH_MAX)

/** Take a typed name. One that leaves nothing keeps the name there was. */
export const setMensch = (roh: string) => {
  const name = menschName(roh)

  if (name) {
    $mensch.set(name)
  }
}
