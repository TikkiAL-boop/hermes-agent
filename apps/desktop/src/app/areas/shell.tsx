import { useStore } from '@nanostores/react'
import { type ReactNode, useEffect, useState } from 'react'

import { hiddenPaneProps, PaneVisibleContext } from '@/components/pane-shell/pane-visibility'
import { cn } from '@/lib/utils'

import { AdminArea } from './admin'
import { BrowserArea } from './browser-area'
import { startMarkenwache } from './markenwache'
import { PostArea } from './post-area'
import { AreaRail } from './rail'
import { $area, type Area } from './store'
import { SuitesArea } from './suites/suites-area'
import { TerminalArea } from './terminal-area'
import { startVorzimmerWache } from './tikki/vorzimmer'

function AreaLayer({ active, children, id }: { active: boolean; children: ReactNode; id: Area }) {
  return (
    <div
      className={cn('absolute inset-0 flex min-h-0 min-w-0 flex-col', !active && 'invisible')}
      data-area={id}
      {...hiddenPaneProps(!active)}
    >
      <PaneVisibleContext.Provider value={active}>{children}</PaneVisibleContext.Provider>
    </div>
  )
}

/**
 * Rail on the left, one layer per area on the right. `children` is the chat
 * (the Hermes layout tree). Browser and terminal mount on first visit and stay
 * mounted afterwards; Post is cheap and mounts only while shown.
 */
export function AreaShell({ children }: { children: ReactNode }) {
  const area = useStore($area)

  const [visited, setVisited] = useState<Record<Area, boolean>>({
    admin: false,
    browser: false,
    post: false,
    suites: false,
    terminal: false,
    tikki: true
  })

  useEffect(() => {
    setVisited(prev => (prev[area] ? prev : { ...prev, [area]: true }))
  }, [area])

  // Tikki's room orders open suites wherever the person is standing.
  useEffect(() => startVorzimmerWache(), [])
  useEffect(() => startMarkenwache(), [])

  return (
    <div className="flex min-h-0 flex-1">
      <AreaRail />
      <div className="relative min-h-0 min-w-0 flex-1">
        <AreaLayer active={area === 'tikki'} id="tikki">
          {children}
        </AreaLayer>
        {area === 'suites' && (
          <AreaLayer active id="suites">
            <SuitesArea />
          </AreaLayer>
        )}
        {visited.browser && (
          <AreaLayer active={area === 'browser'} id="browser">
            <BrowserArea active={area === 'browser'} />
          </AreaLayer>
        )}
        {area === 'post' && (
          <AreaLayer active id="post">
            <PostArea />
          </AreaLayer>
        )}
        {visited.terminal && (
          <AreaLayer active={area === 'terminal'} id="terminal">
            <TerminalArea />
          </AreaLayer>
        )}
        {area === 'admin' && (
          <AreaLayer active id="admin">
            <AdminArea />
          </AreaLayer>
        )}
      </div>
    </div>
  )
}
