import { useStore } from '@nanostores/react'
import { type ReactNode, useState } from 'react'

import { useI18n } from '@/i18n'

import { areaLabels } from '../labels'
import { briefingAutomatik, setBriefingAutomatik } from '../tikki/briefing'

import {
  $kapazitaet,
  $mensch,
  $uebungslaeufe,
  setKapazitaet,
  setMensch,
  setUebungslaeufe,
  UEBUNG_HOECHSTENS
} from './betrieb-store'

function Feld({ children, hinweis, titel }: { children: ReactNode; hinweis: string; titel: string }) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-1 border-b border-(--ui-stroke-secondary) py-4 last:border-b-0">
      <span className="text-sm font-medium text-(--ui-text-primary)">{titel}</span>
      <span className="row-span-2 self-center">{children}</span>
      <span className="text-xs text-(--ui-text-secondary)">{hinweis}</span>
    </label>
  )
}

const zahlFeld =
  'w-24 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 text-right font-mono text-sm text-(--ui-text-primary) outline-none focus:border-(--ui-accent)'

/** Betrieb: practice runs per order, house capacity, the person's name in practice rooms. */
export function BetriebSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.betrieb
  const uebungen = useStore($uebungslaeufe)
  const kapazitaet = useStore($kapazitaet)
  const [automatik, setAutomatik] = useState(briefingAutomatik)
  const mensch = useStore($mensch)

  return (
    <div className="flex max-w-3xl flex-col gap-4" data-admin-betrieb="">
      <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-4">
        <Feld hinweis={b.uebungenHinweis} titel={b.uebungen}>
          <input
            className={zahlFeld}
            data-betrieb-uebungen=""
            max={UEBUNG_HOECHSTENS}
            min={1}
            onChange={e => setUebungslaeufe(Number(e.target.value))}
            type="number"
            value={uebungen}
          />
        </Feld>
        <Feld hinweis={b.kapazitaetHinweis} titel={b.kapazitaet}>
          <input
            className={zahlFeld}
            min={1}
            onChange={e => setKapazitaet(Number(e.target.value))}
            type="number"
            value={kapazitaet}
          />
        </Feld>
        <Feld hinweis={b.briefingAutomatikHinweis} titel={b.briefingAutomatik}>
          <input
            checked={automatik}
            className="size-4 accent-(--tikki-gelb-tief)"
            data-betrieb-briefing=""
            onChange={e => {
              setAutomatik(e.target.checked)
              setBriefingAutomatik(e.target.checked)
            }}
            type="checkbox"
          />
        </Feld>
        <Feld hinweis={b.menschHinweis} titel={b.mensch}>
          <input
            className="w-40 rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 font-mono text-sm text-(--ui-text-primary) outline-none focus:border-(--ui-accent)"
            onChange={e => setMensch(e.target.value)}
            value={mensch}
          />
        </Feld>
      </div>
      <p className="text-xs text-(--ui-text-secondary)">{b.rundUmDieUhr}</p>
    </div>
  )
}
