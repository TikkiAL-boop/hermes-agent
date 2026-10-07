import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { BotErgebnisse } from './bot-ergebnisse'
import { botErgebnisse } from './rollen'

// The timeline stamp reads assistant-ui message state; this view is rendered bare.
vi.mock('@/components/assistant-ui/thread/timeline-timestamp', () => ({ MessageTimelineTimestamp: () => null }))

afterEach(cleanup)

const envelope = [
  '[ASYNC DELEGATION BATCH COMPLETE — d-1]',
  'intro',
  '',
  '--- ✓ TASK 1/2: AN: rechercheur\nAUFGABE: Ferienhäuser finden  (status=completed) ---',
  'Zwei Häuser gefunden: **Möwe** und Düne.',
  '',
  '--- ✗ TASK 2/2: Einladung schreiben  (status=failed) ---',
  '(failed: timeout)'
].join('\n')

describe('BotErgebnisse', () => {
  it('shows every report open, under the role name or a numbered bot, with its status', () => {
    const ergebnisse = botErgebnisse(envelope)!

    const { container, getByLabelText, getByText } = render(
      <I18nProvider configClient={null} initialLocale="de">
        <BotErgebnisse ergebnisse={ergebnisse} text="2 Bots fertig" />
      </I18nProvider>
    )

    expect(getByText('Rechercheur')).toBeTruthy()
    expect(getByText('Bot 2/2')).toBeTruthy()
    expect(getByLabelText('Rechercheur: Fertig')).toBeTruthy()
    expect(getByLabelText('Bot 2/2: Fehlgeschlagen')).toBeTruthy()
    // Reports are visible without a click: the room is a round table.
    expect(container.textContent).toContain('Zwei Häuser gefunden')
    expect(container.querySelector('[data-tikki-bot="rechercheur"]')?.textContent).toContain('Zwei Häuser gefunden')
    expect(container.querySelector('[data-tikki-bot=""]')?.textContent).toContain('(failed: timeout)')
  })
})
