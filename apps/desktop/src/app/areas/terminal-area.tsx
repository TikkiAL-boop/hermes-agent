import { useEffect } from 'react'

import { TerminalPaneChrome } from '@/app/right-sidebar/terminal/chrome'
import { ensureTerminal } from '@/app/right-sidebar/terminal/terminals'

/**
 * Terminal as a full area. The xterm host is the single persistent overlay
 * (`PersistentTerminal`); this only provides the slot it chases plus the tab
 * rail, so the same shells appear here and in the chat's bottom pane.
 */
export function TerminalArea() {
  useEffect(() => {
    ensureTerminal()
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-(--ui-bg-chrome)" data-terminal-area="">
      <TerminalPaneChrome />
    </div>
  )
}
