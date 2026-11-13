import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $backendCustomCSS, __resetBackendSkinSync, ingestBackendSkin } from './backend-sync'
import { ThemeProvider, useTheme } from './context'
import { DEFAULT_SKIN_NAME } from './presets'
import { useSkinCommand } from './use-skin-command'

describe('/skin', () => {
  let skin: ReturnType<typeof useSkinCommand>
  let theme: ReturnType<typeof useTheme>

  function Probe() {
    skin = useSkinCommand()
    theme = useTheme()

    return null
  }

  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )
  })

  afterEach(cleanup)

  it('`default` paints the app default — the look a fresh install has', () => {
    const fresh = theme.themeName

    act(() => void skin('mono'))
    expect(theme.themeName).toBe('mono')

    act(() => void skin('default'))
    expect(theme.themeName).toBe(fresh)
    expect(theme.themeName).toBe(DEFAULT_SKIN_NAME)
  })

  it("`default` lands on the name the backend's default skin keeps its CSS under", () => {
    // A user skin file named `default` carries customCSS; it is filed under the
    // resolved default. `/skin default` must paint that name, or the CSS never applies.
    ingestBackendSkin({ customCSS: 'body { background: red; }', name: 'default' } as never, { apply: false })
    const [filedUnder] = Object.keys($backendCustomCSS.get())

    act(() => void skin('mono'))
    act(() => void skin('default'))

    expect(theme.themeName).toBe(filedUnder)
  })
})
