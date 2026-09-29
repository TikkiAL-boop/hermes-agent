import { ModelSettings } from '@/app/settings/model-settings'
import { useI18n } from '@/i18n'

import { areaLabels } from '../labels'

import { KATALOG } from './katalog'

/**
 * Model routing at a glance: who runs on what, with fallback. The rows come
 * from the troop catalogue (the same file the setup script uses); the Hermes
 * model panel below changes the app's own default model.
 */
export function ModelleSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.bots

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-(--ui-text-secondary) uppercase">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{b.name}</th>
            <th className="py-1.5 pr-3 font-medium">{b.model}</th>
            <th className="py-1.5 pr-3 font-medium">{b.fallback}</th>
          </tr>
        </thead>
        <tbody>
          {KATALOG.map(r => (
            <tr className="border-t border-(--ui-stroke-secondary)" key={r.slug}>
              <td className="py-1.5 pr-3 text-(--ui-text-primary)">
                <span aria-hidden className="mr-1.5">
                  {r.icon}
                </span>
                {r.name}
              </td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-primary)">{r.modell.primary}</td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-secondary)">{r.modell.fallback}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ModelSettings />
    </div>
  )
}
