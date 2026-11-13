import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { rolle, ROLLEN } from './katalog'
import {
  $regelEntwuerfe,
  $regelFehler,
  $regelRolle,
  $regelStand,
  ladeRegel,
  regelGeaendert,
  regelProfile,
  schreibeRegel,
  speichereRegel,
  verwirfRegel
} from './regeln-store'
import { $rollenStand, ladeRollenStand } from './rollen-stand'

/**
 * Rules & prompts: every role's SOUL, read from and written to the backend
 * (`/api/profiles/<name>/soul`). The catalogue drives the list; a role whose
 * Hermes profile does not exist yet is shown but read-only. Saving a role
 * writes its clones too. The state is `regeln-store.ts`'s: unsaved text
 * survives a change of role and of area.
 */
export function RegelnSection() {
  const { locale } = useI18n()
  const r = areaLabels(locale).admin.roles
  const slug = useStore($regelRolle)
  const entwuerfe = useStore($regelEntwuerfe)
  const stand = useStore($regelStand)[slug]
  const fehler = useStore($regelFehler)[slug]
  const profile = useStore($rollenStand)

  useEffect(() => void ladeRollenStand(), [])
  useEffect(() => void ladeRegel(slug), [slug])

  const entwurf = entwuerfe[slug]
  const vorhanden = new Set(Object.keys(profile ?? {}))
  // "Missing" is the backend's word, not a failed request's.
  const fehlt = profile !== null && !vorhanden.has(slug)
  const geaendert = regelGeaendert(entwurf)
  const canEdit = Boolean(entwurf) && !fehlt
  const klone = regelProfile(slug, vorhanden).filter(p => p !== slug)

  return (
    <div className="flex min-h-0 flex-1 gap-4" data-regeln-stand={stand ?? 'leer'}>
      <div className="flex w-56 shrink-0 flex-col gap-0.5">
        <div className="px-2 pb-1 text-xs text-(--ui-text-secondary)">{r.pick}</div>
        {ROLLEN.map(role => (
          <button
            aria-current={role.slug === slug ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
              role.slug === slug
                ? 'bg-(--ui-accent)/15 text-(--ui-accent)'
                : 'text-(--ui-text-primary) hover:bg-(--ui-fill-quinary)'
            )}
            data-regel-rolle={role.slug}
            key={role.slug}
            onClick={() => $regelRolle.set(role.slug)}
            type="button"
          >
            <span aria-hidden>{role.icon}</span>
            <span className="truncate">{role.name}</span>
            {regelGeaendert(entwuerfe[role.slug]) ? (
              <span
                className="ml-auto size-1.5 rounded-full bg-(--ui-accent)"
                data-regel-ungespeichert=""
                title={r.unsaved}
              />
            ) : (
              profile !== null &&
              !vorhanden.has(role.slug) && (
                <span className="ml-auto size-1.5 rounded-full bg-(--ui-text-secondary)/40" title={r.missingProfile} />
              )
            )}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {fehlt && <p className="text-xs text-(--ui-text-secondary)">{r.missingProfile}</p>}
        {!fehlt && stand === 'ladefehler' && (
          <p className="flex items-center gap-3 text-xs text-destructive" data-regel-ladefehler="" role="alert">
            {r.loadError}
            <button className="font-medium underline" onClick={() => void ladeRegel(slug)} type="button">
              {r.retry}
            </button>
          </p>
        )}
        <Textarea
          className="min-h-[24rem] flex-1 font-mono text-xs"
          disabled={!canEdit}
          onChange={e => schreibeRegel(slug, e.target.value)}
          placeholder={stand === 'laedt' ? r.loading : ''}
          value={entwurf?.text ?? ''}
        />
        {klone.length > 0 && (
          <p className="text-xs text-(--ui-text-secondary)" data-regel-klone={klone.join(' ')}>
            {r.clones(klone.map(p => rolle(p)?.name ?? p).join(', '))}
          </p>
        )}
        {fehler && (
          <p className="text-xs text-destructive" data-regel-speicherfehler={fehler.profile.join(' ')} role="alert">
            {r.saveError(fehler.profile.join(', '))} <span className="font-mono">{fehler.grund}</span>
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button
            // A save that missed a clone is retried with the same text.
            disabled={!canEdit || !(geaendert || fehler) || stand === 'speichert'}
            onClick={() => void speichereRegel(slug)}
            size="sm"
          >
            {r.save}
          </Button>
          {geaendert && stand !== 'speichert' && (
            <Button onClick={() => void verwirfRegel(slug)} size="sm" variant="ghost">
              {r.discard}
            </Button>
          )}
          {stand === 'gespeichert' && <span className="text-xs text-(--ui-accent)">{r.saved}</span>}
          {geaendert && stand !== 'gespeichert' && (
            <span className="text-xs text-(--ui-text-secondary)">{r.unsaved}</span>
          )}
        </div>
      </div>
    </div>
  )
}
