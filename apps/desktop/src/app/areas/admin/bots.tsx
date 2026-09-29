import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { KATALOG } from './katalog'

type Health = 'online' | 'offline' | 'unknown'

/** The troop, with a live reachability check of every role's gateway port. */
export function BotsSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.bots
  const [health, setHealth] = useState<Record<string, Health>>({})

  useEffect(() => {
    let stopped = false

    const probe = async () => {
      const next: Record<string, Health> = {}

      await Promise.all(
        KATALOG.map(async r => {
          try {
            const res = await fetch(`http://127.0.0.1:${r.port}/health`, { signal: AbortSignal.timeout(2500) })

            next[r.slug] = res.ok ? 'online' : 'offline'
          } catch {
            next[r.slug] = 'offline'
          }
        })
      )

      if (!stopped) {
        setHealth(next)
      }
    }

    void probe()
    const timer = window.setInterval(() => void probe(), 30_000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [])

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <p className="text-xs text-(--ui-text-secondary)">{b.setup}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KATALOG.map(r => {
          const state = health[r.slug] ?? 'unknown'

          return (
            <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-3" key={r.slug}>
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-xl">
                  {r.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-(--ui-text-primary)">{r.name}</div>
                  <div className="truncate text-xs text-(--ui-text-secondary)">{r.kategorie}</div>
                </div>
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    state === 'online'
                      ? 'bg-(--ui-accent)'
                      : state === 'offline'
                        ? 'bg-(--ui-text-secondary)/40'
                        : 'bg-(--ui-text-secondary)/20'
                  )}
                  title={b[state]}
                />
              </div>
              <p className="mt-2 text-xs text-(--ui-text-primary)">{r.kurz}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] text-(--ui-text-secondary)">
                <dt>{b.model}</dt>
                <dd className="truncate font-mono">{r.modell.primary}</dd>
                <dt>{b.fallback}</dt>
                <dd className="truncate font-mono">{r.modell.fallback}</dd>
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
