import { ProviderConfigPanel } from '@/app/settings/memory/provider-config-panel'

/** Memory: Honcho is Tikki's memory (user / system / project are separated
 *  by workspace on the Honcho side). The Hermes provider panel configures it. */
export function GedaechtnisSection() {
  return (
    <div className="max-w-3xl">
      <ProviderConfigPanel provider="honcho" />
    </div>
  )
}
