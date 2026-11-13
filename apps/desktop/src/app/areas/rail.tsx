import { useStore } from '@nanostores/react'

import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { Armchair, Globe, Mail, Settings, Terminal } from '@/lib/icons'

import logo from '../../../assets/tikki/tikki-logo-original.png'

import { areaLabels } from './labels'
import { $area, type Area, AREAS, setArea } from './store'
import { $suitesBrauchen } from './suites/store'
import { $updateStand } from './tikki/update-waechter'

const ICONS: Record<Exclude<Area, 'tikki'>, typeof Globe> = {
  admin: Settings,
  browser: Globe,
  post: Mail,
  suites: Armchair,
  terminal: Terminal
}

/**
 * The left rail: the Tikki mark is the way home to the reception, below it one
 * sign per area. No words — the name of each place is its tooltip and its
 * accessible name. A quiet gold dot says that a room waits for the person, or
 * that Tikki has an update; nothing here moves or blinks.
 */
export function AreaRail() {
  const area = useStore($area)
  const wartend = useStore($suitesBrauchen)
  const update = useStore($updateStand)
  const { locale } = useI18n()
  const labels = areaLabels(locale)

  const punkt: Partial<Record<Area, string>> = {
    admin: update && update.neueCommits > 0 ? labels.vorzimmer.update : undefined,
    suites: wartend.length > 0 ? labels.vorzimmer.brauchtDich : undefined
  }

  return (
    // The rail is on screen in every area: its free surface moves the window.
    <nav aria-label={labels.rail.label} className="tikki-leiste tikki-fenstergriff" data-area-rail="">
      {AREAS.map(id => {
        const active = area === id
        const Icon = id === 'tikki' ? null : ICONS[id]
        const hinweis = punkt[id]
        const name = hinweis ? `${labels.areas[id]} · ${hinweis}` : labels.areas[id]

        return (
          <Tip key={id} label={name} placement="left-rail">
            <button
              aria-current={active ? 'page' : undefined}
              aria-label={name}
              className={id === 'admin' ? 'tikki-leiste-knopf mt-auto' : 'tikki-leiste-knopf'}
              data-area-knopf={id}
              data-marke={Icon ? undefined : ''}
              onClick={() => setArea(id)}
              type="button"
            >
              {Icon ? (
                <Icon aria-hidden className="size-5" stroke={1.6} />
              ) : (
                <img alt="" className="tikki-medaillon" draggable={false} src={logo} />
              )}
              {hinweis && <span aria-hidden className="tikki-punkt" data-area-punkt={id} />}
            </button>
          </Tip>
        )
      })}
    </nav>
  )
}
