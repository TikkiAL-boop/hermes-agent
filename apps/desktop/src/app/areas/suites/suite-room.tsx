import { useStore } from '@nanostores/react'
import { type ReactNode, useMemo } from 'react'

import { TileChat } from '@/app/chat/session-tile'
import { useSubagentSnapshot } from '@/app/chat/composer/status-stack/use-subagent-snapshot'
import { CenteredThreadSpinner } from '@/components/assistant-ui/thread/status'
import { useI18n } from '@/i18n'
import { AlertCircle, ArrowUpRight, CheckCircle2, FileText, Globe, ImageIcon, Link } from '@/lib/icons'
import { openExternalLink } from '@/lib/external-link'
import { todoTree } from '@/lib/todos'
import { useSessionSlice } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { artifactsForSession } from '@/store/artifacts'
import { $previewStatusBySession } from '@/store/preview-status'
import { $subagentsBySession, type SubagentProgress } from '@/store/subagents'
import { $retainedTodosBySession, $todosBySession } from '@/store/todos'

import { rolle } from '../admin/katalog'
import { areaLabels } from '../labels'
import { auftragAusText } from '../tikki/rollen'
import { type Ausgabe, ausgabenAusNachrichten, type Eingabe, eingabenAusNachrichten } from './suite-daten'
import { useSuiteRuntime } from './suite-runtime'
import { type Suite, SUITE_PROFIL, verlasseSuite } from './store'

const raumleiter = rolle(SUITE_PROFIL)

function Zone({ children, count, title }: { children: ReactNode; count?: number; title: string }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome)">
      <header className="flex items-center justify-between border-b border-(--ui-stroke-secondary) px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-(--ui-text-secondary) uppercase">{title}</h2>
        {count !== undefined && count > 0 && <span className="text-[11px] text-(--ui-text-secondary)">{count}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">{children}</div>
    </section>
  )
}

const Leer = ({ text }: { text: string }) => (
  <p className="py-4 text-center text-xs text-(--ui-text-secondary)">{text}</p>
)

