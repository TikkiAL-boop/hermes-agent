import { useStore } from '@nanostores/react'
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { CenteredThreadSpinner } from '@/components/assistant-ui/thread/status'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import type { ChatMessage } from '@/lib/chat-messages'
import { openExternalLink } from '@/lib/external-link'
import {
  AlertCircle,
  ArrowUpRight,
  Brain,
  Clock,
  Eye,
  FileText,
  Globe,
  ImageIcon,
  Link,
  Loader2,
  Search,
  Send,
  ShieldLock,
  Users
} from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $gatewayState } from '@/store/session'

import { rolle } from '../admin/katalog'
import { areaLabels } from '../labels'
import { setArea } from '../store'

import {
  $suiteEntsteht,
  $suites,
  aufgabenWand,
  auftragGeben,
  brauchtAus,
  fehlertext,
  type Freigabe,
  freigeben,
  ladeStand,
  ladeVerlauf,
  MENSCH,
  type Mitglied,
  type Nachricht,
  nachrichtAus,
  oeffneSuite,
  type RaumEreignis,
  RAUMLEITER,
  standAus,
  type Suite,
  tuerSenden,
  verlasseSuite,
  verschmelzen,
  werArbeitet
} from './store'
import {
  type Ausgabe,
  ausgabenAusNachrichten,
  type Eingabe,
  eingabenAusNachrichten,
  taktAusNachrichten
} from './suite-daten'
import { uebungsTeil } from './uebung'

/** The log is pulled: the gateway has no push for rooms. */
const POLL_MS = 2000

const raumleiter = rolle(RAUMLEITER)

