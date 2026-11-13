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

import { useVoiceRecorder } from '@/app/chat/composer/hooks/use-voice-recorder'
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
  Mic,
  MicOff,
  Search,
  Send,
  ShieldLock,
  Users,
  Volume2,
  VolumeX
} from '@/lib/icons'
import { cn } from '@/lib/utils'
import { $gatewayState } from '@/store/session'

import { KATALOG, rolle } from '../admin/katalog'
import { areaLabels } from '../labels'
import { setArea } from '../store'
import { $auftraege, ladeAuftraege, raumZeitplan } from '../tikki/auftraege'
import {
  neuVorzulesen,
  setVorlesenAktiv,
  sprich,
  transkribieren,
  VORLESEN_RAUM,
  vorlesenAktiv,
  vorlesenStopp
} from '../tikki/stimme'

import { ladeRueckfragen, type Rueckfrage, rueckfrageBeantworten } from './rueckfragen'
import {
  $suiteEntsteht,
  $suites,
  $suitesFehler,
  auftragGeben,
  brauchtDich,
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
  type Offen,
  type RaumEreignis,
  RAUMLEITER,
  type Suite,
  suiteStand,
  verlasseSuite,
  verschmelzen,
  werArbeitet,
  wiederholen
} from './store'
import { type Ausgabe, ausgabenAusNachrichten, type Eingabe, eingabenAusNachrichten } from './suite-daten'

/** The log is pulled: the gateway has no push for rooms. */
const POLL_MS = 2000
/** Longest microphone take in the room; the same cap the composer applies by default. */
const MIKRO_SEKUNDEN = 120

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

const NICHTS_OFFEN: Offen = { freigaben: [], rueckfragen: [], wiederholbar: [] }

interface RaumLog {
  /**
   * Where the log's end was when the room had been read up to it; null until then. Everything up
   * to this seq is history — however many stages it took to load — everything after it is new.
   */
  eingeholtBei: number | null
  events: RaumEreignis[]
  fehler: string | null
  geladen: boolean
  nachladen: () => Promise<void>
  /** What the backend reports as waiting for the person: approvals, questions, failed turns. */
  offen: Offen
}

/**
 * The room's log, pulled every two seconds while the room is mounted: all
 * pages on the first read, then only what came after the cursor. What waits
 * for the person rides along as backend state (driver status, open questions).
 */
function useRaumLog(suite: Suite): RaumLog {
  const [events, setEvents] = useState<RaumEreignis[]>([])
  const [offen, setOffen] = useState<Offen>(NICHTS_OFFEN)
  const [fehler, setFehler] = useState<string | null>(null)
  const [geladen, setGeladen] = useState(false)
  // A long log arrives in stages; all of them are history, the one that reaches the end included.
  const [eingeholtBei, setEingeholtBei] = useState<number | null>(null)
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
      const [seite, stand, rueckfragen] = await Promise.all([
        ladeVerlauf(suite.id, cursor.current.seq),
        ladeStand(suite.id).catch(() => undefined),
        ladeRueckfragen()
      ])

      if (seite.events.length) {
        cursor.current = { id: suite.id, seq: seite.cursor }
        setEvents(alt => {
          const bekannt = new Set(alt.map(e => e.seq))

          return [...alt, ...seite.events.filter(e => !bekannt.has(e.seq))]
        })
      }

      setOffen(alt => {
        const neu = suiteStand({ id: suite.id }, stand?.driver_status, rueckfragen).offen

        return JSON.stringify(neu) === JSON.stringify(alt) ? alt : neu
      })
      setFehler(null)
      setGeladen(true)

      if (seite.cursor >= seite.latestSeq) {
        setEingeholtBei(alt => alt ?? seite.cursor)
      }
    } catch (error) {
      setFehler(fehlertext(error))
    } finally {
      laeuft.current = false
    }
  }, [suite.id])

  useEffect(() => {
    setEvents([])
    setOffen(NICHTS_OFFEN)
    setGeladen(false)
    setEingeholtBei(null)
    void nachladen()
    const timer = window.setInterval(() => void nachladen(), POLL_MS)

    return () => window.clearInterval(timer)
  }, [nachladen])

  return { eingeholtBei, events, fehler, geladen, nachladen, offen }
}

const alsChatMessages = (messages: readonly Nachricht[]): ChatMessage[] =>
  messages.map(m => ({
    id: `raum-${m.seq}`,
    parts: [{ type: 'text', text: m.text }],
    role: m.von === MENSCH ? 'user' : 'assistant'
  }))

