import { useStore } from '@nanostores/react'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'

import { useI18n } from '@/i18n'
import { Armchair, Bell, CheckCircle2, Loader2, Plus, Search } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { $uebungslaeufe } from '../admin/betrieb-store'
import { KATALOG, rolle } from '../admin/katalog'
import { areaLabels } from '../labels'

import {
  $aktiveSuite,
  $neueSuiteOffen,
  $suiteEntsteht,
  $suites,
  $suitesBrauchen,
  $suitesFehler,
  $suitesStatus,
  ladeSuites,
  neueSuite,
  oeffneSuite,
  raumdienstFehlt,
  RAUMLEITER,
  type Suite
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

const raumleiter = rolle(RAUMLEITER)
/** Roles the person may seat at the table from the start; the base crew is there anyway. */
const WAEHLBARE_ROLLEN = KATALOG.filter(r => !r.im_raum_ab_start && r.slug !== 'tikki' && r.slug !== 'wachhalter')

function RaumleiterKarte() {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites

  if (!raumleiter) {
    return null
  }

  return (
    <div className="tikki-glas p-4" data-suite-raumleiter="">
      <div className="text-xs font-semibold tracking-wide text-(--tikki-tinte-weich) uppercase">{s.immerDabei}</div>
      <div className="mt-2 flex items-center gap-3">
        <span aria-hidden className="text-3xl leading-none">
          {raumleiter.icon}
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold text-(--tikki-tinte)">{raumleiter.name}</div>
          <div className="text-xs text-(--tikki-tinte-weich)">{raumleiter.kurz}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-(--tikki-tinte-weich)">{s.hauptmodell}</dt>
        <dd className="font-mono text-(--tikki-tinte)">{raumleiter.modell.primary}</dd>
        <dt className="text-(--tikki-tinte-weich)">{s.ausweich}</dt>
        <dd className="font-mono text-(--tikki-tinte)">{raumleiter.modell.fallback}</dd>
      </dl>
    </div>
  )
}

/** The window in the middle of the lobby: search, create a suite, join one by name. */
function SuiteFenster({ nameFeld, suites }: { nameFeld: React.RefObject<HTMLInputElement | null>; suites: Suite[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const entsteht = useStore($suiteEntsteht)
  const uebungen = useStore($uebungslaeufe)
  const [name, setName] = useState('')
  const [ziel, setZiel] = useState('')
  const [taktWahl, setTaktWahl] = useState('')
  const [eigenerTakt, setEigenerTakt] = useState('')
  const [rollen, setRollen] = useState<string[]>([])
  const [verbindeName, setVerbindeName] = useState('')
  const [verbindeFehler, setVerbindeFehler] = useState(false)
  const takt = taktWahl === EIGENER ? eigenerTakt.trim() : taktWahl

  const erstellen = async (event: FormEvent) => {
    event.preventDefault()

    if (!name.trim() || entsteht) {
      return
    }

    await neueSuite(name, ziel, { rollen, takt: takt || undefined })
    setName('')
    setZiel('')
    setTaktWahl('')
    setEigenerTakt('')
    setRollen([])
  }

  const rolleUmschalten = (slug: string) =>
    setRollen(alt => (alt.includes(slug) ? alt.filter(x => x !== slug) : [...alt, slug]))

  const verbinden = (event: FormEvent) => {
    event.preventDefault()
    const gesucht = verbindeName.trim().toLowerCase()

    const treffer =
      suites.find(x => x.titel.toLowerCase() === gesucht) ?? suites.find(x => x.titel.toLowerCase().includes(gesucht))

    if (gesucht && treffer) {
      setVerbindeFehler(false)
      oeffneSuite(treffer)
    } else {
      setVerbindeFehler(true)
    }
  }

  return (
    <div className="tikki-glas flex flex-col overflow-hidden" data-suite-fenster="">
      <div className="tikki-fenster-kopf text-[12px] font-semibold tracking-wide text-(--tikki-tinte-weich) uppercase">
        Suites
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-[1.15fr_1fr]">
        <form
          className="tikki-glas tikki-glas-dicht flex flex-col gap-2.5 p-3"
          data-suite-form=""
          onSubmit={e => void erstellen(e)}
        >
          <div className="tikki-knopf justify-center px-3 py-2 text-sm font-semibold">{s.erstellen}</div>
          <input
            aria-label={s.name}
            className="tikki-feld text-sm"
            disabled={Boolean(entsteht)}
            onChange={e => setName(e.target.value)}
            placeholder={s.namePlatzhalter}
            ref={nameFeld}
            required
            value={name}
          />
          <textarea
            aria-label={s.ziel}
            className="tikki-feld min-h-20 text-sm"
            disabled={Boolean(entsteht)}
            onChange={e => setZiel(e.target.value)}
            placeholder={s.zielPlatzhalter}
            value={ziel}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              aria-label={s.takt}
              className="tikki-feld py-1.5 text-sm"
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
            {taktWahl === EIGENER && (
              <input
                aria-label={s.taktEigener}
                className="tikki-feld min-w-40 flex-1 py-1.5 text-sm"
                onChange={e => setEigenerTakt(e.target.value)}
                placeholder={s.taktPlatzhalter}
                value={eigenerTakt}
              />
            )}
          </div>
          <fieldset className="flex flex-wrap gap-1.5" data-suite-rollen="">
            <legend className="mb-1 text-[11px] text-(--tikki-tinte-weich)">{s.rollen}</legend>
            {WAEHLBARE_ROLLEN.map(r => (
              <button
                aria-pressed={rollen.includes(r.slug)}
                className="tikki-knopf tikki-knopf-still gap-1 rounded-full px-2 py-0.5 text-[11px]"
                data-aktiv={rollen.includes(r.slug) ? 'true' : undefined}
                disabled={Boolean(entsteht)}
                key={r.slug}
                onClick={() => rolleUmschalten(r.slug)}
                type="button"
              >
                <span aria-hidden>{r.icon}</span>
                {r.name}
              </button>
            ))}
          </fieldset>
          {!takt && uebungen > 1 && (
            <p className="text-[11px] text-(--tikki-tinte-weich)">{s.uebungenGeplant(uebungen)}</p>
          )}
          <div className="mt-auto flex items-center justify-end gap-2">
            <button
              className="tikki-knopf tikki-knopf-still px-3 py-1.5 text-sm"
              disabled={Boolean(entsteht)}
              onClick={() => {
                setName('')
                setZiel('')
                setRollen([])
              }}
              type="button"
            >
              {s.abbrechen}
            </button>
            <button
              className="tikki-knopf px-3.5 py-1.5 text-sm font-semibold disabled:opacity-60"
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
        <form
          className="tikki-glas tikki-glas-dicht flex flex-col gap-2.5 p-3"
          data-suite-verbinden=""
          onSubmit={verbinden}
        >
          <div className="tikki-knopf tikki-knopf-still justify-center px-3 py-2 text-sm font-semibold">
            {s.verbinden}
          </div>
          <p className="text-[12px] text-(--tikki-tinte-weich)">{s.verbindenHinweis}</p>
          <input
            aria-label={s.verbindenName}
            className={cn('tikki-feld text-sm', verbindeFehler && 'ring-2 ring-destructive/60')}
            list="tikki-suite-namen"
            onChange={e => {
              setVerbindeName(e.target.value)
              setVerbindeFehler(false)
            }}
            placeholder={s.verbindenName}
            value={verbindeName}
          />
          <datalist id="tikki-suite-namen">
            {suites.map(x => (
              <option key={x.id} value={x.titel} />
            ))}
          </datalist>
          <button className="tikki-knopf mt-auto justify-center px-3 py-1.5 text-sm font-semibold" type="submit">
            {s.verbinden}
          </button>
        </form>
      </div>
    </div>
  )
}

/** The second line of a room's tablet: what it needs, that it is done, who works, or who sits there. */
export function suiteHinweis(suite: Suite, s: ReturnType<typeof areaLabels>['suites']): string {
  if (suite.brauche) {
    return suite.brauche
  }

  if (suite.fertig) {
    return s.fertigGemeldet
  }

  if (suite.arbeitet) {
    const wer = suite.mitglieder.find(m => m.member_id === suite.arbeitet)

    return `${wer?.display_name || wer?.handle || suite.arbeitet} ${s.arbeitet}`
  }

  return s.mitglieder(suite.mitglieder.length)
}

export function SuiteTafel({
  braucht = false,
  suite,
  uebungen = []
}: {
  braucht?: boolean
  suite: Suite
  uebungen?: Suite[]
}) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const [offen, setOffen] = useState(false)
  const teil = uebungsTeil(suite.titel)

  return (
    <li className="flex flex-col gap-1">
      <button
        className="tikki-knopf w-full px-3 py-2.5 text-left"
        data-braucht={braucht ? 'true' : undefined}
        data-suite-id={suite.id}
        onClick={() => oeffneSuite(suite)}
        type="button"
      >
        {braucht ? (
          <Bell aria-hidden className="size-5 shrink-0" stroke={2} />
        ) : suite.fertig ? (
          <CheckCircle2 aria-hidden className="size-5 shrink-0" stroke={1.9} />
        ) : (
          <Armchair aria-hidden className="size-5 shrink-0" stroke={1.9} />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold">
            {teil ? `${teil.basis} · ${s.uebungslauf(teil.nr)}` : suite.titel}
          </span>
          <span className="truncate text-[11px] opacity-75">{suiteHinweis(suite, s)}</span>
        </span>
      </button>
      {uebungen.length > 0 && (
        <div className="pl-3">
          <button
            aria-expanded={offen}
            className="text-[11px] font-medium text-(--tikki-gelb-tief) hover:underline"
            data-suite-uebungen={uebungen.length}
            onClick={() => setOffen(o => !o)}
            type="button"
          >
            {offen ? '−' : '+'} {s.uebungslaeufe(uebungen.length)}
          </button>
          {offen && (
            <ul className="mt-1 flex flex-col gap-1">
              {uebungen.map(u => (
                <li key={u.id}>
                  <button
                    className="tikki-knopf tikki-knopf-still w-full px-2.5 py-1.5 text-left text-[12px]"
                    data-suite-id={u.id}
                    onClick={() => oeffneSuite(u)}
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

/** The right wall: rooms that need the person, as glowing notes. */
function Aufmerksamkeit({ suites }: { suites: Suite[] }) {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const wartend = useStore($suitesBrauchen)

  const karten = suites
    .map(suite => ({
      suite,
      grund: wartend.includes(suite.id) ? (suite.brauche ?? s.wartetAufDich) : suite.fertig ? s.fertigGemeldet : null
    }))
    .filter((k): k is { suite: Suite; grund: string } => k.grund !== null)

  return (
    <aside className="flex min-h-0 w-64 shrink-0 flex-col gap-2.5 overflow-y-auto pt-8" data-suites-aufmerksamkeit="">
      {karten.length === 0 ? (
        <div className="tikki-glas p-3.5 text-[12px] text-(--tikki-tinte-weich)">{s.allesRuhig}</div>
      ) : (
        karten.map(({ suite, grund }) => (
          <button
            className="tikki-glas flex flex-col items-start gap-1 p-3.5 text-left hover:bg-(--tikki-glas-dicht)"
            key={suite.id}
            onClick={() => oeffneSuite(suite)}
            type="button"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-(--tikki-tinte)">
              <Bell aria-hidden className="size-4 text-(--tikki-gelb-tief)" stroke={2} />
              {s.aufmerksamkeit}
            </span>
            <span className="truncate text-[12px] text-(--tikki-tinte)">{suite.titel}</span>
            <span className="text-[11px] text-(--tikki-tinte-weich)">{grund}</span>
          </button>
        ))
      )}
    </aside>
  )
}

/**
 * The lobby: the history of suites on the left as glowing tablets (empty
 * until the first one), the window in the middle to search, create or join,
 * the room lead who sits in every suite, and on the right the rooms that need
 * the person. Entering a suite hands its chat to the room.
 */
export function SuitesArea() {
  const aktive = useStore($aktiveSuite)

  return aktive ? <SuiteRoom key={aktive.id} suite={aktive} /> : <SuitesLobby />
}

function SuitesLobby() {
  const { locale } = useI18n()
  const s = areaLabels(locale).suites
  const suites = useStore($suites)
  const status = useStore($suitesStatus)
  const fehler = useStore($suitesFehler)
  const formularOffen = useStore($neueSuiteOffen)
  const wartend = useStore($suitesBrauchen)
  const [suche, setSuche] = useState('')
  const nameFeld = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    void ladeSuites()
  }, [])

  useEffect(() => {
    if (formularOffen) {
      $neueSuiteOffen.set(false)
      nameFeld.current?.focus()
    }
  }, [formularOffen])

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase()

    return q ? suites.filter(x => x.titel.toLowerCase().includes(q) || x.brauche?.toLowerCase().includes(q)) : suites
  }, [suche, suites])

  return (
    <div className="tikki-boden flex min-h-0 min-w-0 flex-1 gap-4 p-4" data-suites-area="">
      <section className="flex w-64 shrink-0 flex-col gap-2.5">
        <header className="flex items-center justify-between px-1 pt-1">
          <span className="tikki-wortmarke">
            <b>tikki</b>
            <span>{s.verlauf}</span>
          </span>
          <button
            className="tikki-knopf tikki-knopf-still px-2.5 py-1 text-xs font-medium"
            onClick={() => nameFeld.current?.focus()}
            type="button"
          >
            <Plus aria-hidden className="size-3.5" />
            {s.neu}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {status === 'laedt' && suites.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-(--tikki-tinte-weich)" role="status">
              {s.laedt}
            </p>
          )}
          {status === 'fehler' && (
            <div className="tikki-glas my-2 p-3 text-sm" role="alert">
              <p className="text-(--tikki-tinte)">{fehler && raumdienstFehlt(fehler) ? s.raumdienstFehlt : s.fehler}</p>
              {fehler && !raumdienstFehlt(fehler) && (
                <p className="mt-1 font-mono text-xs text-(--tikki-tinte-weich)">{fehler}</p>
              )}
              <button
                className="mt-2 text-xs font-medium text-(--tikki-gelb-tief)"
                onClick={() => void ladeSuites()}
                type="button"
              >
                {s.erneut}
              </button>
            </div>
          )}
          {status === 'bereit' && suites.length === 0 && (
            <div className="tikki-glas px-3 py-8 text-center" data-suites-leer="">
              <Armchair aria-hidden className="mx-auto size-8 text-(--tikki-gelb-tief)/70" stroke={1.5} />
              <p className="mt-3 text-sm font-medium text-(--tikki-tinte)">{s.leer}</p>
              <p className="mt-1 text-xs text-(--tikki-tinte-weich)">{s.leerHinweis}</p>
            </div>
          )}
          {suites.length > 0 && (
            <ul className={cn('flex flex-col gap-2', status === 'laedt' && 'opacity-70')}>
              {verlaufGruppen(gefiltert).map(({ suite, uebungen }) => (
                <SuiteTafel braucht={wartend.includes(suite.id)} key={suite.id} suite={suite} uebungen={uebungen} />
              ))}
            </ul>
          )}
        </div>
      </section>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
        <label className="tikki-glas flex items-center gap-2 px-3 py-2">
          <Search aria-hidden className="size-4 text-(--tikki-tinte-weich)" stroke={2} />
          <input
            aria-label={s.suchen}
            className="w-full bg-transparent text-sm text-(--tikki-tinte) outline-none placeholder:text-(--tikki-tinte-weich)"
            data-suite-suche=""
            onChange={e => setSuche(e.target.value)}
            placeholder={s.suchen}
            value={suche}
          />
        </label>
        <SuiteFenster nameFeld={nameFeld} suites={suites} />
        {fehler && status !== 'fehler' && (
          <p className="text-sm text-destructive" role="alert">
            {fehler}
          </p>
        )}
        <div className="max-w-md">
          <RaumleiterKarte />
        </div>
      </div>
      <Aufmerksamkeit suites={suites} />
    </div>
  )
}
