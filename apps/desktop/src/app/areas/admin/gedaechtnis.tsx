import { useEffect, useState } from 'react'

import { ProviderConfigPanel } from '@/app/settings/memory/provider-config-panel'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

/** The Tikki Honcho service on this machine (tikki/dienste/honcho/honcho.sh). */
export const HONCHO_PORT = 8000

type Zustand = 'unbekannt' | 'laeuft' | 'aus'

const PUNKT: Record<Zustand | 'prueft', string> = {
  aus: 'bg-destructive/70',
  laeuft: 'bg-(--ui-accent)',
  prueft: 'bg-(--ui-text-secondary)/30',
  unbekannt: 'bg-(--ui-text-secondary)/30'
}

const TEXT = { aus: 'aus', laeuft: 'laeuft', prueft: 'pruefe', unbekannt: 'unbekannt' } as const

/**
 * Asked through the main process: a page may not read another origin's answer
 * (the service allows none), so a `fetch` from here would call a running
 * service "down". Without the bridge nothing is known — and nothing claimed.
 */
async function honchoErreichbar(): Promise<Zustand> {
  const probe = window.hermesDesktop?.tikkiLocalHealth

  if (!probe) {
    return 'unbekannt'
  }

  try {
    return (await probe(HONCHO_PORT)) ? 'laeuft' : 'aus'
  } catch {
    return 'unbekannt'
  }
}

/** Memory: Honcho runs as Tikki's own service on this machine; this card says
 *  whether it is up, the Hermes provider panel below configures the rest. */
export function GedaechtnisSection() {
  const { locale } = useI18n()
  const g = areaLabels(locale).admin.gedaechtnis
  const [zustand, setZustand] = useState<Zustand | 'prueft'>('prueft')

  useEffect(() => {
    let stopped = false

    const probe = async () => {
      const next = await honchoErreichbar()

      if (!stopped) {
        setZustand(next)
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
    <div className="flex max-w-3xl flex-col gap-4">
      <div
        className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-4"
        data-honcho-status={zustand}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', PUNKT[zustand])} />
          <span className="text-sm font-semibold text-(--ui-text-primary)">Honcho</span>
          <span className="text-xs text-(--ui-text-secondary)" role="status">
            {g[TEXT[zustand]]}
          </span>
          <span className="ml-auto font-mono text-[11px] text-(--ui-text-secondary)">127.0.0.1:{HONCHO_PORT}</span>
        </div>
        <p className="mt-2 text-xs text-(--ui-text-secondary)">{g.erklaerung}</p>
        {zustand === 'aus' && (
          <p className="mt-2 text-xs text-(--ui-text-primary)" data-honcho-starthinweis="">
            {g.starten}{' '}
            <code className="rounded bg-(--ui-fill-quinary) px-1 py-0.5 font-mono">
              tikki/dienste/honcho/honcho.sh start
            </code>
          </p>
        )}
      </div>
      <ProviderConfigPanel provider="honcho" />
    </div>
  )
}