/** The wall: the room lead's own to-do list, live while a turn runs, kept afterwards. */
function TodoWand({ runtimeId }: { runtimeId: string | null }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const live = useSessionSlice($todosBySession, runtimeId)
  const kept = useSessionSlice($retainedTodosBySession, runtimeId)
  const todos = live.length ? live : kept
  const rows = useMemo(() => todoTree(todos), [todos])
  const offen = todos.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length

  return (
    <Zone count={offen} title={s.todoWand}>
      {rows.length === 0 ? (
        <Leer text={s.leereTodos} />
      ) : (
        <ul className="flex flex-col gap-1" data-suite-todos="">
          {rows.map(([todo, depth]) => {
            const done = todo.status === 'completed'
            const cancelled = todo.status === 'cancelled'

            return (
              <li
                className={cn('flex items-start gap-2 text-sm', (done || cancelled) && 'text-(--ui-text-secondary)')}
                key={todo.id}
                style={{ paddingLeft: depth * 12 }}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 size-3 shrink-0 rounded-sm border',
                    done ? 'border-(--ui-accent) bg-(--ui-accent)' : 'border-(--ui-text-secondary)/60',
                    todo.status === 'in_progress' && 'border-(--ui-accent) bg-(--ui-accent)/30'
                  )}
                />
                <span className={cn('min-w-0 flex-1', cancelled && 'line-through')}>{todo.content}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Zone>
  )
}

function Stuhl({ bot }: { bot: SubagentProgress }) {
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const auftrag = auftragAusText(bot.goal)
  const r = auftrag.rolle
  const live = bot.status === 'running' || bot.status === 'queued'
  const status =
    bot.status === 'failed' || bot.status === 'interrupted'
      ? labels.raum.fehler
      : live
        ? labels.suites.arbeitet
        : labels.raum.fertig

  return (
    <li className="flex items-start gap-2 py-1" data-suite-stuhl={r?.slug ?? ''}>
      <span aria-hidden className="text-lg leading-none">
        {r?.icon ?? '🤖'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-(--ui-text-primary)">
          <span className="truncate">{r?.name ?? `${labels.raum.bot} ${bot.taskIndex + 1}`}</span>
          <span className={cn('text-[11px] font-normal', live ? 'text-(--ui-accent)' : 'text-(--ui-text-secondary)')}>
            {status}
          </span>
        </div>
        <div className="truncate text-xs text-(--ui-text-secondary)">{bot.currentTool || auftrag.titel}</div>
      </div>
    </li>
  )
}

/** Who is sitting at the table: the room lead always, then every bot it called in. */
function AmTisch({ runtimeId }: { runtimeId: string | null }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const bots = useSessionSlice($subagentsBySession, runtimeId)
  useSubagentSnapshot(runtimeId)

  return (
    <Zone count={bots.length + 1} title={s.amTisch}>
      <ul className="flex flex-col" data-suite-tisch="">
        {raumleiter && (
          <li className="flex items-start gap-2 py-1" data-suite-stuhl={raumleiter.slug}>
            <span aria-hidden className="text-lg leading-none">
              {raumleiter.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-(--ui-text-primary)">{raumleiter.name}</div>
              <div className="truncate text-xs text-(--ui-text-secondary)">
                {raumleiter.modell.primary} · {raumleiter.modell.fallback}
              </div>
            </div>
          </li>
        )}
        {bots.map(bot => (
          <Stuhl bot={bot} key={bot.id} />
        ))}
      </ul>
    </Zone>
  )
}

const EINGABE_ICON: Record<Eingabe['art'], typeof Globe> = {
  file: FileText,
  folder: FileText,
  image: ImageIcon,
  terminal: FileText,
  tool: FileText,
  url: Globe
}

/** What was handed in: attachments, files, links and folders from the people in the room. */
function DatenScreen({
  runtimeId,
  view
}: {
  runtimeId: string | null
  view: ReturnType<typeof useSuiteRuntime>['view']
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const messages = useStore(view?.$messages ?? EMPTY_MESSAGES)
  const cwd = useStore(view?.$cwd ?? EMPTY_TEXT)
  const eingaben = useMemo(() => eingabenAusNachrichten(messages), [messages])

  return (
    <Zone count={eingaben.length} title={s.daten}>
      {cwd && (
        <div className="mb-2 truncate font-mono text-[11px] text-(--ui-text-secondary)" title={cwd}>
          {cwd}
        </div>
      )}
      {eingaben.length === 0 ? (
        <Leer text={runtimeId ? s.leereDaten : s.laedt} />
      ) : (
        <ul className="flex flex-col gap-1" data-suite-daten="">
          {eingaben.map(eingabe => {
            const Icon = EINGABE_ICON[eingabe.art]

            return (
              <li
                className="flex items-center gap-2 text-xs text-(--ui-text-primary)"
                key={`${eingabe.art}:${eingabe.wert}`}
              >
                <Icon aria-hidden className="size-3.5 shrink-0 text-(--ui-text-secondary)" />
                <span className="min-w-0 truncate">{eingabe.wert}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Zone>
  )
}

const AUSGABE_ICON: Record<Ausgabe['art'], typeof Globe> = { bild: ImageIcon, datei: FileText, link: Link }

/** What came out: files written, links and images the bots reported, previews they started. */
function OutputScreen({
  runtimeId,
  storedId,
  view
}: {
  runtimeId: string | null
  storedId: string
  view: ReturnType<typeof useSuiteRuntime>['view']
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const messages = useStore(view?.$messages ?? EMPTY_MESSAGES)
  const previews = useSessionSlice($previewStatusBySession, runtimeId)
  const bots = useSessionSlice($subagentsBySession, runtimeId)
  const generated = artifactsForSession(storedId)

  const ausgaben = useMemo(() => {
    const seen = new Set<string>()
    const list: Ausgabe[] = []

    const add = (item: Ausgabe) => {
      if (!seen.has(item.wert)) {
        seen.add(item.wert)
        list.push(item)
      }
    }

    for (const preview of previews) {
      add({ art: /^https?:\/\//.test(preview.target) ? 'link' : 'datei', label: preview.label, wert: preview.target })
    }

    for (const record of generated) {
      add({ art: 'datei', label: record.title || record.slug, wert: `artifact:${record.id}` })
    }

    for (const bot of bots) {
      for (const file of bot.filesWritten) {
        add({
          art: /\.(?:png|jpe?g|gif|webp|svg)$/i.test(file) ? 'bild' : 'datei',
          label: file.split('/').pop() || file,
          wert: file
        })
      }
    }

    for (const item of ausgabenAusNachrichten(messages)) {
      add(item)
    }

    return list
  }, [bots, generated, messages, previews])

  return (
    <Zone count={ausgaben.length} title={s.output}>
      {ausgaben.length === 0 ? (
        <Leer text={runtimeId ? s.leereAusgabe : s.laedt} />
      ) : (
        <ul className="flex flex-col gap-1" data-suite-output="">
          {ausgaben.map(ausgabe => {
            const Icon = AUSGABE_ICON[ausgabe.art]
            const external = ausgabe.art === 'link'

            return (
              <li key={ausgabe.wert}>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-(--ui-text-primary) hover:bg-(--ui-fill-quinary) disabled:cursor-default"
                  disabled={!external}
                  onClick={() => openExternalLink(ausgabe.wert)}
                  title={ausgabe.wert}
                  type="button"
                >
                  <Icon aria-hidden className="size-3.5 shrink-0 text-(--ui-text-secondary)" />
                  <span className="min-w-0 flex-1 truncate">{ausgabe.label}</span>
                  {external && <ArrowUpRight aria-hidden className="size-3 shrink-0 text-(--ui-text-secondary)" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Zone>
  )
}

import { atom } from 'nanostores'
import type { ChatMessage } from '@/lib/chat-messages'

const EMPTY_MESSAGES = atom<ChatMessage[]>([])
const EMPTY_TEXT = atom('')

/**
 * The suite as a room: the round table (the chat) in the middle, the to-do
 * wall and the chairs on the left, the data screen and the output screen on
 * the right. Everything shown belongs to this one session and nothing else.
 */
export function SuiteRoom({ suite }: { suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const storedId = suite.resolvedId || suite.id
  const { fehler, ownerRoute, runtimeId, view } = useSuiteRuntime(storedId)
  const busy = useStore(view?.$busy ?? EMPTY_BUSY)

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-(--ui-bg-primary)" data-suite-room={storedId}>
      <header className="flex items-center gap-3 border-b border-(--ui-stroke-secondary) px-4 py-2">
        <button
          className="rounded-md px-2 py-1 text-xs text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary) hover:text-(--ui-text-primary)"
          onClick={verlasseSuite}
          type="button"
        >
          ← {s.zurueck}
        </button>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-(--ui-text-primary)">{suite.titel}</h1>
        {raumleiter && (
          <span className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
            <span aria-hidden>{raumleiter.icon}</span>
            {raumleiter.name}
            {busy && <span className="text-(--ui-accent)">· {s.arbeitet}</span>}
          </span>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[16rem_minmax(0,1fr)_18rem] gap-3 p-3">
        <div className="flex min-h-0 flex-col gap-3">
          <TodoWand runtimeId={runtimeId} />
          <AmTisch runtimeId={runtimeId} />
        </div>
        <div
          className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-primary)"
          data-suite-tisch-chat=""
        >
          {fehler ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-(--ui-text-primary)" role="alert">
              <AlertCircle aria-hidden className="mr-2 size-4 text-destructive" />
              {fehler}
            </div>
          ) : runtimeId && view ? (
            <TileChat ownerRoute={ownerRoute} runtimeId={runtimeId} storedSessionId={storedId} view={view} />
          ) : (
            <CenteredThreadSpinner />
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <DatenScreen runtimeId={runtimeId} view={view} />
          <OutputScreen runtimeId={runtimeId} storedId={storedId} view={view} />
        </div>
      </div>
    </div>
  )
}

const EMPTY_BUSY = atom(false)

// CheckCircle2 is imported for parity with the other zones' status glyphs.
void CheckCircle2
