import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Tip } from '@/components/ui/tooltip'
import type { TooltipPlacement } from '@/components/ui/tooltip-placement'
import { Info } from '@/lib/icons'
import { cn } from '@/lib/utils'

type IconType = typeof Info

interface WerkzeugProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  icon: IconType
  /** What the button does: its tooltip and its accessible name. There is no visible word. */
  name: string
  gold?: boolean
  gross?: boolean
  placement?: TooltipPlacement
}

/**
 * A tool that is only a sign. Its meaning is carried by the tooltip for the
 * eye and by `aria-label` for everyone who does not see it — so a button never
 * needs a caption next to it.
 */
export function Werkzeug({
  className,
  gold,
  gross,
  icon: Icon,
  name,
  placement = 'toolbar',
  type = 'button',
  ...rest
}: WerkzeugProps) {
  return (
    <Tip label={name} placement={placement}>
      <button
        aria-label={name}
        className={cn('tikki-werkzeug', className)}
        data-gold={gold ? '' : undefined}
        data-gross={gross ? '' : undefined}
        type={type}
        {...rest}
      >
        <Icon aria-hidden className={gross ? 'size-[1.125rem]' : 'size-4'} stroke={1.7} />
      </button>
    </Tip>
  )
}

/** An explanation that waits behind a small sign instead of standing in the room as a paragraph. */
export function Hinweis({ className, text }: { className?: string; text: string }) {
  return (
    <Tip label={<span className="block max-w-72 text-pretty">{text}</span>} placement="control">
      <button
        aria-label={text}
        className={cn('tikki-werkzeug size-5! text-(--ui-text-tertiary)', className)}
        data-hinweis=""
        type="button"
      >
        <Info aria-hidden className="size-3.5" stroke={1.7} />
      </button>
    </Tip>
  )
}

/** The band along the top of an area: the window's grip, and the place for the area's few tools. */
export function Kopf({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <header className={cn('tikki-kopf', className)} data-tikki-kopf="">
      {children}
    </header>
  )
}

/** An empty place: a pale sign instead of a sentence. Its meaning is still announced. */
export function Leer({ icon: Icon, name, ...rest }: { icon: IconType; name: string } & Record<`data-${string}`, string>) {
  return (
    <div aria-label={name} className="tikki-leer" role="img" {...rest}>
      <Icon aria-hidden stroke={1.1} />
    </div>
  )
}
