import { useStore } from '@nanostores/react'
import { type ReactNode, useEffect } from 'react'

import { useI18n } from '@/i18n'
import { Bell, Brain, Clock, Plus, Settings } from '@/lib/icons'
import { $currentModel, $gatewayState } from '@/store/session'
import { $attentionSessionIds } from '@/store/session-states'

import { rolle } from '../admin/katalog'
import { areaLabels } from '../labels'
import { setArea } from '../store'
import { $neueSuiteOffen, $suites, ladeSuites, oeffneSuite, type Suite } from '../suites/store'

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

/**
 * The reception around the Hermes chat: the wordmark above, the chat itself in
 * glass, and beside it what the person wants at a glance — which AI is
 * talking, the last suites, which room waits for them, the door to a new one.
 * The chat inside is the unchanged Hermes layout tree.
 */
export function VorzimmerRahmen({ children }: { children: ReactNode }) {
  const { locale } = useI18n()
  const v = areaLabels(locale).vorzimmer
  const suites = useStore($suites)
  const wartend = useStore($attentionSessionIds)
  const modell = useStore($currentModel)

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

  const braucht = suites.filter(s => wartend.includes(s.id) || (s.resolvedId ? wartend.includes(s.resolvedId) : false))
  const zuletzt = suites.slice(0, 3)

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 flex-col" data-vorzimmer="">
      <header className="flex items-center gap-4 px-5 pt-4 pb-3 pr-40">
        <span className="tikki-wortmarke">
          <b>tikki</b>
          <span>{v.titel}</span>
        </span>
        <span className="flex-1" />
        <button
          className="tikki-knopf tikki-knopf-still px-3 py-1.5 text-[13px] font-medium"
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
                  <SuiteKnopf hinweis={areaLabels(locale).suites.wartetAufDich} key={s.id} suite={s} />
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
