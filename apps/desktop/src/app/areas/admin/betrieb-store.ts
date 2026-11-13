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

export const setMensch = (name: string) =>
  $mensch.set(
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '') || 'thorsten'
  )
