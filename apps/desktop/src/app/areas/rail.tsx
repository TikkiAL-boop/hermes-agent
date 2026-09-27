import { useStore } from '@nanostores/react'

import { useI18n } from '@/i18n'
import { Globe, Mail, MessageCircle, Settings, Terminal } from '@/lib/icons'
import { isMacPlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'

import { areaLabels } from './labels'
import { $area, type Area, AREAS, setArea } from './store'

const ICONS: Record<Area, typeof Globe> = {
  admin: Settings,
  browser: Globe,
  post: Mail,
  terminal: Terminal,
  tikki: MessageCircle
}

/**
 * The left rail: four big, labelled buttons and nothing else. This is the
 * whole top-level navigation of Tikki — anyone in the family should find the
 * chat, the browser, the mail and the terminal without reading a manual.
 */
export function AreaRail() {
  const area = useStore($area)
  const { locale } = useI18n()
  const labels = areaLabels(locale)

  return (
    <nav
      aria-label={labels.rail.label}
      className={cn(
        'flex w-[4.5rem] shrink-0 flex-col items-stretch gap-1 border-r border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-1.5 pb-2',
        // Leave room for the macOS traffic lights on the hidden-inset titlebar.
        isMacPlatform() ? 'pt-10' : 'pt-2'
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
              'flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-colors',
              active
                ? 'bg-(--ui-accent)/15 text-(--ui-accent)'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary) hover:text-(--ui-text-primary)'
            )}
            key={id}
            onClick={() => setArea(id)}
            style={id === 'admin' ? { marginTop: 'auto' } : undefined}
            type="button"
          >
            <Icon aria-hidden className="size-6" stroke={1.75} />
            <span>{labels.areas[id]}</span>
          </button>
        )
      })}
    </nav>
  )
}
