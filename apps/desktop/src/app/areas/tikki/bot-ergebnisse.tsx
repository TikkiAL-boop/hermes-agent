import type { FC } from 'react'

import { MarkdownTextContent } from '@/components/assistant-ui/markdown-text'
import { MessageTimelineTimestamp } from '@/components/assistant-ui/thread/timeline-timestamp'
import { SCAFFOLD_LABEL_CLASS, SCAFFOLD_META_CLASS } from '@/components/chat/scaffold-row'
import { useI18n } from '@/i18n'
import { AlertCircle, CheckCircle2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import type { BotErgebnis, ErgebnisStatus } from './rollen'

function StatusGlyph({ label, status }: { label: string; status: ErgebnisStatus }) {
  if (status === 'fertig') {
    return <CheckCircle2 aria-label={label} className="size-3.5 text-emerald-600/85 dark:text-emerald-400/85" />
  }

  return (
    <AlertCircle
      aria-label={label}
      className={cn('size-3.5', status === 'fehler' ? 'text-destructive' : 'text-amber-600/90 dark:text-amber-400/90')}
    />
  )
}

/**
 * The round table: what each bot brought back, under its own name.
 *
 * A background delegation reports as one system notice with every child's
 * summary inside. Hermes folds that into a collapsed "2 background agents
 * finished" row; in a room the whole point is that everyone sees who did what,
 * so each report is its own open block with the role's icon and name.
 */
export const BotErgebnisse: FC<{ ergebnisse: BotErgebnis[]; text: string }> = ({ ergebnisse, text }) => {
  const { locale } = useI18n()
  const r = areaLabels(locale).raum

  const statusLabel: Record<ErgebnisStatus, string> = {
    fehler: r.fehler,
    fertig: r.fertig,
    unvollstaendig: r.unvollstaendig
  }

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-2 self-start py-1 pl-(--message-text-indent)"
      data-slot="tikki-bot-ergebnisse"
    >
      <div className="flex min-w-0 items-center gap-1.5" data-conversation-scaffold="">
        <span className={cn(SCAFFOLD_LABEL_CLASS, 'min-w-0 truncate')}>{text}</span> <MessageTimelineTimestamp />
      </div>
      {ergebnisse.map((ergebnis, index) => {
        const { rolle, titel } = ergebnis.auftrag
        const name = rolle?.name ?? `${r.bot} ${ergebnis.nummer ?? index + 1}`

        return (
          <article
            aria-label={`${name}: ${statusLabel[ergebnis.status]}`}
            className="grid min-w-0 max-w-full gap-1 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2"
            data-tikki-bot={rolle?.slug ?? ''}
            key={`${ergebnis.nummer ?? index}:${name}`}
          >
            <header className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="text-base leading-none">
                {rolle?.icon ?? '🤖'}
              </span>
              <span className="truncate text-sm font-semibold text-(--ui-text-primary)">{name}</span>
              <StatusGlyph label={statusLabel[ergebnis.status]} status={ergebnis.status} />
              {titel && <span className={cn(SCAFFOLD_META_CLASS, 'min-w-0 truncate')}>{titel}</span>}
            </header>
            {ergebnis.text && (
              <div className="max-h-96 min-w-0 max-w-full overflow-auto overscroll-x-contain overscroll-y-auto wrap-anywhere">
                <MarkdownTextContent isRunning={false} text={ergebnis.text} />
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
