// Tikki Post: renderer state for the mail client. All network work happens
// in main (electron/tikki-mail.ts) behind `window.hermesDesktop.tikkiMail`;
// this store only remembers what the user is looking at.

import { atom } from 'nanostores'

import type { MailboxInfo, MailMessage, MailStatus, MailSummary, SendMailInput } from '../../../../electron/tikki-mail'

export type { MailboxInfo, MailMessage, MailStatus, MailSummary }

/**
 * The mail being written. `$compose` holds it as the person types, not just
 * how it started: the Post area unmounts when they look at another area, and
 * the draft must still be there when they come back.
 */
export interface ComposeDraft extends SendMailInput {
  /** Which draft this is: a new one replaces the fields, a keystroke does not. */
  id: number
  /** Set when replying, so the reader can show which message is answered. */
  replyToUid?: number
}

/** A message, named in full: a uid counts within its folder only. */
export interface MessageRef {
  mailbox: string
  uid: number
}

/** The message in the reader, with the folder it was read from. */
export type OpenMessage = MailMessage & MessageRef

export type MailVorgang = 'status' | 'login' | 'mailboxes' | 'list' | 'read' | 'send' | 'remove'

export const $mailStatus = atom<MailStatus | null>(null)
export const $mailboxes = atom<MailboxInfo[]>([])
export const $mailbox = atom<string>('INBOX')
export const $messages = atom<MailSummary[]>([])
export const $selectedUid = atom<number | null>(null)
export const $message = atom<OpenMessage | null>(null)
export const $compose = atom<ComposeDraft | null>(null)
/** Everything running right now — several things can at once (a list loading while a message is read). */
export const $busy = atom<ReadonlySet<MailVorgang>>(new Set())
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

const laufend = new Map<MailVorgang, number>()

// Counted per kind: two reads in flight are "reading" until the second is back.
function zaehle(kind: MailVorgang, schritt: 1 | -1): void {
  const zahl = (laufend.get(kind) ?? 0) + schritt

  if (zahl > 0) {
    laufend.set(kind, zahl)
  } else {
    laufend.delete(kind)
  }

  $busy.set(new Set(laufend.keys()))
}

async function guarded<T>(kind: MailVorgang, run: () => Promise<T>): Promise<T | undefined> {
  zaehle(kind, 1)
  $error.set(null)

  try {
    return await run()
  } catch (error) {
    $error.set(cleanIpcError(error))

    return undefined
  } finally {
    zaehle(kind, -1)
  }
}

/** Is the person still looking at this folder? */
const imOrdner = (mailbox: string) => $mailbox.get() === mailbox

/** Change the list on screen — if it is still the list of that folder. */
function inListe(mailbox: string, aendern: (liste: MailSummary[]) => MailSummary[]): void {
  if (imOrdner(mailbox)) {
    $messages.set(aendern($messages.get()))
  }
}

// Folder lists are asked for from several places and may answer out of order:
// each request takes a number, and an answer older than one already on screen
// is dropped. Signing out retires every number handed out so far.
let ordnerLauf = 0
let ordnerStand = 0
let konto = 0

function setzeOrdner(lauf: number, boxes: MailboxInfo[]): boolean {
  if (lauf <= ordnerStand) {
    return false
  }

  ordnerStand = lauf
  $mailboxes.set(boxes)

  return true
}

/**
 * The folders with their unread counts, re-read after anything that changes
 * them (a message read, marked, deleted; a refresh). Quiet: what the person
 * did has already happened, a miss here only leaves the old numbers.
 */
