import { useI18n } from '@/i18n'

import { areaLabels } from '../labels'

// The planned fleet (from the family's resource list). Machines will register
// themselves once the node service exists; until then this is the map.
const FLOTTE = [
  { kind: 'Mac Studio M3 Ultra', name: 'Mac Studio 512', ram: '512 GB', role: 'Tikki, Vorzimmer, Räume' },
  { kind: 'Mac Studio M3 Ultra', name: 'Mac Studio 256 A', ram: '256 GB', role: 'Bots' },
  { kind: 'Mac Studio M3 Ultra', name: 'Mac Studio 256 B', ram: '256 GB', role: 'Bots' },
  { kind: 'Mac Studio M3 Ultra', name: 'Mac Studio 256 C', ram: '256 GB', role: 'Forscher' },
  { kind: 'x86-Server ×10', name: 'Forscher-Anhang', ram: '—', role: 'Recherche' },
  { kind: 'NVIDIA DGX Spark ×22', name: 'GPU-Rechner', ram: '—', role: 'große Modelle, Batch' },
  { kind: 'MacBook M5 Max ×3', name: 'Notebooks', ram: '128 GB', role: 'Entwicklung' },
  { kind: 'AMD Unified-RAM ×4–6', name: 'AMD-Rechner', ram: '128 GB', role: 'Bots' },
  { kind: 'Hetzner', name: 'consai (tikki.team)', ram: '22 GB', role: 'Web, Honcho, Räume online' },
  { kind: 'Hetzner', name: 'tikkimail', ram: '—', role: 'Post' }
]

export function RechnerSection() {
  const { locale } = useI18n()
  const n = areaLabels(locale).admin.nodes

  return (
    <div className="max-w-4xl">
      <p className="mb-3 text-xs text-(--ui-text-secondary)">{n.note}</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-(--ui-text-secondary) uppercase">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{n.name}</th>
            <th className="py-1.5 pr-3 font-medium">{n.kind}</th>
            <th className="py-1.5 pr-3 font-medium">{n.ram}</th>
            <th className="py-1.5 pr-3 font-medium">{n.role}</th>
          </tr>
        </thead>
        <tbody>
          {FLOTTE.map(m => (
            <tr className="border-t border-(--ui-stroke-secondary)" key={m.name}>
              <td className="py-1.5 pr-3 text-(--ui-text-primary)">{m.name}</td>
              <td className="py-1.5 pr-3 text-(--ui-text-secondary)">{m.kind}</td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-secondary)">{m.ram}</td>
              <td className="py-1.5 pr-3 text-(--ui-text-primary)">{m.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
