import { useEffect, useState } from 'react'

import { getProfiles, getProfileSoul, updateProfileSoul } from '@/api/profiles'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

import { areaLabels } from '../labels'

import { ROLLEN } from './katalog'

/**
 * Rules & prompts: every role's SOUL, read from and written to the backend
 * (`/api/profiles/<name>/soul`). The catalogue drives the list; a role whose
 * Hermes profile does not exist yet is shown but read-only.
 */
export function RegelnSection() {
  const { locale } = useI18n()
  const r = areaLabels(locale).admin.roles
  const [slug, setSlug] = useState(ROLLEN[0]?.slug ?? '')
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'missing'>('idle')

  useEffect(() => {
    getProfiles()
      .then(res => setExisting(new Set(res.profiles.map(p => p.name))))
      .catch(() => setExisting(new Set()))
  }, [])

  useEffect(() => {
    if (!slug) {
      return
    }

    let stale = false

    setState('loading')
    getProfileSoul(slug)
      .then(soul => {
        if (stale) {
          return
        }

        setText(soul.content)
        setState(soul.exists ? 'idle' : 'missing')
      })
      .catch(() => {
        if (!stale) {
          setText('')
          setState('missing')
        }
      })

    return () => {
      stale = true
    }
  }, [slug])

  const save = async () => {
    setState('saving')

    try {
      await updateProfileSoul(slug, text)
      setState('saved')
      window.setTimeout(() => setState(prev => (prev === 'saved' ? 'idle' : prev)), 2000)
    } catch {
      setState('idle')
    }
  }

  const canEdit = existing.has(slug) && state !== 'missing' && state !== 'loading'

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex w-56 shrink-0 flex-col gap-0.5">
        <div className="px-2 pb-1 text-xs text-(--ui-text-secondary)">{r.pick}</div>
        {ROLLEN.map(role => (
          <button
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
              role.slug === slug
                ? 'bg-(--ui-accent)/15 text-(--ui-accent)'
                : 'text-(--ui-text-primary) hover:bg-(--ui-fill-quinary)'
            )}
            key={role.slug}
            onClick={() => setSlug(role.slug)}
            type="button"
          >
            <span aria-hidden>{role.icon}</span>
            <span className="truncate">{role.name}</span>
            {!existing.has(role.slug) && (
              <span className="ml-auto size-1.5 rounded-full bg-(--ui-text-secondary)/40" title={r.missingProfile} />
            )}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {state === 'missing' && <p className="text-xs text-(--ui-text-secondary)">{r.missingProfile}</p>}
        <Textarea
          className="min-h-[24rem] flex-1 font-mono text-xs"
          disabled={!canEdit}
          onChange={e => setText(e.target.value)}
          placeholder={state === 'loading' ? r.loading : ''}
          value={text}
        />
        <div className="flex items-center gap-3">
          <Button disabled={!canEdit || state === 'saving'} onClick={() => void save()} size="sm">
            {r.save}
          </Button>
          {state === 'saved' && <span className="text-xs text-(--ui-accent)">{r.saved}</span>}
        </div>
      </div>
    </div>
  )
}
