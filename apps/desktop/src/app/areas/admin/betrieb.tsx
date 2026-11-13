import { useStore } from '@nanostores/react'
import { type FormEvent, type ReactNode, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { $mensch, setMensch } from './betrieb-store'
import { $waToken, $waTokenSchreibt, entferneWaToken, ladeWaToken, setzeWaToken } from './wa-token'

// A row, not a <label>: a row can hold a field with buttons of its own, and a
// label around those would hand every click in the row to the first of them.
function Feld({ children, hinweis, titel }: { children: ReactNode; hinweis: string; titel: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-6 gap-y-1 border-b border-(--ui-stroke-secondary) py-4 last:border-b-0">
      <span className="text-sm font-medium text-(--ui-text-primary)">{titel}</span>
      <span className="row-span-2 self-center">{children}</span>
      <span className="text-xs text-(--ui-text-secondary)">{hinweis}</span>
    </div>
  )
}

const FELD =
  'rounded-md border border-(--ui-stroke-secondary) bg-(--ui-bg-primary) px-2 py-1.5 font-mono text-sm text-(--ui-text-primary) outline-none focus:border-(--ui-accent)'

/**
 * The name, typed freely: the field holds what the person types and the store
 * takes it when they are done (Enter or leaving the field). Cleaning every
 * keystroke would fight the typing — an emptied field snapping back, letters
 * swallowed mid-word.
 */
function NameFeld({ label }: { label: string }) {
  const mensch = useStore($mensch)
  const [roh, setRoh] = useState<string | null>(null)

  const uebernehmen = () => {
    if (roh !== null) {
      setMensch(roh)
      setRoh(null)
    }
  }

  return (
    <input
      aria-label={label}
      className={cn(FELD, 'w-40')}
      data-betrieb-mensch=""
      onBlur={uebernehmen}
      onChange={e => setRoh(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          uebernehmen()
        }
      }}
      value={roh ?? mensch}
    />
  )
}

/** The WhatsApp bridge token: write-only. The field shows whether one is stored, never the value. */
function WaTokenFeld() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.betrieb
  const stand = useStore($waToken)
  const schreibt = useStore($waTokenSchreibt)
  const [wert, setWert] = useState('')

  useEffect(() => void ladeWaToken(), [])

  const speichern = async (event: FormEvent) => {
    event.preventDefault()

    if (await setzeWaToken(wert)) {
      setWert('')
    }
  }

  return (
    <form className="flex flex-col items-end gap-1.5" data-betrieb-wa-token={stand} onSubmit={e => void speichern(e)}>
      <div className="flex items-center gap-2">
        <input
          aria-label={b.waToken}
          autoComplete="off"
          className={cn(FELD, 'w-56')}
          onChange={e => setWert(e.target.value)}
          placeholder={stand === 'gesetzt' ? b.waTokenErsetzen : b.waTokenPlatzhalter}
          type="password"
          value={wert}
        />
        <Button disabled={schreibt || !wert.trim()} size="sm" type="submit">
          {b.waTokenSpeichern}
        </Button>
      </div>
      <div className="flex items-center gap-3 text-xs text-(--ui-text-secondary)" role="status">
        {b.waTokenStand[stand]}
        {stand === 'gesetzt' && (
          <button
            className="font-medium underline disabled:opacity-50"
            disabled={schreibt}
            onClick={() => void entferneWaToken()}
            type="button"
          >
            {b.waTokenEntfernen}
          </button>
        )}
      </div>
    </form>
  )
}

/** Betrieb: the person's name in the rooms, and the token Tikki's briefing reads WhatsApp with. */
export function BetriebSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.betrieb

  return (
    <div className="flex max-w-3xl flex-col gap-4" data-admin-betrieb="">
      <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) px-4">
        <Feld hinweis={b.menschHinweis} titel={b.mensch}>
          <NameFeld label={b.mensch} />
        </Feld>
        <Feld hinweis={b.waTokenHinweis} titel={b.waToken}>
          <WaTokenFeld />
        </Feld>
      </div>
      <p className="text-xs text-(--ui-text-secondary)">{b.rundUmDieUhr}</p>
    </div>
  )
}
