import { useStore } from '@nanostores/react'

import { useI18n } from '@/i18n'
import { Armchair, Globe, Mail, MessageCircle, Settings, Terminal } from '@/lib/icons'
import { isMacPlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'

import { areaLabels } from './labels'
import { $area, type Area, AREAS, setArea } from './store'

const ICONS: Record<Area, typeof Globe> = {
  admin: Settings,
  browser: Globe,
  post: Mail,
  suites: Armchair,
  terminal: Terminal,
  tikki: MessageCircle
}

/**
 * The left rail: one glowing tablet per area, each with its name and a word
 * on what it is for. This is the whole top-level navigation of Tikki — anyone
 * in the family should find the reception, the suites, the browser, the mail
 * and the terminal without reading a manual.
 */
export function AreaRail() {
  const area = useStore($area)
  const { locale } = useI18n()
  const labels = areaLabels(locale)

  return (
    <nav
      aria-label={labels.rail.label}
      className={cn(
        'tikki-boden flex w-[10.5rem] shrink-0 flex-col items-stretch gap-2 border-r border-(--tikki-glas-rand) px-2.5 pb-3',
        // Leave room for the macOS traffic lights on the hidden-inset titlebar.
        isMacPlatform() ? 'pt-10' : 'pt-3'
      )}
      data-area-rail=""
    >
      {AREAS.map(id => {
        const Icon = ICONS[id]
        const active = area === id

        return (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'tikki-knopf px-3 py-2.5 text-left',
              !active && 'tikki-knopf-still',
              id === 'admin' && 'mt-auto'
            )}
            key={id}
            onClick={() => setArea(id)}
            type="button"
          >
            <Icon aria-hidden className="size-5 shrink-0" stroke={1.9} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] leading-tight font-semibold">{labels.areas[id]}</span>
              <span className={cn('truncate text-[10.5px] leading-tight', active ? 'opacity-75' : 'opacity-70')}>
                {labels.rail.hinweis[id]}
              </span>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
