import { ProvidersSettings } from '@/app/settings/providers-settings'

/** Provider keys: the Hermes panel, unchanged, so keys stay with the backend. */
export function SchluesselSection() {
  return <ProvidersSettings onClose={() => {}} onViewChange={() => {}} view="keys" />
}
