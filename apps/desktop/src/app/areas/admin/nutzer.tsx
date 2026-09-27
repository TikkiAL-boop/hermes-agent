import { useI18n } from '@/i18n'

import { areaLabels } from '../labels'

// The family as known today; accounts and rights arrive with the rooms.
const FAMILIE: Array<{ name: string; admin?: boolean }> = [
  { admin: true, name: 'thorsten' },
  { name: 'karin' },
  { name: 'falco' },
  { name: 'jaspa' },
  { name: 'marlo' },
  { name: 'pirmin' },
  { name: 'rolf' },
  { name: 'sanus' },
  { name: 'tabea' },
  { name: 'tanja' },
  { name: 'zoe' }
]

export function NutzerSection() {
  const { locale } = useI18n()
  const u = areaLabels(locale).admin.users

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-xs text-(--ui-text-secondary)">{u.note}</p>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-(--ui-text-secondary) uppercase">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{u.name}</th>
            <th className="py-1.5 pr-3 font-medium">{u.address}</th>
            <th className="py-1.5 pr-3 font-medium">{u.role}</th>
          </tr>
        </thead>
        <tbody>
          {FAMILIE.map(p => (
            <tr className="border-t border-(--ui-stroke-secondary)" key={p.name}>
              <td className="py-1.5 pr-3 text-(--ui-text-primary) capitalize">{p.name}</td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-secondary)">{p.name}@tikki.team</td>
              <td className="py-1.5 pr-3 text-(--ui-text-primary)">{p.admin ? u.admin : u.member}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
