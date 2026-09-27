import { useStore } from '@nanostores/react'
import DOMPurify from 'dompurify'
import { type FormEvent, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { Mail, Pencil, RefreshCw, Send, Trash2, X } from '@/lib/icons'
import { fmtDayTime } from '@/lib/time'
import { cn } from '@/lib/utils'

import { areaLabels } from './labels'
import {
  $busy,
  $compose,
  $error,
  $mailbox,
  $mailboxes,
  $mailStatus,
  $message,
  $messages,
  $notice,
  $selectedUid,
  cancelCompose,
  type ComposeDraft,
  loadMessages,
  mailLogin,
  mailLogout,
  markUnread,
  openMailbox,
  openMessage,
  refreshMailStatus,
  removeMessage,
  sendCompose,
  startCompose,
  startReply
} from './post/store'

type PostLabels = ReturnType<typeof areaLabels>['post']

/**
 * Mail area: sign-in card until an account is remembered, then the classic
 * three columns — folders, messages, reader — with compose taking the
 * reader's place while a draft is open.
 */
export function PostArea() {
  const { locale } = useI18n()
  const labels = areaLabels(locale).post
  const status = useStore($mailStatus)
  const error = useStore($error)
  const notice = useStore($notice)

  useEffect(() => {
    if ($mailStatus.get() === null) {
      void refreshMailStatus()
    }
  }, [])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 bg-(--ui-bg-primary)" data-post-area="">
      {status?.signedIn ? <Mailbox labels={labels} address={status.address ?? ''} /> : <SignIn labels={labels} />}
      {(error || notice) && (
        <div
          className={cn(
            'absolute bottom-3 left-1/2 z-10 max-w-lg -translate-x-1/2 rounded-md px-3 py-2 text-xs shadow-md',
            error ? 'bg-destructive text-white' : 'bg-(--ui-accent) text-white'
          )}
          role={error ? 'alert' : 'status'}
        >
          {error ?? notice}
        </div>
      )}
    </div>
  )
}

