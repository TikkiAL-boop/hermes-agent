import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { useEffect } from 'react'

import { PreviewTilePane } from '@/app/chat/right-rail/preview'
import { useI18n } from '@/i18n'
import { Plus, X } from '@/lib/icons'
import { persistString, storedString } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { hiddenPaneProps, PaneVisibleContext } from '@/components/pane-shell/pane-visibility'
import {
  $browserPages,
  $previewTabs,
  closeRightRailTab,
  markBrowserTabPopped,
  newBrowserTab,
  type PreviewTab
} from '@/store/preview'

import { areaLabels } from './labels'

const ACTIVE_KEY = 'tikki.desktop.browser.activeTab'

const $activeTab = atom<null | string>(storedString(ACTIVE_KEY))

$activeTab.subscribe(id => persistString(ACTIVE_KEY, id))

const urlTabs = (tabs: PreviewTab[]) => tabs.filter(tab => tab.target.kind === 'url')

/**
 * Browser as a full area: a tab strip on top, one `PreviewTilePane` per tab
 * underneath (all mounted, inactive ones hidden, so history and scroll
 * survive). Tabs shown here are marked "popped" so the chat's layout tree does
 * not render the same page a second time.
 */
export function BrowserArea({ active }: { active: boolean }) {
  const tabs = urlTabs(useStore($previewTabs))
  const pages = useStore($browserPages)
  const activeId = useStore($activeTab)
  const { locale } = useI18n()
  const labels = areaLabels(locale).browser

  // Adopt every URL tab into the area and make sure there is at least one.
  useEffect(() => {
    if (!active) {
      return
    }

    if (tabs.length === 0) {
      newBrowserTab()

      return
    }

    for (const tab of tabs) {
      markBrowserTabPopped(tab.id, true)
    }
  }, [active, tabs])

  // Keep the active id pointing at a tab that exists.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(tab => tab.id === activeId)) {
      $activeTab.set(tabs[tabs.length - 1].id)
    }
  }, [tabs, activeId])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-(--ui-bg-chrome)" data-browser-area="">
      <div className="flex h-9 shrink-0 items-end gap-1 overflow-x-auto px-2 pt-1" role="tablist">
        {tabs.map(tab => {
          const page = pages[tab.id]
          const title = page?.title || tab.target.label || labels.untitled
          const current = tab.id === activeId

          return (
            <div
              className={cn(
                'group flex h-8 max-w-56 min-w-0 items-center gap-1 rounded-t-lg border border-b-0 px-3 text-xs',
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
                title={page?.url || tab.target.url}
                type="button"
              >
                {title}
              </button>
              <button
                aria-label={labels.close}
                className="rounded p-0.5 opacity-0 hover:bg-(--ui-fill-tertiary) group-hover:opacity-100"
                onClick={() => closeRightRailTab(tab.id)}
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
          onClick={() => {
            newBrowserTab()
          }}
          title={labels.newTab}
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
                <PreviewTilePane onClose={() => closeRightRailTab(tab.id)} tabId={tab.id} />
              </PaneVisibleContext.Provider>
            </div>
          )
        })}
      </div>
    </div>
  )
}
