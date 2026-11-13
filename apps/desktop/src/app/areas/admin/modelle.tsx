import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { ModelSettings } from '@/app/settings/model-settings'
import { useI18n } from '@/i18n'

import { areaLabels } from '../labels'

import { KATALOG } from './katalog'
import { $ressourcen, $ressourcenStatus, anbieterZeichen, ladeRessourcen } from './ressourcen'
import { $rollenStand, $rollenStandStatus, beobachteRollenStand } from './rollen-stand'

/**
 * Model routing at a glance: who runs on what. The model column is what each
 * role's profile is configured with, read from the backend; the catalogue's
 * chain (the same file the setup script uses) stands beside it as the default
 * a fresh setup writes. The MR card asks the backend what is actually free;
 * the Hermes model panel below changes the app's own default model.
 */
export function ModelleSection() {
  const { locale } = useI18n()
  const b = areaLabels(locale).admin.bots
  const stand = useStore($rollenStand)
  const status = useStore($rollenStandStatus)

  useEffect(() => beobachteRollenStand(), [])

  // No answer yet claims nothing; a role without a profile says so.
  const eingestellt = (slug: string) => {
    if (!stand) {
      return '–'
    }

    return stand[slug] ? (stand[slug].modell ?? '–') : b.missing
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {status === 'fehler' && (
        <p className="text-xs text-destructive" role="alert">
          {b.statusFehler}
        </p>
      )}
      <table className="w-full text-sm" data-modelle-status={status}>
        <thead className="text-left text-xs text-(--ui-text-secondary) uppercase">
          <tr>
            <th className="py-1.5 pr-3 font-medium">{b.name}</th>
            <th className="py-1.5 pr-3 font-medium">{b.model}</th>
            <th className="py-1.5 pr-3 font-medium">{b.vorgabe}</th>
          </tr>
        </thead>
        <tbody>
          {KATALOG.map(r => (
            <tr className="border-t border-(--ui-stroke-secondary)" data-modell-rolle={r.slug} key={r.slug}>
              <td className="py-1.5 pr-3 text-(--ui-text-primary)">
                <span aria-hidden className="mr-1.5">
                  {r.icon}
                </span>
                {r.name}
              </td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-primary)" data-modell-eingestellt="">
                {eingestellt(r.slug)}
              </td>
              <td className="py-1.5 pr-3 font-mono text-xs text-(--ui-text-secondary)">
                {r.modell.primary} · {r.modell.fallback}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <RessourcenKarte />
      <ModelSettings />
    </div>
  )
}

/** „Ressourcen (MR)“: providers with ✓/⚠, subscriptions, and what is free right now. */
function RessourcenKarte() {
  const { locale } = useI18n()
  const t = areaLabels(locale).admin.ressourcen
  const stand = useStore($ressourcen)
  const status = useStore($ressourcenStatus)

  return (
    <section
      className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-4"
      data-ressourcen-status={status}
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>📡</span>
        <span className="text-sm font-semibold text-(--ui-text-primary)">{t.titel}</span>
        <span className="text-xs text-(--ui-text-secondary)" role="status">
          {status === 'laedt' ? t.laedt : status === 'fehler' ? t.fehler : ''}
        </span>
        <button
          className="ml-auto rounded-md border border-(--ui-stroke-secondary) px-2 py-1 text-xs text-(--ui-text-primary) hover:bg-(--ui-fill-quinary) disabled:opacity-50"
          disabled={status === 'laedt'}
          onClick={() => void ladeRessourcen()}
          type="button"
        >
          {stand ? t.aktualisieren : t.pruefen}
        </button>
      </div>
      <p className="mt-2 text-xs text-(--ui-text-secondary)">{t.erklaerung}</p>
      {stand && (
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <table className="w-full">
            <thead className="text-left text-xs text-(--ui-text-secondary) uppercase">
              <tr>
                <th className="py-1 pr-3 font-medium">{t.anbieter}</th>
                <th className="py-1 pr-3 font-medium">{t.schluessel}</th>
                <th className="py-1 pr-3 font-medium">{t.erreichbar}</th>
                <th className="py-1 pr-3 font-medium">{t.modelle}</th>
              </tr>
            </thead>
            <tbody>
              {stand.anbieter.map(a => (
                <tr className="border-t border-(--ui-stroke-secondary)" key={a.name}>
                  <td className="py-1 pr-3 font-mono text-xs text-(--ui-text-primary)">{a.name}</td>
                  <td className="py-1 pr-3 font-mono text-xs text-(--ui-text-secondary)">
                    {a.weg === 'abo' ? t.abo : a.schluessel.join(', ') || a.schluessel_fehlt.join(', ') || '–'}
                  </td>
                  <td className="py-1 pr-3 text-xs text-(--ui-text-primary)">
                    <span aria-hidden className="mr-1">
                      {anbieterZeichen(a)}
                    </span>
                    {a.weg === 'abo' && a.erreichbar === null
                      ? a.abo
                        ? t.angemeldet
                        : t.abgemeldet
                      : a.erreichbar
                        ? t.ja
                        : a.befund || t.nichtGeprueft}
                  </td>
                  <td className="py-1 pr-3 font-mono text-xs text-(--ui-text-secondary)">
                    {a.modelle.slice(0, 4).join(', ') || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-(--ui-text-secondary)">
            <span className="font-medium text-(--ui-text-primary)">{t.abos}: </span>
            {stand.abos
              .map(
                x =>
                  `${x.name} ${x.vorhanden ? `✓ ${x.version || ''}`.trim() : '✗'}${
                    x.vorhanden && x.angemeldet !== null ? `, ${x.angemeldet ? t.angemeldet : t.abgemeldet}` : ''
                  }`
              )
              .join(' · ') || '–'}
          </p>
          <p className="text-xs text-(--ui-text-secondary)">
            <span className="font-medium text-(--ui-text-primary)">{t.lokal}: </span>
            {stand.lokal.server.length
              ? stand.lokal.server.map(s => `${s.adresse} [${s.modelle.join(', ') || s.art}]`).join(' · ')
              : t.keinServer}
          </p>
          <p className="text-sm text-(--ui-text-primary)" data-frei-jetzt>
            <span className="font-semibold">{t.frei}: </span>
            {stand.frei.length
              ? stand.frei.map((f, i) => (i === 0 ? `${f.slug} (${f.grund})` : f.slug)).join(' · ')
              : t.nichtsFrei}
          </p>
        </div>
      )}
    </section>
  )
}