function SignIn({ labels }: { labels: PostLabels }) {
  const busy = useStore($busy)
  const [address, setAddress] = useState('')
  const [password, setPassword] = useState('')
  const signingIn = busy === 'login'

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    if (await mailLogin(address, password)) {
      setPassword('')
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form
        className="w-full max-w-sm rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-bg-chrome) p-6"
        onSubmit={submit}
      >
        <div className="mb-4 flex items-center gap-2 text-(--ui-text-primary)">
          <Mail aria-hidden className="size-5 text-(--ui-accent)" stroke={1.75} />
          <span className="text-base font-semibold">{labels.title}</span>
        </div>
        <p className="mb-4 text-sm text-(--ui-text-secondary)">{labels.signInIntro}</p>
        <label className="mb-3 block text-xs text-(--ui-text-secondary)">
          {labels.address}
          <Input
            autoFocus
            className="mt-1"
            inputMode="email"
            onChange={event => setAddress(event.target.value)}
            placeholder="name@tikki.team"
            value={address}
          />
        </label>
        <label className="mb-4 block text-xs text-(--ui-text-secondary)">
          {labels.password}
          <Input
            className="mt-1"
            onChange={event => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        <Button className="w-full" disabled={signingIn || !address || !password} type="submit">
          {signingIn ? labels.signingIn : labels.signInButton}
        </Button>
        <p className="mt-3 text-[0.7rem] leading-4 text-(--ui-text-secondary)">{labels.addressHint}</p>
      </form>
    </div>
  )
}

function Mailbox({ address, labels }: { address: string; labels: PostLabels }) {
  const mailboxes = useStore($mailboxes)
  const mailbox = useStore($mailbox)
  const messages = useStore($messages)
  const selectedUid = useStore($selectedUid)
  const compose = useStore($compose)
  const busy = useStore($busy)

  return (
    <>
      <aside className="flex w-56 shrink-0 flex-col border-r border-(--ui-stroke-secondary) bg-(--ui-bg-chrome)">
        <div className="px-3 pt-3 pb-2">
          <div className="text-sm font-semibold text-(--ui-text-primary)">{labels.title}</div>
          <div className="truncate font-mono text-[0.7rem] text-(--ui-text-secondary)" title={address}>
            {address}
          </div>
        </div>
        <Button className="mx-3 mb-2 justify-start" onClick={startCompose} size="sm" variant="secondary">
          <Pencil aria-hidden /> {labels.compose}
        </Button>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2">
          {mailboxes.map(box => (
            <button
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm',
                box.path === mailbox
                  ? 'bg-(--ui-accent)/15 text-(--ui-accent)'
                  : 'text-(--ui-text-primary) hover:bg-(--ui-bg-hover)'
              )}
              key={box.path}
              onClick={() => void openMailbox(box.path)}
              type="button"
            >
              <span className="truncate">{box.specialUse === '\\Inbox' ? labels.inbox : box.name}</span>
              {box.unseen ? <span className="ml-2 shrink-0 text-xs font-semibold">{box.unseen}</span> : null}
            </button>
          ))}
        </nav>
        <div className="border-t border-(--ui-stroke-secondary) p-2">
          <Button className="w-full" onClick={() => void mailLogout()} size="sm" variant="ghost">
            {labels.signOut}
          </Button>
        </div>
      </aside>

      <section className="flex w-80 shrink-0 flex-col border-r border-(--ui-stroke-secondary)">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) px-3 py-2">
          <span className="truncate text-sm font-medium text-(--ui-text-primary)">
            {mailboxes.find(box => box.path === mailbox)?.specialUse === '\\Inbox' ? labels.inbox : mailbox}
          </span>
          <Button
            aria-label={labels.refresh}
            disabled={busy === 'list'}
            onClick={() => void loadMessages()}
            size="icon-sm"
            title={labels.refresh}
            variant="ghost"
          >
            <RefreshCw aria-hidden className={cn(busy === 'list' && 'animate-spin')} />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 && (
            <p className="p-4 text-sm text-(--ui-text-secondary)">
              {busy === 'list' || busy === 'mailboxes' ? labels.loading : labels.noMessages}
            </p>
          )}
          {messages.map(entry => (
            <button
              className={cn(
                'block w-full border-b border-(--ui-stroke-secondary) px-3 py-2 text-left',
                entry.uid === selectedUid ? 'bg-(--ui-accent)/10' : 'hover:bg-(--ui-bg-hover)'
              )}
              key={entry.uid}
              onClick={() => void openMessage(entry.uid)}
              type="button"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-sm',
                    entry.seen ? 'text-(--ui-text-primary)' : 'font-semibold text-(--ui-text-primary)'
                  )}
                >
                  {entry.from || entry.fromAddress}
                </span>
                <span className="shrink-0 text-[0.68rem] text-(--ui-text-secondary)">
                  {entry.date ? fmtDayTime.format(new Date(entry.date)) : ''}
                </span>
              </div>
              <div
                className={cn(
                  'truncate text-xs',
                  entry.seen ? 'text-(--ui-text-secondary)' : 'text-(--ui-text-primary)'
                )}
              >
                {!entry.seen && (
                  <span
                    aria-label={labels.unread}
                    className="mr-1 inline-block size-1.5 rounded-full bg-(--ui-accent) align-middle"
                  />
                )}
                {entry.subject || '—'}
                {entry.hasAttachments ? ' 📎' : ''}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="flex min-w-0 flex-1 flex-col">
        {compose ? <Compose draft={compose} labels={labels} /> : <Reader labels={labels} />}
      </section>
    </>
  )
}

