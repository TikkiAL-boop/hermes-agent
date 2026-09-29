// Tikki Post: renderer state for the mail client. All network work happens
// in main (electron/tikki-mail.ts) behind `window.hermesDesktop.tikkiMail`;
// this store only remembers what the user is looking at.

import { atom } from 'nanostores'

import type { MailboxInfo, MailMessage, MailStatus, MailSummary, SendMailInput } from '../../../../electron/tikki-mail'

export type { MailboxInfo, MailMessage, MailStatus, MailSummary }

export interface ComposeDraft extends SendMailInput {
  /** Set when replying, so the reader can show which message is answered. */
  replyToUid?: number
}

export const $mailStatus = atom<MailStatus | null>(null)
export const $mailboxes = atom<MailboxInfo[]>([])
export const $mailbox = atom<string>('INBOX')
export const $messages = atom<MailSummary[]>([])
export const $selectedUid = atom<number | null>(null)
export const $message = atom<MailMessage | null>(null)
export const $compose = atom<ComposeDraft | null>(null)
export const $busy = atom<'status' | 'login' | 'mailboxes' | 'list' | 'read' | 'send' | 'remove' | null>(null)
export const $error = atom<string | null>(null)
export const $notice = atom<string | null>(null)

const api = () => {
  const bridge = window.hermesDesktop?.tikkiMail

  if (!bridge) {
    throw new Error('Desktop IPC bridge is unavailable.')
  }

  return bridge
}

/** Electron wraps thrown errors as "Error invoking remote method '…': Error: msg". */
export function cleanIpcError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)

  return raw.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
}

async function guarded<T>(
  kind: NonNullable<ReturnType<typeof $busy.get>>,
  run: () => Promise<T>
): Promise<T | undefined> {
  $busy.set(kind)
  $error.set(null)

  try {
    return await run()
  } catch (error) {
    $error.set(cleanIpcError(error))

    return undefined
  } finally {
    if ($busy.get() === kind) {
      $busy.set(null)
    }
  }
}

export async function refreshMailStatus(): Promise<void> {
  const status = await guarded('status', () => api().status())

  if (status) {
    $mailStatus.set(status)

    if (status.signedIn) {
      await loadMailboxes()
    }
  }
}

export async function mailLogin(address: string, password: string): Promise<boolean> {
  const status = await guarded('login', () => api().login({ address, password }))

  if (!status) {
    return false
  }

  $mailStatus.set(status)
  await loadMailboxes()

  return true
}

export async function mailLogout(): Promise<void> {
  const status = await guarded('status', () => api().logout())

  $mailStatus.set(status ?? { address: null, signedIn: false })
  $mailboxes.set([])
  $messages.set([])
  $message.set(null)
  $selectedUid.set(null)
  $compose.set(null)
}

export async function loadMailboxes(): Promise<void> {
  const boxes = await guarded('mailboxes', () => api().mailboxes())

  if (!boxes) {
    return
  }

  $mailboxes.set(boxes)

  const current = $mailbox.get()

  if (!boxes.some(box => box.path === current)) {
    $mailbox.set(boxes.find(box => box.specialUse === '\\Inbox')?.path ?? boxes[0]?.path ?? 'INBOX')
  }

  await loadMessages()
}

export async function openMailbox(path: string): Promise<void> {
  $mailbox.set(path)
  $selectedUid.set(null)
  $message.set(null)
  await loadMessages()
}

export async function loadMessages(): Promise<void> {
  const mailbox = $mailbox.get()
  const list = await guarded('list', () => api().list(mailbox, 80))

  if (list && $mailbox.get() === mailbox) {
    $messages.set(list)
  }
}

export async function openMessage(uid: number): Promise<void> {
  const mailbox = $mailbox.get()
  $selectedUid.set(uid)
  $message.set(null)

  const message = await guarded('read', () => api().read(mailbox, uid))

  if (message && $selectedUid.get() === uid) {
    $message.set(message)
    $messages.set($messages.get().map(entry => (entry.uid === uid ? { ...entry, seen: true } : entry)))
  }
}

export async function markUnread(uid: number): Promise<void> {
  const mailbox = $mailbox.get()

  const ok = await guarded('read', async () => {
    await api().setSeen(mailbox, uid, false)

    return true
  })

  if (ok) {
    $messages.set($messages.get().map(entry => (entry.uid === uid ? { ...entry, seen: false } : entry)))
  }
}

export async function removeMessage(uid: number): Promise<void> {
  const mailbox = $mailbox.get()

  const ok = await guarded('remove', async () => {
    await api().remove(mailbox, uid)

    return true
  })

  if (ok) {
    $messages.set($messages.get().filter(entry => entry.uid !== uid))

    if ($selectedUid.get() === uid) {
      $selectedUid.set(null)
      $message.set(null)
    }
  }
}

export function startCompose(): void {
  $compose.set({ subject: '', text: '', to: '' })
}

export function startReply(message: MailMessage): void {
  const quoted = message.text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')

  const subject = /^(re|aw):/i.test(message.subject) ? message.subject : `Re: ${message.subject}`

  $compose.set({
    inReplyTo: message.messageId,
    references: message.messageId,
    replyToUid: message.uid,
    subject,
    text: `\n\n${message.from} schrieb:\n${quoted}`,
    to: message.fromAddress || message.from
  })
}

export function cancelCompose(): void {
  $compose.set(null)
}

export async function sendCompose(draft: ComposeDraft, sentNotice: string): Promise<boolean> {
  const result = await guarded('send', () =>
    api().send({
      cc: draft.cc,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      subject: draft.subject,
      text: draft.text,
      to: draft.to
    })
  )

  if (!result) {
    return false
  }

  $compose.set(null)
  $notice.set(sentNotice)
  window.setTimeout(() => $notice.set(null), 4000)

  return true
}
