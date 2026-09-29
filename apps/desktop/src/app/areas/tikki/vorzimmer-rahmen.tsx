import { useStore } from '@nanostores/react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { Bell, Brain, Clock, Download, Globe, Loader2, Plus, Settings, Volume2, VolumeX } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify } from '@/store/notifications'
import { $currentModel, $gatewayState } from '@/store/session'
import { $attentionSessionIds } from '@/store/session-states'

import { rolle } from '../admin/katalog'
import { oeffneImBrowser } from '../browser-area'
import { areaLabels } from '../labels'
import { setArea } from '../store'
import { $neueSuiteOffen, $suites, ladeSuites, oeffneSuite, type Suite } from '../suites/store'

import {
  briefingAbgeben,
  briefingText,
  neueWhatsApps,
  setVorlesenAktiv,
  startVorleser,
  ungeleseneMails,
  vorlesenAktiv,
  vorlesenStopp
} from './briefing'
import { $updateStand, startUpdateWaechter } from './update-waechter'

const tikki = rolle('tikki')

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

function SuiteKnopf({ suite, hinweis }: { suite: Suite; hinweis?: string }) {
  return (
    <button
      className="tikki-knopf tikki-knopf-still w-full px-2.5 py-1.5 text-left"
      data-vorzimmer-suite={suite.id}
      onClick={() => void oeffneSuite(suite)}
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

/**
 * The reception around the Hermes chat: the wordmark and the address line
 * above, the chat itself in glass, and beside it what the person wants at a
 * glance — the daily briefing, which AI is talking, the last suites, which
 * room waits for them, the door to a new one, and whether Tikki has an update.
 * The chat inside is the unchanged Hermes layout tree.
 */
export function VorzimmerRahmen({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const labels = areaLabels(locale)
  const v = labels.vorzimmer
  const suites = useStore($suites)
  const wartend = useStore($attentionSessionIds)
  const modell = useStore($currentModel)
  const update = useStore($updateStand)
  const [vorlesen, setVorlesen] = useState(vorlesenAktiv)
  const [sammle, setSammle] = useState(false)

  // The list is the backend's truth: read it once the gateway is open, and again whenever it reopens.
  useEffect(
    () =>
      $gatewayState.subscribe(state => {
        if (state === 'open') {
          void ladeSuites()
        }
      }),
    []
  )
  useEffect(() => startVorleser(), [])
  useEffect(() => startUpdateWaechter(), [])

  const braucht = suites.filter(s => wartend.includes(s.id) || (s.resolvedId ? wartend.includes(s.resolvedId) : false))
  const zuletzt = suites.slice(0, 3)

  const briefing = async () => {
    setSammle(true)

    try {
      const [mails, chats] = await Promise.all([ungeleseneMails(), neueWhatsApps()])
      const text = briefingText({ chats, datum: new Date(), mails, wartend: braucht, zuletzt })

      if (!briefingAbgeben(text)) {
        notify({ kind: 'warning', message: v.keinChat })
      }
    } finally {
      setSammle(false)
    }
  }

  const vorlesenUmschalten = () => {
    const an = !vorlesen
    setVorlesen(an)
    setVorlesenAktiv(an)

    if (!an) {
      vorlesenStopp()
    }
  }

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 flex-col" data-vorzimmer="">
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
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-4 px-5 pb-5">
        <div className="tikki-glas tikki-hermes-glas flex min-h-0 min-w-0 flex-col overflow-hidden">{children}</div>
        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
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
          <Karte icon={Bell} titel={v.brauchtDich}>
            {braucht.length === 0 ? (
              <p className="text-[12px] text-(--tikki-tinte-weich)">{v.keinerWartet}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {braucht.map(s => (
                  <SuiteKnopf hinweis={labels.suites.wartetAufDich} key={s.id} suite={s} />
                ))}
              </div>
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