function Reader({ labels }: { labels: PostLabels }) {
  const message = useStore($message)
  const selectedUid = useStore($selectedUid)
  const busy = useStore($busy)

  const safeHtml = useMemo(
    () =>
      message?.html
        ? DOMPurify.sanitize(message.html, {
            FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
            USE_PROFILES: { html: true }
          })
        : null,
    [message]
  )

  if (selectedUid === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-(--ui-text-secondary)">
        <Mail aria-hidden className="size-10 opacity-60" stroke={1.5} />
        <p className="max-w-md text-sm">{labels.noSelection}</p>
      </div>
    )
  }

  if (!message) {
    return <p className="p-4 text-sm text-(--ui-text-secondary)">{busy === 'read' ? labels.loading : ''}</p>
  }

  return (
    <>
      <header className="border-b border-(--ui-stroke-secondary) px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 text-base font-semibold text-(--ui-text-primary)">{message.subject || '—'}</h2>
          <div className="flex shrink-0 gap-1">
            <Button onClick={() => startReply(message)} size="sm" variant="secondary">
              <Send aria-hidden /> {labels.reply}
            </Button>
            <Button onClick={() => void markUnread(message.uid)} size="sm" title={labels.markUnread} variant="ghost">
              <Mail aria-hidden />
            </Button>
            <Button
              aria-label={labels.delete}
              onClick={() => void removeMessage(message.uid)}
              size="icon-sm"
              title={labels.delete}
              variant="ghost"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-(--ui-text-secondary)">
          <dt>{labels.address}</dt>
          <dd className="truncate text-(--ui-text-primary)">{message.from}</dd>
          <dt>{labels.to}</dt>
          <dd className="truncate">{message.to}</dd>
          {message.cc && (
            <>
              <dt>{labels.cc}</dt>
              <dd className="truncate">{message.cc}</dd>
            </>
          )}
          <dt />
          <dd>{message.date ? fmtDayTime.format(new Date(message.date)) : ''}</dd>
        </dl>
        {message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            <span className="text-(--ui-text-secondary)">{labels.attachments}:</span>
            {message.attachments.map((part, index) => (
              <span
                className="rounded bg-(--ui-bg-chrome) px-1.5 py-0.5 text-(--ui-text-primary)"
                key={`${part.filename}-${index}`}
              >
                {part.filename}{' '}
                <span className="text-(--ui-text-secondary)">({Math.max(1, Math.round(part.size / 1024))} KB)</span>
              </span>
            ))}
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {safeHtml ? (
          <div
            className="mail-html max-w-full text-sm text-(--ui-text-primary) [&_a]:text-(--ui-accent) [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <pre className="font-sans text-sm whitespace-pre-wrap text-(--ui-text-primary)">{message.text}</pre>
        )}
      </div>
    </>
  )
}

function Compose({ draft, labels }: { draft: ComposeDraft; labels: PostLabels }) {
  const busy = useStore($busy)
  const [to, setTo] = useState(draft.to)
  const [cc, setCc] = useState(draft.cc ?? '')
  const [subject, setSubject] = useState(draft.subject)
  const [text, setText] = useState(draft.text)
  const sending = busy === 'send'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await sendCompose({ ...draft, cc, subject, text, to }, labels.sent)
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <header className="flex items-center justify-between border-b border-(--ui-stroke-secondary) px-4 py-2">
        <span className="text-sm font-medium text-(--ui-text-primary)">
          {draft.replyToUid ? labels.reply : labels.compose}
        </span>
        <div className="flex gap-1">
          <Button onClick={cancelCompose} size="sm" type="button" variant="ghost">
            <X aria-hidden /> {labels.cancel}
          </Button>
          <Button disabled={sending || !to.trim()} size="sm" type="submit">
            <Send aria-hidden /> {sending ? labels.sending : labels.send}
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b border-(--ui-stroke-secondary) px-4 py-3 text-xs text-(--ui-text-secondary)">
        <label htmlFor="tikki-mail-to">{labels.to}</label>
        <Input
          autoFocus={!draft.replyToUid}
          id="tikki-mail-to"
          inputMode="email"
          onChange={event => setTo(event.target.value)}
          value={to}
        />
        <label htmlFor="tikki-mail-cc">{labels.cc}</label>
        <Input id="tikki-mail-cc" inputMode="email" onChange={event => setCc(event.target.value)} value={cc} />
        <label htmlFor="tikki-mail-subject">{labels.subject}</label>
        <Input id="tikki-mail-subject" onChange={event => setSubject(event.target.value)} value={subject} />
      </div>
      <Textarea
        autoCapitalize="sentences"
        autoCorrect="on"
        autoFocus={Boolean(draft.replyToUid)}
        className="m-3 min-h-0 flex-1 resize-none font-sans text-sm"
        onChange={event => setText(event.target.value)}
        spellCheck
        value={text}
      />
    </form>
  )
}