function Zone({ children, count, title }: { children: ReactNode; count?: number; title: string }) {
  return (
    <section className="tikki-glas flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-(--tikki-glas-rand) px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-(--tikki-tinte-weich) uppercase">{title}</h2>
        {count !== undefined && count > 0 && <span className="text-[11px] text-(--ui-text-secondary)">{count}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">{children}</div>
    </section>
  )
}

const Leer = ({ text }: { text: string }) => (
  <p className="py-4 text-center text-xs text-(--ui-text-secondary)">{text}</p>
)

interface RaumLog {
  events: RaumEreignis[]
  fehler: string | null
  freigaben: Freigabe[]
  geladen: boolean
  nachladen: () => Promise<void>
}

/**
 * The room's log, pulled every two seconds while the room is mounted: all
 * pages on the first read, then only what came after the cursor. Pending
 * approvals ride along from the driver status.
 */
function useRaumLog(suite: Suite): RaumLog {
  const [events, setEvents] = useState<RaumEreignis[]>([])
  const [freigaben, setFreigaben] = useState<Freigabe[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [geladen, setGeladen] = useState(false)
  // The replay cursor belongs to one room; a different room starts over at the beginning.
  const cursor = useRef({ id: suite.id, seq: 0 })
  const laeuft = useRef(false)

  const nachladen = useCallback(async () => {
    if (laeuft.current || $gatewayState.get() !== 'open') {
      return
    }

    if (cursor.current.id !== suite.id) {
      cursor.current = { id: suite.id, seq: 0 }
    }

    laeuft.current = true

    try {
      const [seite, stand] = await Promise.all([
        ladeVerlauf(suite.id, cursor.current.seq),
        ladeStand(suite.id).catch(() => undefined)
      ])

      if (seite.events.length) {
        cursor.current = { id: suite.id, seq: seite.cursor }
        setEvents(alt => {
          const bekannt = new Set(alt.map(e => e.seq))

          return [...alt, ...seite.events.filter(e => !bekannt.has(e.seq))]
        })
      }

      setFreigaben(alt => {
        const neu = (stand?.driver_status?.pending_actions ?? []).filter(a => a.kind === 'approval')

        return JSON.stringify(neu) === JSON.stringify(alt) ? alt : neu
      })
      setFehler(null)
      setGeladen(true)
    } catch (error) {
      setFehler(fehlertext(error))
    } finally {
      laeuft.current = false
    }
  }, [suite.id])

  useEffect(() => {
    setEvents([])
    setGeladen(false)
    void nachladen()
    const timer = window.setInterval(() => void nachladen(), POLL_MS)

    return () => window.clearInterval(timer)
  }, [nachladen])

  return { events, fehler, freigaben, geladen, nachladen }
}

const alsChatMessages = (messages: readonly Nachricht[]): ChatMessage[] =>
  messages.map(m => ({
    id: `raum-${m.seq}`,
    parts: [{ type: 'text', text: m.text }],
    role: m.von === MENSCH ? 'user' : 'assistant'
  }))

const sprecherIcon = (von: string): string => (von === MENSCH ? '🧑' : (rolle(von)?.icon ?? '🤖'))

/** The wall: the room lead's own task list, from its latest `AUFGABEN:` block. */
function TodoWand({ messages }: { messages: readonly Nachricht[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const aufgaben = useMemo(() => aufgabenWand(messages), [messages])
  const offen = aufgaben.filter(a => !a.erledigt).length

  return (
    <Zone count={offen} title={s.todoWand}>
      {aufgaben.length === 0 ? (
        <Leer text={s.leereTodos} />
      ) : (
        <ul className="flex flex-col gap-1" data-suite-todos="">
          {aufgaben.map((aufgabe, i) => (
            <li
              className={cn('flex items-start gap-2 text-sm', aufgabe.erledigt && 'text-(--ui-text-secondary)')}
              key={`${i}:${aufgabe.text}`}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-1 size-3 shrink-0 rounded-sm border',
                  aufgabe.erledigt ? 'border-(--ui-accent) bg-(--ui-accent)' : 'border-(--ui-text-secondary)/60'
                )}
              />
              <span className="min-w-0 flex-1">{aufgabe.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Zone>
  )
}

/** Who is sitting at the table: every member of the room, the one whose turn runs marked. */
function AmTisch({ arbeitet, mitglieder }: { arbeitet?: string; mitglieder: readonly Mitglied[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites

  return (
    <Zone count={mitglieder.length} title={s.amTisch}>
      <ul className="flex flex-col" data-suite-tisch="">
        {mitglieder.map(m => {
          const r = rolle(m.member_id)
          const live = arbeitet === m.member_id

          return (
            <li
              className="flex items-start gap-2 py-1"
              data-suite-arbeitet={live ? 'true' : undefined}
              data-suite-stuhl={m.member_id}
              key={m.member_id}
            >
              <span aria-hidden className="text-lg leading-none">
                {r?.icon ?? '🤖'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-(--ui-text-primary)">
                  <span className="truncate">{m.display_name || r?.name || m.handle}</span>
                  {live && <span className="text-[11px] font-normal text-(--ui-accent)">{s.arbeitet}</span>}
                </div>
                <div className="truncate text-xs text-(--ui-text-secondary)">
                  {r ? `${r.modell.primary} · ${r.modell.fallback}` : m.profile}
                </div>
              </div>
            </li>
          )
        })}
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

/** What was handed in: files, links and folders the people in the room named. */
function DatenScreen({ geladen, messages }: { geladen: boolean; messages: readonly ChatMessage[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const eingaben = useMemo(() => eingabenAusNachrichten(messages), [messages])

  return (
    <Zone count={eingaben.length} title={s.daten}>
      {eingaben.length === 0 ? (
        <Leer text={geladen ? s.leereDaten : s.laedt} />
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

/** What came out: links, files and images the members reported. */
function OutputScreen({ geladen, messages }: { geladen: boolean; messages: readonly ChatMessage[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const ausgaben = useMemo(() => ausgabenAusNachrichten(messages), [messages])

  return (
    <Zone count={ausgaben.length} title={s.output}>
      {ausgaben.length === 0 ? (
        <Leer text={geladen ? s.leereAusgabe : s.laedt} />
      ) : (
        <ul className="flex flex-col gap-1" data-suite-output="">
          {ausgaben.map(ausgabe => {
            const Icon = AUSGABE_ICON[ausgabe.art]
            const external = ausgabe.art === 'link'

            return (
              <li key={ausgabe.wert}>
                <Tip label={ausgabe.wert}>
                  <button
                    className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs text-(--ui-text-primary) hover:bg-(--ui-fill-quinary) disabled:cursor-default"
                    disabled={!external}
                    onClick={() => openExternalLink(ausgabe.wert)}
                    type="button"
                  >
                    <Icon aria-hidden className="size-3.5 shrink-0 text-(--ui-text-secondary)" />
                    <span className="min-w-0 flex-1 truncate">{ausgabe.label}</span>
                    {external && <ArrowUpRight aria-hidden className="size-3 shrink-0 text-(--ui-text-secondary)" />}
                  </button>
                </Tip>
              </li>
            )
          })}
        </ul>
      )}
    </Zone>
  )
}

/** Badges in the room header: a standing schedule, which practice run this is, the room lead's stand. */
function RaumMarken({
  brauche,
  messages,
  stand,
  suite
}: {
  brauche?: string
  messages: readonly ChatMessage[]
  stand?: string
  suite: Suite
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const takt = useMemo(() => taktAusNachrichten(messages), [messages])
  const teil = uebungsTeil(suite.titel)

  return (
    <>
      {takt && (
        <span
          className="tikki-knopf gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          data-suite-takt-marke={takt}
        >
          <Clock aria-hidden className="size-3" />
          {s.dauerauftrag} · {takt}
        </span>
      )}
      {teil && (
        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-(--ui-text-secondary)">
          {s.uebungslauf(teil.nr)}
        </span>
      )}
      {brauche && (
        <Tip label={brauche}>
          <span
            className="tikki-knopf max-w-56 truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            data-braucht="true"
            data-suite-brauche=""
          >
            {s.brauchtDich} · {brauche}
          </span>
        </Tip>
      )}
      {!brauche && stand && (
        <Tip label={stand}>
          <span
            className="max-w-56 truncate rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-(--ui-text-secondary)"
            data-suite-stand=""
          >
            {s.stand} · {stand}
          </span>
        </Tip>
      )}
    </>
  )
}

const freigabeText = (f: Freigabe): string => {
  const a = f.approval ?? {}

  return [a.tool, a.command, a.description ?? a.summary ?? a.prompt]
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .join(' · ')
}

/** A member asks to run something: the person says once or no, right here in the room. */
function Freigaben({
  freigaben,
  nachladen,
  suite
}: {
  freigaben: Freigabe[]
  nachladen: () => Promise<void>
  suite: Suite
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [laeuft, setLaeuft] = useState<string | null>(null)

  if (freigaben.length === 0) {
    return null
  }

  const antworten = async (f: Freigabe, choice: 'once' | 'deny') => {
    const key = `${f.member_id}:${f.request_id}`
    setLaeuft(key)

    try {
      await freigeben(suite, f, choice)
    } catch {
      // The next poll shows whether the request is still pending.
    } finally {
      setLaeuft(null)
      await nachladen()
    }
  }

  return (
    <ul className="flex flex-col gap-2 border-b border-(--tikki-glas-rand) px-4 py-2" data-suite-freigaben="">
      {freigaben.map(f => {
        const key = `${f.member_id}:${f.request_id}`
        const name = suite.mitglieder.find(m => m.member_id === f.member_id)?.display_name ?? f.member_id ?? ''

        return (
          <li className="tikki-glas tikki-glas-dicht flex flex-wrap items-center gap-2 px-3 py-2 text-sm" key={key}>
            <ShieldLock aria-hidden className="size-4 shrink-0 text-(--tikki-gelb-tief)" />
            <span className="min-w-0 flex-1 truncate">
              <b>{name}</b> {s.freigabe}
              {freigabeText(f) && <span className="text-(--ui-text-secondary)"> · {freigabeText(f)}</span>}
            </span>
            <button
              className="tikki-knopf px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
              disabled={laeuft === key}
              onClick={() => void antworten(f, 'once')}
              type="button"
            >
              {s.freigabeEinmal}
            </button>
            <button
              className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs disabled:opacity-60"
              disabled={laeuft === key}
              onClick={() => void antworten(f, 'deny')}
              type="button"
            >
              {s.freigabeAblehnen}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const zeit = (sekunden: number, locale: string): string =>
  new Date(sekunden * 1000).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

/** The round table: everything said in the room, the person included, newest at the bottom. */
function Tisch({
  arbeitet,
  fehler,
  geladen,
  messages,
  mitglieder
}: {
  arbeitet?: string
  fehler: string | null
  geladen: boolean
  messages: readonly Nachricht[]
  mitglieder: readonly Mitglied[]
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const ende = useRef<HTMLDivElement | null>(null)
  const denkt = arbeitet ? (mitglieder.find(m => m.member_id === arbeitet)?.display_name ?? arbeitet) : undefined

  useEffect(() => {
    ende.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, denkt])

  if (fehler && !geladen) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-(--ui-text-primary)" role="alert">
        <AlertCircle aria-hidden className="mr-2 size-4 text-destructive" />
        {fehler}
      </div>
    )
  }

  if (!geladen) {
    return <CenteredThreadSpinner />
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" data-suite-log="">
      {messages.length === 0 && <Leer text={s.keineNachrichten} />}
      <ol className="flex flex-col gap-3">
        {messages.map(m => (
          <li
            className={cn('flex gap-2.5', m.von === MENSCH && 'flex-row-reverse text-right')}
            data-suite-nachricht={m.von}
            key={m.seq}
          >
            <span aria-hidden className="mt-0.5 text-xl leading-none">
              {sprecherIcon(m.von)}
            </span>
            <div className={cn('min-w-0 max-w-[80%] flex-col gap-0.5', m.von === MENSCH ? 'flex items-end' : 'flex')}>
              <div className="flex items-baseline gap-2 text-[11px] text-(--ui-text-secondary)">
                <span className="font-semibold text-(--ui-text-primary)">{m.name}</span>
                <span>{zeit(m.zeit, locale)}</span>
              </div>
              <div
                className={cn(
                  'rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap text-(--ui-text-primary)',
                  m.von === MENSCH ? 'tikki-knopf rounded-tr-sm' : 'tikki-glas tikki-glas-dicht rounded-tl-sm'
                )}
              >
                {m.text}
              </div>
            </div>
          </li>
        ))}
        {denkt && (
          <li className="flex items-center gap-2 text-xs text-(--ui-text-secondary)" data-suite-denkt={arbeitet}>
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
            {s.denkt(denkt)}
          </li>
        )}
      </ol>
      <div ref={ende} />
    </div>
  )
}

/** The person's seat: Enter sends, the name goes in front on its own. */
function Sprechen({ nachladen, suite }: { nachladen: () => Promise<void>; suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [text, setText] = useState('')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  const senden = async () => {
    const wert = text.trim()

    if (!wert || sendet) {
      return
    }

    setSendet(true)

    try {
      await auftragGeben(suite, wert)
      setText('')
      setFehler(null)
      await nachladen()
    } catch (error) {
      setFehler(fehlertext(error))
    } finally {
      setSendet(false)
    }
  }

  const taste = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void senden()
    }
  }

  return (
    <form
      className="flex flex-col gap-1 border-t border-(--tikki-glas-rand) px-4 py-3"
      data-suite-eingabe=""
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        void senden()
      }}
    >
      {fehler && (
        <p className="text-xs text-destructive" role="alert">
          {fehler}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          aria-label={s.schreiben}
          className="tikki-feld max-h-40 min-h-10 flex-1 resize-none text-sm"
          onChange={e => setText(e.target.value)}
          onKeyDown={taste}
          placeholder={s.schreiben}
          rows={1}
          value={text}
        />
        <button
          aria-label={s.senden}
          className="tikki-knopf px-3 py-2 disabled:opacity-60"
          disabled={!text.trim() || sendet}
          type="submit"
        >
          {sendet ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
        </button>
      </div>
    </form>
  )
}

/**
 * The room: walls you can see (the background is the room itself), the round
 * table with the log in the middle, the to-do wall and who sits at the table
 * on the left, the data and output screens on the right. Everything here
 * belongs to this one room and nothing else.
 */
export function SuiteRoom({ suite }: { suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const { events, fehler, freigaben, geladen, nachladen } = useRaumLog(suite)
  const teil = uebungsTeil(suite.titel)

  const messages = useMemo(
    () => events.map(e => nachrichtAus(e, suite.mitglieder)).filter((m): m is Nachricht => m !== undefined && !m.still),
    [events, suite.mitglieder]
  )

  const chat = useMemo(() => alsChatMessages(messages), [messages])
  const arbeitet = useMemo(() => werArbeitet(events), [events])
  const brauche = useMemo(() => brauchtAus(messages), [messages])
  const stand = useMemo(() => standAus(messages), [messages])

  return (
    <div className="tikki-raum flex min-h-0 min-w-0 flex-1 flex-col" data-suite-room={suite.id}>
      <header className="tikki-glas mx-6 mt-9 flex items-center gap-3 px-4 py-2">
        <button className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs" onClick={verlasseSuite} type="button">
          ← {s.zurueck}
        </button>
        <h1 className="min-w-0 truncate text-base font-semibold text-(--ui-text-primary)">
          {teil ? teil.basis : suite.titel}
        </h1>
        <RaumMarken brauche={brauche} messages={chat} stand={stand} suite={suite} />
        <Tueren aktuell={suite} />
        <Verschmelzen aktuell={suite} />
        <span className="flex-1" />
        {raumleiter && (
          <span className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
            <span aria-hidden>{raumleiter.icon}</span>
            {raumleiter.name}
            {arbeitet && <span className="text-(--ui-accent)">· {s.arbeitet}</span>}
          </span>
        )}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_17rem] gap-6 px-6 pt-5 pb-6">
        <div className="flex min-h-0 flex-col gap-3">
          <TodoWand messages={messages} />
          <AmTisch arbeitet={arbeitet} mitglieder={suite.mitglieder} />
        </div>
        <div
          className="tikki-glas tikki-glas-dicht mx-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] border-(--tikki-gelb)/60 shadow-[0_0_56px_-8px_var(--tikki-glow-stark)]"
          data-suite-tisch-chat=""
        >
          <Freigaben freigaben={freigaben} nachladen={nachladen} suite={suite} />
          <Tisch
            arbeitet={arbeitet}
            fehler={fehler}
            geladen={geladen}
            messages={messages}
            mitglieder={suite.mitglieder}
          />
          <Sprechen nachladen={nachladen} suite={suite} />
        </div>
        <div className="flex min-h-0 flex-col gap-3">
          <DatenScreen geladen={geladen} messages={chat} />
          <OutputScreen geladen={geladen} messages={chat} />
        </div>
      </div>
      <Grundbesatzung />
    </div>
  )
}

/** Doors to the other rooms: a word through the door reaches that room's lead; walking through keeps each room whole. */
function Tueren({ aktuell }: { aktuell: Suite }) {
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const r = labels.raum
  const s = labels.suites
  const suites = useStore($suites)
  const [offen, setOffen] = useState(false)
  const [ziel, setZiel] = useState<Suite | null>(null)
  const [text, setText] = useState('')
  const [sendet, setSendet] = useState(false)
  const [gesendet, setGesendet] = useState<string | null>(null)
  const andere = suites.filter(x => x.id !== aktuell.id)

  const schliessen = () => {
    setOffen(false)
    setZiel(null)
    setText('')
  }

  const senden = async (event: FormEvent) => {
    event.preventDefault()

    if (!ziel || !text.trim() || sendet) {
      return
    }

    setSendet(true)

    try {
      await tuerSenden(aktuell, ziel, text)
      setGesendet(ziel.titel)
      schliessen()
    } catch {
      // The door stays open; the person can try again.
    } finally {
      setSendet(false)
    }
  }

  return (
    <div className="relative">
      <button
        aria-expanded={offen}
        className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs"
        data-suite-tueren=""
        onClick={() => (offen ? schliessen() : setOffen(true))}
        type="button"
      >
        {r.tueren}
      </button>
      {gesendet && !offen && (
        <span className="ml-2 text-[11px] text-(--ui-text-secondary)" role="status">
          {s.tuerGesendet(gesendet)}
        </span>
      )}
      {offen && !ziel && (
        <ul className="tikki-glas tikki-glas-dicht absolute top-full left-0 z-20 mt-1 flex max-h-72 w-64 flex-col gap-1 overflow-y-auto p-2">
          {andere.length === 0 && <li className="px-2 py-1 text-xs text-(--tikki-tinte-weich)">{r.keineTueren}</li>}
          {andere.map(x => (
            <li key={x.id}>
              <button
                className="tikki-knopf tikki-knopf-still w-full px-2.5 py-1.5 text-left text-xs"
                data-suite-tuer={x.id}
                onClick={() => setZiel(x)}
                type="button"
              >
                {x.titel}
              </button>
            </li>
          ))}
        </ul>
      )}
      {offen && ziel && (
        <form
          className="tikki-glas tikki-glas-dicht absolute top-full left-0 z-20 mt-1 flex w-80 flex-col gap-2 p-3"
          data-suite-tuer-form={ziel.id}
          onSubmit={e => void senden(e)}
        >
          <div className="text-xs font-semibold text-(--ui-text-primary)">{s.tuerNach(ziel.titel)}</div>
          <textarea
            aria-label={s.tuerText}
            autoFocus
            className="tikki-feld min-h-16 text-sm"
            onChange={e => setText(e.target.value)}
            placeholder={s.tuerPlatzhalter}
            value={text}
          />
          <div className="flex items-center justify-between gap-2">
            <button
              className="text-[11px] font-medium text-(--tikki-gelb-tief) hover:underline"
              onClick={() => {
                schliessen()
                oeffneSuite(ziel)
              }}
              type="button"
            >
              {s.tuerBetreten}
            </button>
            <span className="flex-1" />
            <button className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs" onClick={schliessen} type="button">
              {s.abbrechen}
            </button>
            <button
              className="tikki-knopf px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
              disabled={!text.trim() || sendet}
              type="submit"
            >
              {s.tuerSenden}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Two rooms become one: pick the other, confirm, stand in the new one. */
function Verschmelzen({ aktuell }: { aktuell: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const suites = useStore($suites)
  const entsteht = useStore($suiteEntsteht)
  const [offen, setOffen] = useState(false)
  const [wahl, setWahl] = useState<Suite | null>(null)
  const andere = suites.filter(x => x.id !== aktuell.id)

  const los = async () => {
    if (!wahl) {
      return
    }

    setOffen(false)
    await verschmelzen(aktuell, wahl)
    setWahl(null)
  }

  return (
    <div className="relative">
      <button
        aria-expanded={offen}
        className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs disabled:opacity-60"
        data-suite-verschmelzen=""
        disabled={Boolean(entsteht)}
        onClick={() => setOffen(o => !o)}
        type="button"
      >
        {entsteht ? (
          <Loader2 aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Users aria-hidden className="size-3.5" />
        )}
        {s.verschmelzen}
      </button>
      {offen && (
        <div className="tikki-glas tikki-glas-dicht absolute top-full left-0 z-20 mt-1 flex w-80 flex-col gap-2 p-3">
          <p className="text-xs text-(--ui-text-secondary)">{s.verschmelzenHinweis}</p>
          {andere.length === 0 ? (
            <p className="px-1 py-1 text-xs text-(--tikki-tinte-weich)">{areaLabels(locale).raum.keineTueren}</p>
          ) : (
            <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {andere.map(x => (
                <li key={x.id}>
                  <button
                    aria-pressed={wahl?.id === x.id}
                    className="tikki-knopf tikki-knopf-still w-full px-2.5 py-1.5 text-left text-xs"
                    data-aktiv={wahl?.id === x.id ? 'true' : undefined}
                    data-suite-verschmelzen-mit={x.id}
                    onClick={() => setWahl(x)}
                    type="button"
                  >
                    {x.titel}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs"
              onClick={() => {
                setOffen(false)
                setWahl(null)
              }}
              type="button"
            >
              {s.abbrechen}
            </button>
            <button
              className="tikki-knopf px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
              disabled={!wahl}
              onClick={() => void los()}
              type="button"
            >
              {wahl ? s.verschmelzenMit(wahl.titel) : s.verschmelzen}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The room's base crew along the floor: who is in every room, whatever the project. */
function Grundbesatzung() {
  const { locale } = useI18n()
  const r = areaLabels(locale).raum

  const mitglieder = [
    {
      icon: Search,
      key: 'raumleiter' as const,
      onClick: () => document.querySelector<HTMLElement>('[data-suite-eingabe] textarea')?.focus()
    },
    { icon: Brain, key: 'gedaechtnis' as const, onClick: () => setArea('admin') },
    { icon: Eye, key: 'wachhalter' as const, onClick: () => setArea('admin') },
    { icon: ShieldLock, key: 'pruefer' as const, onClick: () => setArea('admin') },
    { icon: Globe, key: 'suche' as const, onClick: () => setArea('browser') }
  ]

  return (
    <nav aria-label={r.besatzung} className="flex items-center justify-center gap-6 px-6 pb-4" data-suite-besatzung="">
      {mitglieder.map(({ icon: Icon, key, onClick }) => (
        <button
          className="flex flex-col items-center gap-1 text-[11px] font-medium text-(--tikki-tinte) hover:text-(--tikki-gelb-tief)"
          key={key}
          onClick={onClick}
          type="button"
        >
          <span className="tikki-knopf tikki-knopf-still flex size-11 items-center justify-center rounded-full">
            <Icon aria-hidden className="size-5" stroke={1.9} />
          </span>
          {r.besatzungRollen[key]}
        </button>
      ))}
    </nav>
  )
}
