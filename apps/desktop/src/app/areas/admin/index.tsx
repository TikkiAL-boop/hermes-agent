import { type ReactElement, useState } from 'react'

import { useI18n } from '@/i18n'
import { Activity, Book, Brain, KeyRound, Puzzle, Server, Settings, ShieldLock, Users } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { BetriebSection } from './betrieb'
import { BotsSection } from './bots'
import { GedaechtnisSection } from './gedaechtnis'
import { ModelleSection } from './modelle'
import { NutzerSection } from './nutzer'
import { RechnerSection } from './rechner'
import { RegelnSection } from './regeln'
import { SchluesselSection } from './schluessel'
import { ADMIN_SECTIONS, type AdminSection } from './sections'
import { SystemSection } from './system'

const ICONS: Record<AdminSection, typeof KeyRound> = {
  betrieb: Activity,
  bots: Puzzle,
  gedaechtnis: Brain,
  modelle: ShieldLock,
  nutzer: Users,
  rechner: Server,
  regeln: Book,
  schluessel: KeyRound,
  system: Settings
}

const SECTION: Record<AdminSection, () => ReactElement> = {
  betrieb: BetriebSection,
  bots: BotsSection,
  gedaechtnis: GedaechtnisSection,
  modelle: ModelleSection,
  nutzer: NutzerSection,
  rechner: RechnerSection,
  regeln: RegelnSection,
  schluessel: SchluesselSection,
  system: SystemSection
}

/**
 * Admin area: one left column of sections, one content column. Keys, models,
 * memory and system embed the existing Hermes settings panels; rules, bots,
 * users and machines are Tikki's own.
 */
export function AdminArea() {
  const [section, setSection] = useState<AdminSection>('modelle')
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const Body = SECTION[section]

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 gap-4 p-4" data-admin-area="">
      <nav className="tikki-glas flex w-56 shrink-0 flex-col gap-1 p-2 pt-3">
        <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-(--ui-text-secondary) uppercase">
          {labels.areas.admin}
        </div>
        {ADMIN_SECTIONS.map(id => {
          const Icon = ICONS[id]
          const active = id === section

          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={cn('tikki-knopf px-2.5 py-1.5 text-left text-sm', !active && 'tikki-knopf-still')}
              key={id}
              onClick={() => setSection(id)}
              type="button"
            >
              <Icon aria-hidden className="size-4" stroke={1.75} />
              <span>{labels.admin.sections[id]}</span>
            </button>
          )
        })}
      </nav>
      <div className="tikki-glas flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="border-b border-(--ui-stroke-secondary) px-6 py-4">
          <h1 className="text-lg font-semibold text-(--ui-text-primary)">{labels.admin.sections[section]}</h1>
          <p className="mt-1 text-sm text-(--ui-text-secondary)">{labels.admin.intro[section]}</p>
        </header>
        <div className="min-h-0 flex-1 px-6 py-4">
          <Body />
        </div>
      </div>
    </div>
  )
}
