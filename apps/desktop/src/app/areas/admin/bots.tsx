import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { ROLLEN } from './katalog'
import { $rollenStand, $rollenStandStatus, beobachteRollenStand, type RollenStand } from './rollen-stand'

export type BotZustand = 'online' | 'offline' | 'missing' | 'unknown'

/** What the backend's answer says about one role; `unknown` as long as there is no answer. */
export const botZustand = (stand: Record<string, RollenStand> | null, slug: string): BotZustand => {
  if (!stand) {
    return 'unknown'
  }

  const rolle = stand[slug]

  return rolle ? (rolle.laeuft ? 'online' : 'offline') : 'missing'
}

const PUNKT: Record<BotZustand, string> = {
  missing: 'bg-destructive/60',
  offline: 'bg-(--ui-text-secondary)/40',
  online: 'bg-(--ui-accent)',
  unknown: 'bg-(--ui-text-secondary)/20'
}

/**
 * The troop as the backend has it: is the role set up, does the gateway serve
 * it, which model is it configured with. The catalogue's chain is shown beside
 * it as what a fresh setup would write.
 */
export function BotsSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.bots
  const stand = useStore($rollenStand)
  const status = useStore($rollenStandStatus)

  useEffect(() => beobachteRollenStand(), [])

  return (
    <div className="flex max-w-5xl flex-col gap-4" data-bots-status={status}>
      <p className="text-xs text-(--ui-text-secondary)">{b.setup}</p>
      {status === 'fehler' && (
        <p className="text-xs text-destructive" role="alert">
          {b.statusFehler}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLLEN.map(r => {
          const state = botZustand(stand, r.slug)

          return (
            <div
              className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-3"
              data-bot={r.slug}
              data-bot-zustand={state}
              key={r.slug}
            >
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-xl">
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-(--ui-text-primary)">{r.name}</div>
                  <div className="truncate text-xs text-(--ui-text-secondary)">{r.kategorie}</div>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-(--ui-text-secondary)">
                  {b[state]}
                  <span aria-hidden className={cn('size-2.5 rounded-full', PUNKT[state])} />
                </span>
              </div>
              <p className="mt-2 text-xs text-(--ui-text-primary)">{r.kurz}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-(--ui-text-secondary)">
                <dt>{b.model}</dt>
                <dd className="truncate font-mono text-(--ui-text-primary)" data-bot-modell="">
                  {stand?.[r.slug]?.modell ?? '–'}
                </dd>
                <dt>{b.vorgabe}</dt>
                <dd className="truncate font-mono">
                  {r.modell.primary} · {r.modell.fallback}
                </dd>
                <dt>{b.port}</dt>
                <dd className="font-mono">{r.port}</dd>
              </dl>
              <div className="mt-2 text-[11px] text-(--ui-text-secondary)">
                {r.im_raum_ab_start ? b.atStart : b.onDemand}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