const sprecherIcon = (von: string): string => (von === MENSCH ? '🧑' : (rolle(von)?.icon ?? '🤖'))

/** Who is sitting at the table: every member of the room, the one whose turn runs marked. */
function AmTisch({ arbeitet, mitglieder }: { arbeitet?: string; mitglieder: readonly Mitglied[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites

  return (
    <Zone count={mitglieder.length} title={s.amTisch}>
      <ul className="flex flex-col" data-suite-tisch="">
        {mitglieder.map(m => {
          const r = KATALOG.find(x => x.hermes_profil === m.profile) ?? rolle(m.member_id)
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

/**
 * Badges in the room header, each one backend state: the room's Hermes schedule (from the cron
 * list) and whether something waits for the person (approvals, questions, failed turns).
 */
function RaumMarken({ offen, suite }: { offen: Offen; suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const zeitplan = raumZeitplan(useStore($auftraege), suite.id)

  useEffect(() => {
    void ladeAuftraege()
  }, [suite.id])

  return (
    <>
      {zeitplan && (
        <span
          className={cn(
            'tikki-knopf gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
            !zeitplan.aktiv && 'tikki-knopf-still'
          )}
          data-suite-takt-marke={zeitplan.plan}
        >
          <Clock aria-hidden className="size-3" />
          {s.dauerauftrag} · {zeitplan.plan}
          {!zeitplan.aktiv && ` · ${s.zeitplanPausiert}`}
        </span>
      )}
      {brauchtDich(offen) && (
        <span
          className="tikki-knopf rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
          data-braucht="true"
          data-suite-brauche=""
        >
          {s.brauchtDich}
        </span>
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

/** A member's open question (`clarify`): the person picks a choice or types the answer, right here. */
function RueckfrageKarte({ frage, nachladen }: { frage: Rueckfrage; nachladen: () => Promise<void> }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [antworten, setAntworten] = useState<Record<string, string>>({})
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  // A single question is one part without an id; a batch brings its own parts.
  const teile = frage.teile.length ? frage.teile : [{ auswahl: frage.auswahl, frage: frage.frage, id: '' }]
  const vollstaendig = teile.every(t => (antworten[t.id] ?? '').trim())

  const senden = async (werte: Record<string, string>) => {
    if (sendet) {
      return
    }

    setSendet(true)

    try {
      await rueckfrageBeantworten(frage, frage.teile.length ? werte : (werte[''] ?? ''))
      setFehler(null)
    } catch (error) {
      setFehler(fehlertext(error))
    } finally {
      setSendet(false)
      await nachladen()
    }
  }

  return (
    <li
      className="tikki-glas tikki-glas-dicht flex flex-col gap-2 px-3 py-2 text-sm"
      data-suite-rueckfrage={frage.anfrage}
    >
      <form
        className="flex flex-col gap-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          void senden(antworten)
        }}
      >
        {teile.map(teil => (
          <div className="flex flex-col gap-1.5" key={teil.id}>
            <span>
              <b>{s.rueckfrage}</b> · {teil.frage}
            </span>
            {teil.auswahl.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {teil.auswahl.map(wahl => (
                  <button
                    aria-pressed={antworten[teil.id] === wahl}
                    className={cn(
                      'tikki-knopf px-2.5 py-1 text-xs disabled:opacity-60',
                      antworten[teil.id] !== wahl && 'tikki-knopf-still'
                    )}
                    disabled={sendet}
                    key={wahl}
                    onClick={() =>
                      teile.length === 1
                        ? void senden({ [teil.id]: wahl })
                        : setAntworten(alt => ({ ...alt, [teil.id]: wahl }))
                    }
                    type="button"
                  >
                    {wahl}
                  </button>
                ))}
              </div>
            )}
            <input
              aria-label={s.rueckfrageAntwort}
              className="tikki-feld text-sm"
              onChange={e => setAntworten(alt => ({ ...alt, [teil.id]: e.target.value }))}
              placeholder={s.rueckfrageAntwort}
              value={antworten[teil.id] ?? ''}
            />
          </div>
        ))}
        {fehler && (
          <p className="text-xs text-destructive" role="alert">
            {fehler}
          </p>
        )}
        <button
          className="tikki-knopf self-end px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
          disabled={sendet || !vollstaendig}
          type="submit"
        >
          {s.rueckfrageSenden}
        </button>
      </form>
    </li>
  )
}

/**
 * What waits for the person in this room, as the backend reports it: a member asks to run
 * something (once or no), a member asks a question, a turn failed and can be started again.
 */
function Anliegen({ nachladen, offen, suite }: { nachladen: () => Promise<void>; offen: Offen; suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const { freigaben, rueckfragen, wiederholbar } = offen

  if (!brauchtDich(offen)) {
    return null
  }

  const ausfuehren = async (key: string, aktion: () => Promise<unknown>) => {
    setLaeuft(key)

    try {
      await aktion()
    } catch {
      // The next poll shows whether the matter is still open.
    } finally {
      setLaeuft(null)
      await nachladen()
    }
  }

  const antworten = (f: Freigabe, choice: 'once' | 'deny') =>
    ausfuehren(`${f.member_id}:${f.request_id}`, () => freigeben(suite, f, choice))

  return (
    <ul className="flex flex-col gap-2 border-b border-(--tikki-glas-rand) px-4 py-2" data-suite-freigaben="">
      {rueckfragen.map(frage => (
        <RueckfrageKarte frage={frage} key={frage.anfrage} nachladen={nachladen} />
      ))}
      {wiederholbar.map(aktion => (
        <li
          className="tikki-glas tikki-glas-dicht flex flex-wrap items-center gap-2 px-3 py-2 text-sm"
          data-suite-wiederholen={aktion.task_id}
          key={`retry:${aktion.task_id}`}
        >
          <AlertCircle aria-hidden className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate">{s.rundeGescheitert}</span>
          <button
            className="tikki-knopf px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
            disabled={laeuft === `retry:${aktion.task_id}`}
            onClick={() => void ausfuehren(`retry:${aktion.task_id}`, () => wiederholen(suite, aktion))}
            type="button"
          >
            {s.rundeNochmal}
          </button>
        </li>
      ))}
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

/** The person's seat: Enter sends, the name goes in front on its own; the microphone dictates into the field. */
function Sprechen({ nachladen, suite }: { nachladen: () => Promise<void>; suite: Suite }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [text, setText] = useState('')
  const [sendet, setSendet] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const feld = useRef<HTMLTextAreaElement | null>(null)

  // The Hermes composer's own dictation hook: one press records, the next (or
  // silence/cap) stops and transcribes; the words land in the field, never sent.
  const { dictate, voiceStatus } = useVoiceRecorder({
    focusInput: () => feld.current?.focus(),
    maxRecordingSeconds: MIKRO_SEKUNDEN,
    onTranscribeAudio: async audio => {
      try {
        return await transkribieren(audio)
      } catch (error) {
        setFehler(fehlertext(error))
        throw error
      }
    },
    onTranscript: wort => {
      setFehler(null)
      setText(alt => (alt.trim() ? `${alt.trimEnd()} ${wort}` : wort))
    }
  })

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
          ref={feld}
          rows={1}
          value={text}
        />
        <button
          aria-label={
            voiceStatus === 'recording' ? s.mikroStopp : voiceStatus === 'transcribing' ? s.mikroSchreibt : s.mikro
          }
          aria-pressed={voiceStatus === 'recording'}
          className={cn(
            'tikki-knopf px-3 py-2 disabled:opacity-60',
            voiceStatus === 'idle' && 'tikki-knopf-still',
            voiceStatus === 'recording' && 'animate-pulse'
          )}
          data-suite-mikro={voiceStatus}
          disabled={sendet || voiceStatus === 'transcribing'}
          onClick={dictate}
          type="button"
        >
          {voiceStatus === 'transcribing' ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : voiceStatus === 'recording' ? (
            <MicOff aria-hidden className="size-4" />
          ) : (
            <Mic aria-hidden className="size-4" />
          )}
        </button>
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
 * table with the log in the middle, who sits at the table on the left, the
 * data and output screens on the right. Everything here belongs to this one
 * room and nothing else.
 */
export function SuiteRoom({ suite }: { suite: Suite }) {
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const s = labels.suites
  const v = labels.vorzimmer
  const { eingeholtBei, events, fehler, geladen, nachladen, offen } = useRaumLog(suite)

  const messages = useMemo(
    () => events.map(e => nachrichtAus(e, suite.mitglieder)).filter((m): m is Nachricht => m !== undefined && !m.still),
    [events, suite.mitglieder]
  )

  const chat = useMemo(() => alsChatMessages(messages), [messages])
  const arbeitet = useMemo(() => werArbeitet(events), [events])
  const [vorlesen, setVorlesen] = useState(() => vorlesenAktiv(VORLESEN_RAUM))
  // Where reading stands in this room (the room is mounted per suite). It starts where the log's
  // end was when the room had caught up, so a room's history is never read back — neither its
  // first page nor the later stages of a long log; from then on every new word of the lead is.
  const gelesen = useRef<number | null>(null)

  // eslint-disable-next-line no-restricted-syntax -- reading cursor advanced per poll, not an atom mirror
  useEffect(() => {
    if (eingeholtBei === null) {
      return
    }

    const { seq, texte } = neuVorzulesen(messages, gelesen.current ?? eingeholtBei)
    gelesen.current = seq

    if (vorlesen && texte.length > 0) {
      void sprich(texte.join('\n'))
    }
  }, [eingeholtBei, messages, vorlesen])

  useEffect(() => () => vorlesenStopp(), [])

  const vorlesenUmschalten = () => {
    const an = !vorlesen
    setVorlesen(an)
    setVorlesenAktiv(VORLESEN_RAUM, an)

    if (!an) {
      vorlesenStopp()
    }
  }

  return (
    <div className="tikki-raum flex min-h-0 min-w-0 flex-1 flex-col" data-suite-room={suite.id}>
      <header className="tikki-glas mx-6 mt-9 flex items-center gap-3 px-4 py-2">
        <button className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs" onClick={verlasseSuite} type="button">
          ← {s.zurueck}
        </button>
        <h1 className="min-w-0 truncate text-base font-semibold text-(--ui-text-primary)">{suite.titel}</h1>
        <RaumMarken offen={offen} suite={suite} />
        <Tueren aktuell={suite} />
        <Verschmelzen aktuell={suite} />
        <button
          aria-label={`${s.vorlesen}: ${vorlesen ? v.vorlesenAn : v.vorlesenAus}`}
          aria-pressed={vorlesen}
          className={cn('tikki-knopf px-2.5 py-1 text-xs', !vorlesen && 'tikki-knopf-still')}
          data-suite-vorlesen={vorlesen ? 'an' : 'aus'}
          onClick={vorlesenUmschalten}
          type="button"
        >
          {vorlesen ? <Volume2 aria-hidden className="size-3.5" /> : <VolumeX aria-hidden className="size-3.5" />}
        </button>
        <span className="flex-1" />
        {raumleiter && (
          <span className="flex items-center gap-1.5 text-xs text-(--ui-text-secondary)">
            <span aria-hidden>{raumleiter.icon}</span>
            {raumleiter.name}
            {arbeitet && <span className="text-(--ui-accent)">· {s.arbeitet}</span>}
          </span>
        )}
      </header>
      <div className="tikki-buehne grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_17rem] gap-6 px-6 pt-5 pb-6">
        <div className="tikki-wand tikki-wand-links flex min-h-0 flex-col gap-3">
          <AmTisch arbeitet={arbeitet} mitglieder={suite.mitglieder} />
        </div>
        <div
          className="tikki-glas tikki-glas-dicht tikki-tischplatte mx-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2rem] border-(--tikki-gelb)/60 shadow-[0_0_56px_-8px_var(--tikki-glow-stark)]"
          data-suite-tisch-chat=""
        >
          <Anliegen nachladen={nachladen} offen={offen} suite={suite} />
          <Tisch
            arbeitet={arbeitet}
            fehler={fehler}
            geladen={geladen}
            messages={messages}
            mitglieder={suite.mitglieder}
          />
          <Sprechen nachladen={nachladen} suite={suite} />
        </div>
        <div className="tikki-wand tikki-wand-rechts flex min-h-0 flex-col gap-3">
          <DatenScreen geladen={geladen} messages={chat} />
          <OutputScreen geladen={geladen} messages={chat} />
        </div>
      </div>
      <Grundbesatzung />
    </div>
  )
}

/**
 * Doors to the other rooms: what the person types here is their own message in that room (it goes
 * to its lead unless it addresses someone); walking through keeps each room whole.
 */
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
      await auftragGeben(ziel, text)
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
  // Why the last attempt in THIS room did not happen; both rooms are still there then.
  const [fehler, setFehler] = useState<string | null>(null)
  const andere = suites.filter(x => x.id !== aktuell.id)

  const los = async () => {
    if (!wahl) {
      return
    }

    setFehler(null)

    if (await verschmelzen(aktuell, wahl)) {
      setOffen(false)
      setWahl(null)
    } else {
      setFehler($suitesFehler.get())
    }
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
          {fehler && (
            <p className="text-xs text-destructive" data-suite-verschmelzen-fehler="" role="alert">
              {fehler}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs"
              onClick={() => {
                setOffen(false)
                setWahl(null)
                setFehler(null)
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
    <nav
      aria-label={r.besatzung}
      className="tikki-podest flex items-center justify-center gap-6 px-6 pb-4"
      data-suite-besatzung=""
    >
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
