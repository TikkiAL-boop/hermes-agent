import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { PreviewTilePane } from '@/app/chat/right-rail/preview'
import { hiddenPaneProps, PaneVisibleContext } from '@/components/pane-shell/pane-visibility'
import { useI18n } from '@/i18n'
import { ChevronLeft, Plus, X } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $browserPages } from '@/store/preview'

import { $activeTab, $bereichTabs, $sichtbarerTab, neuerBereichTab, schliesseBereichTab } from './browser-tabs'
import { areaLabels } from './labels'
import { setArea } from './store'

/**
 * Browser as a full area: a tab strip on top, one `PreviewTilePane` per tab
 * underneath (all mounted, inactive ones hidden, so history and scroll
 * survive). It shows the tabs it holds itself (`browser-tabs.ts`) and nothing
 * the chat's layout tree shows.
 */
export function BrowserArea({ active }: { active: boolean }) {
  const tabs = useStore($bereichTabs)
  const pages = useStore($browserPages)
  const activeId = useStore($sichtbarerTab)?.id ?? null
  const { locale } = useI18n()
  const labels = areaLabels(locale).browser

  // A browser on screen always has a page to type an address into.
  useEffect(() => {
    if (active && tabs.length === 0) {
      neuerBereichTab()
    }
  }, [active, tabs.length])

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 flex-col p-4" data-browser-area="">
      <div className="tikki-glas flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Page titles are the pages' words, not the app's: the brand watch leaves them alone. */}
        <div
          className={cn('flex h-9 shrink-0 items-end gap-1 overflow-x-auto px-2 pt-1', active && 'tikki-fenstergriff')}
          data-marke-frei=""
          role="tablist"
        >
          <button
            className="tikki-knopf tikki-knopf-still mb-1 shrink-0 px-2.5 py-1 text-xs font-medium"
            data-browser-zurueck=""
            onClick={() => setArea('tikki')}
            type="button"
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            {labels.zurueck}
          </button>
          {tabs.map(tab => {
            const page = pages[tab.id]
            const title = page?.title || tab.target.label || labels.untitled
            const current = tab.id === activeId

            return (
              <div
                className={cn(
                  'group tikki-kein-griff flex h-8 max-w-56 min-w-0 items-center gap-1 rounded-t-lg border border-b-0 px-3 text-xs',
                  current
                    ? 'border-(--ui-stroke-secondary) bg-(--ui-bg-primary) text-(--ui-text-primary)'
                    : 'border-transparent text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary)'
                )}
                key={tab.id}
              >
                <button
                  aria-selected={current}
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => $activeTab.set(tab.id)}
                  role="tab"
                  type="button"
                >
                  {title}
                </button>
                <button
                  aria-label={labels.close}
                  className="rounded p-0.5 opacity-0 hover:bg-(--ui-fill-tertiary) group-hover:opacity-100"
                  onClick={() => schliesseBereichTab(tab.id)}
                  type="button"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
            )
          })}
          <button
            aria-label={labels.newTab}
            className="mb-1 rounded-md p-1 text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary) hover:text-(--ui-text-primary)"
            onClick={() => void neuerBereichTab()}
            type="button"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
        <div className="relative min-h-0 flex-1 border-t border-(--ui-stroke-secondary) bg-(--ui-bg-primary)">
          {tabs.map(tab => {
            const visible = active && tab.id === activeId

            return (
              <div
                className={cn('absolute inset-0 flex flex-col', !visible && 'invisible')}
                key={tab.id}
                {...hiddenPaneProps(!visible)}
              >
                <PaneVisibleContext.Provider value={visible}>
                  <PreviewTilePane onClose={() => schliesseBereichTab(tab.id)} tabId={tab.id} />
                </PaneVisibleContext.Provider>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
