import { useStore } from '@nanostores/react'
import { type FormEvent, useEffect, useState } from 'react'

import raumBild from '@/assets/tikki/suite-raum.svg?url'
import { useI18n } from '@/i18n'
import { Armchair, Loader2, Plus } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { $uebungslaeufe } from '../admin/betrieb-store'
import { rolle } from '../admin/katalog'
import { areaLabels } from '../labels'

import {
  $aktiveSuite,
  $suiteEntsteht,
  $suites,
  $suitesFehler,
  $suitesStatus,
  ladeSuites,
  neueSuite,
  oeffneSuite,
  profilFehlt,
  type Suite,
  SUITE_PROFIL
} from './store'
import { SuiteRoom } from './suite-room'
import { uebungsTeil } from './uebung'

/** Practice rooms hang under their project's room; a practice room without one stands alone. */
export function verlaufGruppen(suites: readonly Suite[]): { suite: Suite; uebungen: Suite[] }[] {
  const haupt = new Map(suites.filter(s => !uebungsTeil(s.titel)).map(s => [s.titel, s]))
  const uebungen = new Map<string, Suite[]>()
  const allein: Suite[] = []

  for (const suite of suites) {
    const teil = uebungsTeil(suite.titel)

    if (!teil) {
      continue
    }

    if (haupt.has(teil.basis)) {
      uebungen.set(teil.basis, [...(uebungen.get(teil.basis) ?? []), suite])
    } else {
      allein.push(suite)
    }
  }

  return suites
    .filter(s => !uebungsTeil(s.titel) || allein.includes(s))
    .map(suite => ({
      suite,
      uebungen: (uebungen.get(suite.titel) ?? []).sort(
        (a, b) => (uebungsTeil(a.titel)?.nr ?? 0) - (uebungsTeil(b.titel)?.nr ?? 0)
      )
    }))
}

const TAKTE = ['stündlich', 'alle 30 Minuten', 'täglich 06:00', 'werktags 08:00', 'montags 09:00'] as const
const EIGENER = '__eigener__'

const raumleiter = rolle(SUITE_PROFIL)

function RaumleiterKarte() {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites

  if (!raumleiter) {
    return null
  }

  return (
    <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-4" data-suite-raumleiter="">
      <div className="text-xs font-semibold tracking-wide text-(--ui-text-secondary) uppercase">{s.immerDabei}</div>
      <div className="mt-2 flex items-center gap-3">
        <span aria-hidden className="text-3xl leading-none">
          {raumleiter.icon}
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold text-(--ui-text-primary)">{raumleiter.name}</div>
          <div className="text-xs text-(--ui-text-secondary)">{raumleiter.kurz}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-(--ui-text-secondary)">{s.hauptmodell}</dt>
        <dd className="font-mono text-(--ui-text-primary)">{raumleiter.modell.primary}</dd>
        <dt className="text-(--ui-text-secondary)">{s.ausweich}</dt>
        <dd className="font-mono text-(--ui-text-primary)">{raumleiter.modell.fallback}</dd>
      </dl>
    </div>
  )
}

