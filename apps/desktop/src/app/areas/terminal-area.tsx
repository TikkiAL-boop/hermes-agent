import { useEffect } from 'react'

import { TerminalPaneChrome } from '@/app/right-sidebar/terminal/chrome'
import { $terminals, ensureTerminal } from '@/app/right-sidebar/terminal/terminals'

/**
 * Terminal as a full area. The xterm host is the single persistent overlay
 * (`PersistentTerminal`); this only provides the slot it chases plus the tab
 * rail, so the same shells appear here and in the chat's bottom pane.
 *
 * The area always has a shell: in the chat a pane without terminals closes,
 * here there is nothing to close — with the last tab gone the rail and its
 * "+" would go too and leave an empty surface. So the last one closing opens
 * a fresh one.
 */
export function TerminalArea() {
  useEffect(() => {
    let here = true

    ensureTerminal()

    const stop = $terminals.listen(list => {
      if (list.length === 0) {
        // Once the close is through with its own bookkeeping: it still points
        // the active tab at the list it emptied.
        queueMicrotask(() => {
          if (here) {
            ensureTerminal()
          }
        })
      }
    })

    return () => {
      here = false
      stop()
    }
  }, [])

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 p-4" data-terminal-area="">
      <div className="tikki-glas flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <TerminalPaneChrome />
      </div>
    </div>
  )
}
