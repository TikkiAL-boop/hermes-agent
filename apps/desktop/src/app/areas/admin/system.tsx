import { GatewaySettings } from '@/app/settings/gateway-settings'

/** Backend and gateway: the Hermes panel, embedded. */
export function SystemSection() {
  return <GatewaySettings embedded />
}
