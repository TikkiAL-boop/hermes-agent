// Betrieb: how the room lead works across all suites. Kept per install (the
// admin sits at this machine); the backend reads none of it — the app decides
// how many rooms to open when a suite starts.

import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'

/** A new project runs this many times: the person's own room plus practice runs. */
export const UEBUNG_STANDARD = 4
export const UEBUNG_HOECHSTENS = 10
/** Rooms working at the same time across the house (40 AI machines). */
export const KAPAZITAET_STANDARD = 40

const zahl = (key: string, standard: number, min: number, max: number): number => {
  const wert = Number.parseInt(storedString(key) ?? '', 10)

  return Number.isFinite(wert) ? Math.min(max, Math.max(min, wert)) : standard
}

function gespeichert<T extends number | string>(key: string, start: T) {
  const $wert = atom<T>(start)
  $wert.listen(wert => persistString(key, String(wert)))

  return $wert
}

export const $uebungslaeufe = gespeichert(
  'tikki.betrieb.uebungslaeufe',
  zahl('tikki.betrieb.uebungslaeufe', UEBUNG_STANDARD, 1, UEBUNG_HOECHSTENS)
)
export const $kapazitaet = gespeichert(
  'tikki.betrieb.kapazitaet',
  zahl('tikki.betrieb.kapazitaet', KAPAZITAET_STANDARD, 1, 2000)
)
export const $mensch = gespeichert(
  'tikki.betrieb.mensch',
  (storedString('tikki.betrieb.mensch') ?? '').trim() || 'thorsten'
)

export const setUebungslaeufe = (n: number) =>
  $uebungslaeufe.set(Math.min(UEBUNG_HOECHSTENS, Math.max(1, Math.round(n) || 1)))
export const setKapazitaet = (n: number) => $kapazitaet.set(Math.min(2000, Math.max(1, Math.round(n) || 1)))
export const setMensch = (name: string) =>
  $mensch.set(
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '') || 'thorsten'
  )
