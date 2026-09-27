import { useI18n } from '@/i18n'
import { Mail } from '@/lib/icons'

import { areaLabels } from './labels'

/** Mail area. The real client (IMAP/SMTP against the family mail server)
 *  lands here next; this is the empty state so the area already has a home. */
export function PostArea() {
  const { locale } = useI18n()
  const labels = areaLabels(locale).post

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-(--ui-bg-primary)" data-post-area="">
      <aside className="flex w-64 shrink-0 flex-col border-r border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-3">
        <div className="text-sm font-semibold text-(--ui-text-primary)">{labels.title}</div>
        <div className="mt-2 rounded-md bg-(--ui-accent)/15 px-2 py-1.5 text-sm text-(--ui-accent)">{labels.inbox}</div>
      </aside>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-(--ui-text-secondary)">
        <Mail aria-hidden className="size-10 opacity-60" stroke={1.5} />
        <p className="max-w-md text-sm">{labels.comingSoon}</p>
      </div>
    </div>
  )
}
