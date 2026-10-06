import { useStore } from '@nanostores/react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react'

import { type Locale, useI18n } from '@/i18n'
import {
  Bell,
  Brain,
  Clock,
  Cpu,
  Download,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Volume2,
  VolumeX
} from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify } from '@/store/notifications'
import { $currentModel, $gatewayState } from '@/store/session'

import { rolle } from '../admin/katalog'
import { oeffneImBrowser } from '../browser-area'
import { areaLabels } from '../labels'
import { setArea } from '../store'
import { $neueSuiteOffen, $suites, $suitesBrauchen, ladeSuites, oeffneSuite, type Suite } from '../suites/store'
import { SuiteTafel, verlaufGruppen } from '../suites/suites-area'

import { $auftraege, $auftraegeStatus, type Auftrag, ladeAuftraege } from './auftraege'
import {
  briefingAbgeben,
  briefingGemerkt,
  briefingText,
  neueWhatsApps,
  setVorlesenAktiv,
  startBriefingAutomatik,
  startVorleser,
  ungeleseneMails,
  vorlesenAktiv,
  vorlesenStopp
} from './briefing'
import { $modellsuche, $modellsucheStatus, ladeModellsuche, modellZeile } from './modelle'
import { $updateStand, startUpdateWaechter } from './update-waechter'

const tikki = rolle('tikki')
const AUFTRAEGE_ALLE_MS = 60_000

function Karte({ children, icon: Icon, titel }: { children: ReactNode; icon: typeof Bell; titel: string }) {
  return (
    <section className="tikki-glas flex flex-col gap-2 p-3.5">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-(--tikki-tinte)">
        <Icon aria-hidden className="size-4 text-(--tikki-gelb-tief)" stroke={2} />
        {titel}
      </h2>
      {children}
    </section>
  )
}