async function refreshCounts(): Promise<void> {
  const lauf = ++ordnerLauf

  try {
    setzeOrdner(lauf, await api().mailboxes())
  } catch {
    // The old numbers stay.
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

/** The folder on screen, fresh: its messages and every folder's count. */
export async function refreshMailbox(): Promise<void> {
  await Promise.all([loadMessages(), refreshCounts()])
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

  // A folder list still on its way belongs to the account that just left.
  konto++
  ordnerStand = ++ordnerLauf
  $mailStatus.set(status ?? { address: null, signedIn: false })
  $mailboxes.set([])
  $messages.set([])
  $message.set(null)
  $selectedUid.set(null)
  $compose.set(null)
}

export async function loadMailboxes(): Promise<void> {
  const lauf = ++ordnerLauf
  const meinKonto = konto
  const geladen = await guarded('mailboxes', () => api().mailboxes())

  if (!geladen || meinKonto !== konto) {
    return
  }

  // A newer answer may already be on screen; the folder on screen is checked against whichever is.
  setzeOrdner(lauf, geladen)

  const boxes = $mailboxes.get()
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
  const meinKonto = konto
  const list = await guarded('list', () => api().list(mailbox, 80))

  if (list && meinKonto === konto && imOrdner(mailbox)) {
    $messages.set(list)
  }
}

const mitSeen = (uid: number, seen: boolean) => (liste: MailSummary[]) =>
  liste.map(entry => (entry.uid === uid ? { ...entry, seen } : entry))

export async function openMessage(uid: number): Promise<void> {
  const mailbox = $mailbox.get()
  $selectedUid.set(uid)
  $message.set(null)

  const message = await guarded('read', () => api().read(mailbox, uid))

  // The answer belongs on screen only while the person looks at this folder
  // AND this message: the same uid in another folder is another mail.
  if (!message || !imOrdner(mailbox) || $selectedUid.get() !== uid) {
    return
  }

  $message.set({ ...message, mailbox })
  inListe(mailbox, mitSeen(uid, true))
  void refreshCounts()
}

/** Mark a message unread, in the folder it lives in — whatever is on screen by the time the server answers. */
export async function markUnread({ mailbox, uid }: MessageRef): Promise<void> {
  const ok = await guarded('read', async () => {
    await api().setSeen(mailbox, uid, false)

    return true
  })

  if (ok) {
    inListe(mailbox, mitSeen(uid, false))
    void refreshCounts()
  }
}

/** Delete a message from the folder it lives in. */
export async function removeMessage({ mailbox, uid }: MessageRef): Promise<void> {
  const ok = await guarded('remove', async () => {
    await api().remove(mailbox, uid)

    return true
  })

  if (!ok) {
    return
  }

  inListe(mailbox, liste => liste.filter(entry => entry.uid !== uid))

  if (imOrdner(mailbox) && $selectedUid.get() === uid) {
    $selectedUid.set(null)
    $message.set(null)
  }

  void refreshCounts()
}

let entwurf = 0

export function startCompose(): void {
  $compose.set({ id: ++entwurf, subject: '', text: '', to: '' })
}

/** `wrote` words the line above the quote ("Karin wrote:") in the person's language. */
export function startReply(message: MailMessage, wrote: (from: string) => string): void {
  const quoted = message.text
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n')

  const subject = /^(re|aw):/i.test(message.subject) ? message.subject : `Re: ${message.subject}`

  $compose.set({
    id: ++entwurf,
    inReplyTo: message.messageId,
    references: message.messageId,
    replyToUid: message.uid,
    subject,
    text: `\n\n${wrote(message.from)}\n${quoted}`,
    to: message.fromAddress || message.from
  })
}

/** A field of the draft, as typed. */
export function updateCompose(patch: Partial<Pick<ComposeDraft, 'cc' | 'subject' | 'text' | 'to'>>): void {
  const draft = $compose.get()

  if (draft) {
    $compose.set({ ...draft, ...patch })
  }
}

export function cancelCompose(): void {
  $compose.set(null)
}

export async function sendCompose(sentNotice: string): Promise<boolean> {
  const draft = $compose.get()

  if (!draft) {
    return false
  }

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

  // A draft started while this one was on its way is not the one that was sent.
  if ($compose.get()?.id === draft.id) {
    $compose.set(null)
  }

  $notice.set(sentNotice)
  window.setTimeout(() => $notice.set(null), 4000)

  return true
}
