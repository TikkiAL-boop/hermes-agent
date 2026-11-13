import './tikki.css'

import { useStore } from '@nanostores/react'
import { type ReactNode, useEffect, useState } from 'react'

import { hiddenPaneProps, PaneVisibleContext } from '@/components/pane-shell/pane-visibility'
import { cn } from '@/lib/utils'

import { AdminArea } from './admin'
import { BrowserArea } from './browser-area'
import { startMarkenwache } from './markenwache'
import { PostArea } from './post-area'
import { AreaRail } from './rail'
import { $area, type Area, WINDOW_HAS_AREAS } from './store'
import { SuitesArea } from './suites/suites-area'
import { TerminalArea } from './terminal-area'
import { VorzimmerRahmen } from './tikki/vorzimmer-rahmen'

/**
 * The window has no titlebar; outside the Vorzimmer the Hermes tree (which
 * carries every drag region upstream) is hidden. The area on screen gets a
 * handle along its top edge — every area keeps that 1rem free — and only the
 * one on screen: a hidden layer must not leave a grip behind.
 */
function AreaLayer({ active, children, id }: { active: boolean; children: ReactNode; id: Area }) {
  return (
    <div
      className={cn('absolute inset-0 flex min-h-0 min-w-0 flex-col', !active && 'invisible')}
      data-area={id}
      {...hiddenPaneProps(!active)}
    >
      <PaneVisibleContext.Provider value={active}>{children}</PaneVisibleContext.Provider>
      {active && id !== 'tikki' && (
        <div aria-hidden className="tikki-fenstergriff absolute inset-x-0 top-0 h-4" data-fenstergriff="" />
      )}
    </div>
  )
}

/**
 * The Tikki shell around the chat (`children`, the Hermes layout tree). Only
 * the main window has areas: a session window shows its one session and stays
 * plain Hermes — no rail, no Vorzimmer frame, none of their background work.
 * The brand watch runs in both.
 */
export function AreaShell({ children }: { children: ReactNode }) {
  useEffect(() => startMarkenwache(), [])

  return WINDOW_HAS_AREAS ? <Areas>{children}</Areas> : <>{children}</>
}

/**
 * Rail on the left, one layer per area on the right. Browser mounts on first
 * visit and stays mounted afterwards; Post is cheap and mounts only while
 * shown. Terminal mounts only while shown: it holds no state of its own (the
 * shells live in the single `PersistentTerminal` overlay), and that overlay
 * can chase only ONE slot — a terminal area left mounted would keep the chat's
 * terminal pane blank.
 */
function Areas({ children }: { children: ReactNode }) {
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

  return (
    <div className="flex min-h-0 flex-1">
      <AreaRail />
      <div className="relative min-h-0 min-w-0 flex-1">
        <AreaLayer active={area === 'tikki'} id="tikki">
          <VorzimmerRahmen>{children}</VorzimmerRahmen>
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
        {area === 'terminal' && (
          <AreaLayer active id="terminal">
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
