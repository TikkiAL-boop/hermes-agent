// Tikki's standing orders ("Daueraufträge"): Hermes cron jobs in her own
// profile, created by Tikki herself with the cronjob tool when the person says
// "check the mail every 4 minutes". The overview lists them so the person sees
// what runs for them around the clock.
//
// A room's schedule is one of these jobs too: when the person picks a rhythm in
// the "new room" form, the app creates the job (`cron.manage add`), and the room
// shows it by reading the job list — the schedule lives in Hermes cron, not in a
// line somebody wrote into the room.

import { atom } from 'nanostores'

import { requestGatewayForProfile } from '@/store/gateway'

export const PA_PROFIL = 'tikki'

export interface Auftrag {
  id: string
  name: string
  plan: string
  naechster: number | null
  zuletzt: number | null
  letzterStand: string | null
  aktiv: boolean
}

export const $auftraege = atom<Auftrag[]>([])
export const $auftraegeStatus = atom<'leer' | 'laedt' | 'bereit' | 'fehler'>('leer')

const zahl = (wert: unknown): number | null => {
  if (typeof wert === 'number' && Number.isFinite(wert)) {
    return wert > 1e12 ? wert : wert * 1000
  }

  if (typeof wert === 'string' && wert.trim()) {
    const t = Date.parse(wert)

    return Number.isFinite(t) ? t : null
  }

  return null
}

/** Pure: one job of the gateway's cron list → what the card shows. */
export function auftragAusJob(job: unknown): Auftrag | null {
  const j = (job ?? {}) as Record<string, unknown>
  const id = String(j.job_id ?? j.id ?? '').trim()

  if (!id) {
    return null
  }

  const stand = j.last_status ?? j.last_run_status ?? null

  return {
    id,
    name: String(j.name ?? '').trim() || id,
    plan: String(j.schedule_display ?? j.schedule ?? '').trim(),
    naechster: zahl(j.next_run_at),
    zuletzt: zahl(j.last_run_at),
    letzterStand: typeof stand === 'string' && stand ? stand : null,
    aktiv: j.enabled !== false && j.state !== 'paused' && j.paused !== true
  }
}

/** The name of a room's schedule job (shared with `tikki/werkzeuge/raeume.py::ZEITPLAN_NAME`). */
export const raumZeitplanName = (roomId: string): string => `Raumrunde ${roomId}`

/** The schedule of one room among the standing orders, if it has one. */
export const raumZeitplan = (auftraege: readonly Auftrag[], roomId: string): Auftrag | undefined =>
  auftraege.find(a => a.name === raumZeitplanName(roomId))

/** What the schedule asks of Tikki on every run (shared with `suite_takt.py::runden_prompt`). */
export const raumZeitplanPrompt = (raum: { id: string; titel: string }): string =>
  `Im Raum „${raum.titel}“ (Kennung ${raum.id}) ist die nächste regelmäßige Runde dran. ` +
  'Schau dir den Stand des Raums an und stoße die Runde dort an.'

/**
 * Create the schedule the person chose for a room, as a Hermes cron job in Tikki's profile.
 * A room that already has one keeps it. Throws when the backend refuses.
 */
export async function raumZeitplanAnlegen(raum: { id: string; titel: string }, plan: string): Promise<void> {
  if (!plan.trim() || raumZeitplan(await ladeAuftraege(), raum.id)) {
    return
  }

  const antwort = await requestGatewayForProfile<{ error?: string; success?: boolean }>(
    PA_PROFIL,
    'cron.manage',
    {
      action: 'add',
      name: raumZeitplanName(raum.id),
      schedule: plan.trim(),
      prompt: raumZeitplanPrompt(raum),
      deliver: 'local',
      profile: PA_PROFIL
    },
    20_000
  )

  if (antwort?.success === false || antwort?.error) {
    throw new Error(antwort.error || 'cron.manage add failed')
  }

  await ladeAuftraege()
}

export async function ladeAuftraege(): Promise<Auftrag[]> {
  $auftraegeStatus.set('laedt')

  try {
    const antwort = await requestGatewayForProfile<{ jobs?: unknown[] }>(
      PA_PROFIL,
      'cron.manage',
      { action: 'list', include_disabled: true, profile: PA_PROFIL },
      20_000,
      undefined,
      { spawnPriority: 'background' }
    )

    const liste = (Array.isArray(antwort?.jobs) ? antwort.jobs : [])
      .map(auftragAusJob)
      .filter((a): a is Auftrag => a !== null)
      .sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || (a.naechster ?? Infinity) - (b.naechster ?? Infinity))

    $auftraege.set(liste)
    $auftraegeStatus.set('bereit')

    return liste
  } catch {
    $auftraegeStatus.set('fehler')

    return $auftraege.get()
  }
}