function NeueSuiteForm({ onDone }: { onDone: () => void }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const entsteht = useStore($suiteEntsteht)
  const uebungen = useStore($uebungslaeufe)
  const [name, setName] = useState('')
  const [ziel, setZiel] = useState('')
  const [taktWahl, setTaktWahl] = useState('')
  const [eigenerTakt, setEigenerTakt] = useState('')
  const takt = taktWahl === EIGENER ? eigenerTakt.trim() : taktWahl

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (!name.trim() || entsteht) {
      return
    }

    await neueSuite(name, ziel, { takt: takt || undefined })
    onDone()
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-4"
      data-suite-form=""
      onSubmit={e => void submit(e)}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-(--ui-text-secondary)">{s.name}</span>
        <input
          autoFocus
          className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
          disabled={Boolean(entsteht)}
          onChange={e => setName(e.target.value)}
          placeholder={s.namePlatzhalter}
          required
          value={name}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-(--ui-text-secondary)">{s.ziel}</span>
        <textarea
          className="min-h-20 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
          disabled={Boolean(entsteht)}
          onChange={e => setZiel(e.target.value)}
          placeholder={s.zielPlatzhalter}
          value={ziel}
        />
      </label>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-(--ui-text-secondary)">{s.takt}</span>
          <select
            className="rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
            data-suite-takt=""
            disabled={Boolean(entsteht)}
            onChange={e => setTaktWahl(e.target.value)}
            value={taktWahl}
          >
            <option value="">{s.taktEinmalig}</option>
            {TAKTE.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={EIGENER}>{s.taktEigener}</option>
          </select>
        </label>
        {taktWahl === EIGENER && (
          <input
            aria-label={s.taktEigener}
            className="min-w-56 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
            onChange={e => setEigenerTakt(e.target.value)}
            placeholder={s.taktPlatzhalter}
            value={eigenerTakt}
          />
        )}
      </div>
      {!takt && uebungen > 1 && <p className="text-xs text-(--ui-text-secondary)">{s.uebungenGeplant(uebungen)}</p>}
      <div className="flex items-center justify-end gap-2">
        <button
          className="rounded-md px-3 py-1.5 text-sm text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary)"
          disabled={Boolean(entsteht)}
          onClick={onDone}
          type="button"
        >
          {s.abbrechen}
        </button>
        <button
          className="flex items-center gap-1.5 rounded-md bg-(--ui-accent) px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          disabled={!name.trim() || Boolean(entsteht)}
          type="submit"
        >
          {entsteht ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Armchair aria-hidden className="size-4" />
          )}
          {entsteht ? s.wirdEroeffnet : s.anlegen}
        </button>
      </div>
    </form>
  )
}

