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
