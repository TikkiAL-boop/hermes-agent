import { atom } from 'nanostores'

export const ADMIN_SECTIONS = [
  'schluessel',
  'modelle',
  'regeln',
  'bots',
  'nutzer',
  'rechner',
  'gedaechtnis',
  'betrieb',
  'system'
] as const

export type AdminSection = (typeof ADMIN_SECTIONS)[number]

/** The section on screen. An atom, so leaving the Admin area and coming back lands where the person was. */
export const $adminSection = atom<AdminSection>('modelle')