function ModelleInhalt({
  locale,
  status,
  suche
}: {
  locale: Locale
  status: 'leer' | 'laedt' | 'bereit' | 'fehler'
  suche: ReturnType<typeof $modellsuche.get>
}) {
  const v = areaLabels(locale).vorzimmer
  const modelle = suche?.modelle ?? []
  const server = suche?.server ?? []

  if (status === 'laedt' || status === 'leer') {
    return (
      <p className="flex items-center gap-2 text-[12px] text-(--tikki-tinte-weich)" data-vorzimmer-modelle="sucht">
        <Loader2 aria-hidden className="size-3.5 animate-spin" />
        {v.modelleSuche}
      </p>
    )
  }

  if (status === 'fehler') {
    return (
      <p className="text-[12px] text-(--tikki-tinte-weich)" data-vorzimmer-modelle="fehler">
        {v.modelleFehler}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1.5" data-vorzimmer-modelle={modelle.length}>
      {server.map(s => (
        <p className="text-[12px] text-(--tikki-tinte)" data-vorzimmer-modellserver={s.adresse} key={s.adresse}>
          <span className="font-semibold">{v.modelleServer(s.art)}</span>{' '}
          <span className="text-(--tikki-tinte-weich)">{s.modelle.length ? s.modelle.join(', ') : s.adresse}</span>
        </p>
      ))}
      {modelle.length === 0 && server.length === 0 && (
        <p className="text-[12px] text-(--tikki-tinte-weich)">{v.keineModelle}</p>
      )}
      {modelle.length > 0 && (
        <ul className="flex flex-col gap-1">
          {modelle.slice(0, 6).map(m => (
            <li className="flex flex-col" key={m.pfad}>
              <span className="truncate text-[12px] text-(--tikki-tinte)">{m.name}</span>
              <span className="text-[11px] text-(--tikki-tinte-weich)">
                {modellZeile(m)} · {m.quelle}
              </span>
            </li>
          ))}
        </ul>
      )}
      {modelle.length > 6 && (
        <p className="text-[11px] text-(--tikki-tinte-weich)">{v.modelleWeitere(modelle.length - 6)}</p>
      )}
      {suche?.empfehlung.raeume && (
        <p className="text-[11px] text-(--tikki-tinte-weich)">
          {v.modelleVorschlag(suche.empfehlung.raeume, suche.empfehlung.sprache ?? suche.empfehlung.raeume)}
        </p>
      )}
      <p className="text-[11px] text-(--tikki-tinte-weich)">{v.modelleHinweis}</p>
    </div>
  )
}

function SuiteKnopf({ suite, hinweis }: { suite: Suite; hinweis?: string }) {
  return (
    <button
      className="tikki-knopf tikki-knopf-still w-full px-2.5 py-1.5 text-left"
      data-vorzimmer-suite={suite.id}
      onClick={() => oeffneSuite(suite)}
      type="button"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{suite.titel}</span>
        {hinweis && <span className="truncate text-[11px] text-(--tikki-tinte-weich)">{hinweis}</span>}
      </span>
    </button>
  )
}

/** The address line: a web address or a search, and the whole app becomes the browser. */
function Adresszeile() {
  const { locale } = useI18n()
  const b = areaLabels(locale).browser
  const [wert, setWert] = useState('')

  const los = (event: FormEvent) => {
    event.preventDefault()

    if (wert.trim()) {
      oeffneImBrowser(wert)
      setWert('')
    }
  }

  return (
    <form
      className="tikki-glas flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5"
      data-vorzimmer-adresse=""
      onSubmit={los}
    >
      <Globe aria-hidden className="size-4 shrink-0 text-(--tikki-tinte-weich)" stroke={2} />
      <input
        aria-label={b.adresse}
        className="w-full min-w-0 bg-transparent text-sm text-(--tikki-tinte) outline-none placeholder:text-(--tikki-tinte-weich)"
        inputMode="url"
        onChange={e => setWert(e.target.value)}
        placeholder={b.adresse}
        value={wert}
      />
    </form>
  )
}

/** "in 3 Min.", "vor 2 Std." – relative to now, in the person's language. */
function relativ(zeit: number, locale: string): string {
  const diff = zeit - Date.now()
  const abs = Math.abs(diff)
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  if (abs < 60_000) {
    return fmt.format(Math.round(diff / 1000), 'second')
  }

  if (abs < 3_600_000) {
    return fmt.format(Math.round(diff / 60_000), 'minute')
  }

  if (abs < 86_400_000) {
    return fmt.format(Math.round(diff / 3_600_000), 'hour')
  }

  return fmt.format(Math.round(diff / 86_400_000), 'day')
}

/** The left wall: every room, the ones that need the person first. */
function Raumwand({ suites, wartend }: { suites: Suite[]; wartend: readonly string[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [suche, setSuche] = useState('')

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()

    return q ? suites.filter(x => x.titel.toLowerCase().includes(q) || x.brauche?.toLowerCase().includes(q)) : suites
  }, [suche, suites])

  const braucht = (suite: Suite) => wartend.includes(suite.id)

  const gruppen = verlaufGruppen(gefiltert).sort((a, b) => Number(braucht(b.suite)) - Number(braucht(a.suite)))

  return (
    <aside
      className="tikki-wand tikki-wand-links flex min-h-0 flex-col gap-2.5 @max-[72rem]/vorzimmer:hidden"
      data-vorzimmer-raeume=""
    >
      <label className="tikki-glas flex items-center gap-2 px-3 py-1.5">
        <Search aria-hidden className="size-4 text-(--tikki-tinte-weich)" stroke={2} />
        <input
          aria-label={s.suchen}
          className="w-full bg-transparent text-[13px] text-(--tikki-tinte) outline-none placeholder:text-(--tikki-tinte-weich)"
          onChange={e => setSuche(e.target.value)}
          placeholder={s.suchen}
          value={suche}
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        {gruppen.length === 0 ? (
          <p className="tikki-glas px-3 py-6 text-center text-[12px] text-(--tikki-tinte-weich)">{s.leer}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {gruppen.map(({ suite, uebungen }) => (
              <SuiteTafel braucht={braucht(suite)} key={suite.id} suite={suite} uebungen={uebungen} />
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function AuftragZeile({ auftrag, locale }: { auftrag: Auftrag; locale: Locale }) {
  const v = areaLabels(locale).vorzimmer

  return (
    <li className="flex flex-col" data-vorzimmer-auftrag={auftrag.id}>
      <span className={cn('truncate text-[13px] font-medium text-(--tikki-tinte)', !auftrag.aktiv && 'opacity-60')}>
        {auftrag.name}
      </span>
      <span className="truncate text-[11px] text-(--tikki-tinte-weich)">
        {auftrag.plan}
        {!auftrag.aktiv
          ? ` · ${v.pausiert}`
          : auftrag.naechster
            ? ` · ${v.naechster(relativ(auftrag.naechster, locale))}`
            : ''}
      </span>
    </li>
  )
}

/**
 * The overview, where everyone arrives: Tikki's chat in the middle, every room
 * on the left wall, and on the right what she does for the person — the
 * briefing, her standing orders, rooms that wait, which AI is talking, the
 * door to a new room, and whether Tikki has an update. The chat inside is the
 * unchanged Hermes layout tree.
 */
export function VorzimmerRahmen({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const v = labels.vorzimmer
  const suites = useStore($suites)
  const wartend = useStore($suitesBrauchen)
  const modell = useStore($currentModel)
  const update = useStore($updateStand)
  const auftraege = useStore($auftraege)
  const auftraegeStatus = useStore($auftraegeStatus)
  const modellsuche = useStore($modellsuche)
  const modellsucheStatus = useStore($modellsucheStatus)
  const [vorlesen, setVorlesen] = useState(vorlesenAktiv)
  const [sammle, setSammle] = useState(false)

  // The lists are the backend's truth: read them once the gateway is open, and again whenever it reopens.
  useEffect(
    () =>
      $gatewayState.subscribe(state => {
        if (state === 'open') {
          void ladeSuites()
          void ladeAuftraege()

          // Once per start: which models lie on the backend machine and which server answers.
          if ($modellsucheStatus.get() === 'leer') {
            void ladeModellsuche()
          }
        }
      }),
    []
  )
  useEffect(() => {
    const timer = window.setInterval(() => {
      if ($gatewayState.get() === 'open') {
        void ladeAuftraege()
      }
    }, AUFTRAEGE_ALLE_MS)

    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => startVorleser(), [])
  useEffect(() => startUpdateWaechter(), [])

  const braucht = suites.filter(s => wartend.includes(s.id))
  const zuletzt = suites.slice(0, 3)

  const briefing = async () => {
    setSammle(true)

    try {
      const [mails, chats] = await Promise.all([ungeleseneMails(), neueWhatsApps()])
      const text = briefingText({ chats, datum: new Date(), mails, wartend: braucht, zuletzt })

      if (briefingAbgeben(text)) {
        briefingGemerkt()
      } else {
        notify({ kind: 'warning', message: v.keinChat })
      }
    } finally {
      setSammle(false)
    }
  }

  useEffect(() => startBriefingAutomatik(briefing), []) // eslint-disable-line react-hooks/exhaustive-deps

  const vorlesenUmschalten = () => {
    const an = !vorlesen
    setVorlesen(an)
    setVorlesenAktiv(an)

    if (!an) {
      vorlesenStopp()
    }
  }

  return (
    <div className="tikki-boden @container/vorzimmer flex min-h-0 min-w-0 flex-1 flex-col" data-vorzimmer="">
      <header className="flex items-center gap-4 px-5 pt-4 pr-40 pb-3">
        <span className="tikki-wortmarke shrink-0">
          <b>tikki</b>
          <span>{v.titel}</span>
        </span>
        <Adresszeile />
        <button
          className="tikki-knopf tikki-knopf-still shrink-0 px-3 py-1.5 text-[13px] font-medium"
          onClick={() => setArea('admin')}
          type="button"
        >
          <Settings aria-hidden className="size-4" stroke={1.9} />
          {v.einstellungen}
        </button>
      </header>
      {/* The Hermes chat keeps the width it measures itself against: narrower walls under 88rem,
          walls folded away under 72rem (the person still has Suites and Admin in the rail). */}
      <div className="tikki-buehne grid min-h-0 flex-1 grid-cols-[15rem_minmax(0,1fr)_17rem] gap-4 px-5 pb-5 @max-[88rem]/vorzimmer:grid-cols-[12rem_minmax(0,1fr)_14rem] @max-[72rem]/vorzimmer:grid-cols-[minmax(0,1fr)]">
        <Raumwand suites={suites} wartend={wartend} />
        <div className="tikki-glas tikki-hermes-glas flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</div>
        <aside className="tikki-wand tikki-wand-rechts flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5 @max-[72rem]/vorzimmer:hidden">
          <div className="flex gap-2">
            <button
              className="tikki-knopf flex-1 px-3 py-2 text-[13px] font-semibold disabled:opacity-70"
              data-vorzimmer-briefing=""
              disabled={sammle}
              onClick={() => void briefing()}
              type="button"
            >
              {sammle ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Bell aria-hidden className="size-4" stroke={2} />
              )}
              {sammle ? v.briefingLaeuft : v.briefing}
            </button>
            <button
              aria-label={`${v.vorlesen}: ${vorlesen ? v.vorlesenAn : v.vorlesenAus}`}
              aria-pressed={vorlesen}
              className={cn('tikki-knopf px-3 py-2', !vorlesen && 'tikki-knopf-still')}
              data-vorzimmer-vorlesen={vorlesen ? 'an' : 'aus'}
              onClick={vorlesenUmschalten}
              type="button"
            >
              {vorlesen ? (
                <Volume2 aria-hidden className="size-4" stroke={2} />
              ) : (
                <VolumeX aria-hidden className="size-4" stroke={2} />
              )}
            </button>
          </div>
          {update && update.neueCommits > 0 && (
            <div
              className="tikki-glas flex flex-col gap-1.5 border-(--tikki-gelb) p-3.5"
              data-vorzimmer-update=""
              role="status"
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-(--tikki-tinte)">
                <Download aria-hidden className="size-4 text-(--tikki-gelb-tief)" stroke={2} />
                {v.update}
              </span>
              <p className="text-[12px] text-(--tikki-tinte-weich)">
                {v.updateText(update.neueCommits, update.version ?? '')}
              </p>
              <p className="text-[11px] text-(--tikki-tinte-weich)">{v.updateBefehl}</p>
              <code className="rounded bg-(--tikki-creme)/70 px-1.5 py-1 font-mono text-[11px] text-(--tikki-tinte)">
                tikki/werkzeuge/hermes-aktualisieren.sh
              </code>
            </div>
          )}
          <Karte icon={RefreshCw} titel={v.auftraege}>
            {auftraege.length === 0 ? (
              <p className="text-[12px] text-(--tikki-tinte-weich)" data-vorzimmer-auftraege="leer">
                {auftraegeStatus === 'fehler' ? v.auftraegeFehler : v.keineAuftraege}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-vorzimmer-auftraege={auftraege.length}>
                {auftraege.slice(0, 6).map(a => (
                  <AuftragZeile auftrag={a} key={a.id} locale={locale} />
                ))}
              </ul>
            )}
            <p className="text-[11px] text-(--tikki-tinte-weich)">{v.auftraegeHinweis}</p>
          </Karte>
          <Karte icon={Cpu} titel={v.modelle}>
            <ModelleInhalt locale={locale} status={modellsucheStatus} suche={modellsuche} />
          </Karte>
          <Karte icon={Bell} titel={v.brauchtDich}>
            {braucht.length === 0 ? (
              <p className="text-[12px] text-(--tikki-tinte-weich)">{v.keinerWartet}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {braucht.map(s => (
                  <SuiteKnopf hinweis={s.brauche ?? labels.suites.wartetAufDich} key={s.id} suite={s} />
                ))}
              </div>
            )}
          </Karte>
          <Karte icon={Clock} titel={v.zuletztBesucht}>
            {zuletzt.length === 0 ? (
              <p className="text-[12px] text-(--tikki-tinte-weich)">{v.keineBesuche}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {zuletzt.map(s => (
                  <SuiteKnopf key={s.id} suite={s} />
                ))}
              </div>
            )}
          </Karte>
          <Karte icon={Brain} titel={v.gespraechsKi}>
            {modell && (
              <p className="text-[13px] text-(--tikki-tinte)">
                <span className="text-(--tikki-tinte-weich)">{v.geradeImChat}: </span>
                <span className="font-mono text-[12px]">{modell}</span>
              </p>
            )}
            {tikki && (
              <p className="text-[12px] text-(--tikki-tinte-weich)">
                {v.imVorzimmer}: <span className="font-mono">{tikki.modell.primary}</span> ·{' '}
                <span className="font-mono">{tikki.modell.fallback}</span>
              </p>
            )}
          </Karte>
          <button
            className="tikki-knopf px-3.5 py-3 text-left"
            data-vorzimmer-neue-suite=""
            onClick={() => {
              $neueSuiteOffen.set(true)
              setArea('suites')
            }}
            type="button"
          >
            <Plus aria-hidden className="size-5" stroke={2} />
            <span className="flex flex-col">
              <span className="text-[13px] font-semibold">{v.neueSuite}</span>
              <span className="text-[11px] opacity-75">{v.neueSuiteHinweis}</span>
            </span>
          </button>
        </aside>
      </div>
    </div>
  )
}