function SuiteZeile({ suite, uebungen = [] }: { suite: Suite; uebungen?: Suite[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [offen, setOffen] = useState(false)
  const teil = uebungsTeil(suite.titel)

  return (
    <li>
      <button
        className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-(--ui-fill-quinary)"
        data-suite-id={suite.id}
        onClick={() => void oeffneSuite(suite)}
        type="button"
      >
        <span className="flex w-full items-center gap-2">
          <Armchair aria-hidden className="size-4 shrink-0 text-(--ui-accent)" stroke={1.75} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-(--ui-text-primary)">
            {teil ? `${teil.basis} · ${s.uebungslauf(teil.nr)}` : suite.titel}
          </span>
          <span className="text-[11px] text-(--ui-text-secondary)">{s.betreten}</span>
        </span>
        <span className="flex w-full min-w-0 gap-2 pl-6 text-xs text-(--ui-text-secondary)">
          {suite.vorschau && <span className="min-w-0 flex-1 truncate">{suite.vorschau}</span>}
          {suite.nachrichten !== undefined && <span className="shrink-0">{s.nachrichten(suite.nachrichten)}</span>}
        </span>
      </button>
      {uebungen.length > 0 && (
        <div className="pl-9">
          <button
            aria-expanded={offen}
            className="text-[11px] font-medium text-(--ui-accent) hover:underline"
            data-suite-uebungen={uebungen.length}
            onClick={() => setOffen(o => !o)}
            type="button"
          >
            {offen ? '−' : '+'} {s.uebungslaeufe(uebungen.length)}
          </button>
          {offen && (
            <ul className="mt-0.5 flex flex-col">
              {uebungen.map(u => (
                <li key={u.id}>
                  <button
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-(--ui-text-secondary) hover:bg-(--ui-fill-quinary)"
                    data-suite-id={u.id}
                    onClick={() => void oeffneSuite(u)}
                    type="button"
                  >
                    {s.uebungslauf(uebungsTeil(u.titel)?.nr ?? 0)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * The lobby: the history of suites on the left (empty until the first one),
 * the room lead who sits in every suite on the right, and the door to a new
 * one. Entering a suite hands its chat to the Tikki layer.
 */
export function SuitesArea() {
  const aktive = useStore($aktiveSuite)

  return aktive ? <SuiteRoom key={aktive.resolvedId || aktive.id} suite={aktive} /> : <SuitesLobby />
}

function SuitesLobby() {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const suites = useStore($suites)
  const status = useStore($suitesStatus)
  const fehler = useStore($suitesFehler)
  const [formular, setFormular] = useState(false)

  useEffect(() => {
    void ladeSuites()
  }, [])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-(--ui-bg-primary)" data-suites-area="">
      <section className="flex w-80 shrink-0 flex-col border-r border-(--ui-stroke-secondary) bg-(--ui-bg-chrome)">
        <header className="flex items-center justify-between px-4 pt-4 pb-2">
          <h1 className="text-lg font-semibold text-(--ui-text-primary)">{s.verlauf}</h1>
          <button
            className="flex items-center gap-1 rounded-md bg-(--ui-accent)/15 px-2 py-1 text-xs font-medium text-(--ui-accent) hover:bg-(--ui-accent)/25"
            onClick={() => setFormular(true)}
            type="button"
          >
            <Plus aria-hidden className="size-3.5" />
            {s.neu}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {status === 'laedt' && suites.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-(--ui-text-secondary)" role="status">
              {s.laedt}
            </p>
          )}
          {status === 'fehler' && (
            <div className="mx-2 my-4 rounded-lg border border-(--ui-stroke-secondary) p-3 text-sm" role="alert">
              <p className="text-(--ui-text-primary)">{fehler && profilFehlt(fehler) ? s.profilFehlt : s.fehler}</p>
              {fehler && !profilFehlt(fehler) && (
                <p className="mt-1 font-mono text-xs text-(--ui-text-secondary)">{fehler}</p>
              )}
              <button
                className="mt-2 text-xs font-medium text-(--ui-accent)"
                onClick={() => void ladeSuites()}
                type="button"
              >
                {s.erneut}
              </button>
            </div>
          )}
          {status === 'bereit' && suites.length === 0 && (
            <div className="px-3 py-10 text-center" data-suites-leer="">
              <Armchair aria-hidden className="mx-auto size-8 text-(--ui-text-secondary)/50" stroke={1.5} />
              <p className="mt-3 text-sm font-medium text-(--ui-text-primary)">{s.leer}</p>
              <p className="mt-1 text-xs text-(--ui-text-secondary)">{s.leerHinweis}</p>
            </div>
          )}
          {suites.length > 0 && (
            <ul className={cn('flex flex-col gap-0.5', status === 'laedt' && 'opacity-70')}>
              {verlaufGruppen(suites).map(({ suite, uebungen }) => (
                <SuiteZeile key={suite.id} suite={suite} uebungen={uebungen} />
              ))}
            </ul>
          )}
        </div>
      </section>
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-[#041712] bg-cover bg-center p-6"
        style={{ backgroundImage: `url(${raumBild})` }}
      >
        <div className="flex max-w-3xl flex-col gap-4 rounded-2xl border border-white/15 bg-(--ui-bg-chrome)/88 p-6 shadow-[0_0_40px_-12px_rgba(67,224,160,0.55)] backdrop-blur-md">
          <h2 className="text-xl font-semibold text-(--ui-text-primary)">Suites</h2>
          <p className="max-w-2xl text-sm text-(--ui-text-secondary)">{s.einfuehrung}</p>
          {formular ? <NeueSuiteForm onDone={() => setFormular(false)} /> : null}
          {fehler && status !== 'fehler' && (
            <p className="text-sm text-destructive" role="alert">
              {fehler}
            </p>
          )}
          <div className="max-w-md">
            <RaumleiterKarte />
          </div>
        </div>
      </div>
    </div>
  )
}
