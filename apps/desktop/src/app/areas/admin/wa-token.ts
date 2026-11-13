// The WhatsApp bridge token. Tikki's briefing tool reads it on the backend, as
// a secret of her profile (`tikki/plugins/pa/briefing.py`), so that is where
// it is kept: in the profile's secret store, written through Hermes' own
// `/api/env`. The app never holds the value — it knows only whether one is set.

import { atom } from 'nanostores'

import { deleteEnvVar, getEnvVars, setEnvVar } from '@/api/config'

import { PA_PROFIL } from '../tikki/auftraege'

export const WA_TOKEN_SCHLUESSEL = 'WA_BRIDGE_TOKEN'

export type WaTokenStand = 'unbekannt' | 'gesetzt' | 'fehlt' | 'fehler'

export const $waToken = atom<WaTokenStand>('unbekannt')

/** A write is on its way. */
export const $waTokenSchreibt = atom(false)

export async function ladeWaToken(): Promise<void> {
  try {
    const env = await getEnvVars(PA_PROFIL)

    $waToken.set(env[WA_TOKEN_SCHLUESSEL]?.is_set ? 'gesetzt' : 'fehlt')
  } catch {
    $waToken.set('fehler')
  }
}

async function schreibe(vorgang: () => Promise<unknown>): Promise<boolean> {
  if ($waTokenSchreibt.get()) {
    return false
  }

  $waTokenSchreibt.set(true)

  try {
    await vorgang()
    await ladeWaToken()

    return $waToken.get() !== 'fehler'
  } catch {
    $waToken.set('fehler')

    return false
  } finally {
    $waTokenSchreibt.set(false)
  }
}

/** Store the token in Tikki's profile. True when the backend has it. */
export const setzeWaToken = (wert: string): Promise<boolean> => {
  const token = wert.trim()

  return token ? schreibe(() => setEnvVar(WA_TOKEN_SCHLUESSEL, token, PA_PROFIL)) : Promise.resolve(false)
}

export const entferneWaToken = (): Promise<boolean> => schreibe(() => deleteEnvVar(WA_TOKEN_SCHLUESSEL, PA_PROFIL))
