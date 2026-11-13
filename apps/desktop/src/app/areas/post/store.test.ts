import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  $busy,
  $compose,
  $mailbox,
  $mailboxes,
  $message,
  $messages,
  $selectedUid,
  loadMailboxes,
  mailLogout,
  markUnread,
  openMailbox,
  openMessage,
  removeMessage,
  sendCompose,
  startCompose,
  startReply,
  updateCompose
} from './store'

interface Mail {
  seen: boolean
  subject: string
  uid: number
}

/** A mail server: folders of messages, uids counted per folder — the same uid lives in several. */
const server: Record<string, Mail[]> = {}

/** Answers held back until the test lets them through, to play slow and out-of-order replies. */
const wartend: { freigeben: () => void; methode: string }[] = []
let langsam = new Set<string>()

const antworte = <T>(methode: string, wert: () => T): Promise<T> =>
  langsam.has(methode)
    ? new Promise(resolve => wartend.push({ freigeben: () => resolve(wert()), methode }))
    : Promise.resolve(wert())

/** Let the oldest held-back answer of a method through. */
const lasseDurch = async (methode: string) => {
  const i = wartend.findIndex(w => w.methode === methode)

  wartend.splice(i, 1)[0]!.freigeben()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve))
}

const gesendet: unknown[] = []

const bruecke = {
  list: (mailbox: string) =>
    antworte('list', () =>
      (server[mailbox] ?? []).map(m => ({ date: null, from: 'Karin', seen: m.seen, subject: m.subject, uid: m.uid }))
    ),
  logout: () => antworte('logout', () => ({ address: null, signedIn: false })),
  // The counts are taken when the server answers, like a real one.
  mailboxes: () =>
    antworte('mailboxes', () =>
      Object.entries(server).map(([path, mails]) => ({
        name: path,
        path,
        specialUse: path === 'INBOX' ? '\\Inbox' : null,
        unseen: mails.filter(m => !m.seen).length
      }))
    ),
  read: (mailbox: string, uid: number) =>
    antworte('read', () => {
      const mail = server[mailbox]!.find(m => m.uid === uid)!

      mail.seen = true

      return {
        date: null,
        from: 'Karin',
        fromAddress: 'karin@example.org',
        html: null,
        messageId: `<${mailbox}-${uid}@example.org>`,
        subject: mail.subject,
        text: `Text von ${mail.subject}`,
        to: 'ich@example.org',
        uid
      }
    }),
  remove: (mailbox: string, uid: number) =>
    antworte('remove', () => {
      server[mailbox] = server[mailbox]!.filter(m => m.uid !== uid)
    }),
  send: (input: unknown) =>
    antworte('send', () => {
      gesendet.push(input)

      return { messageId: '<neu@example.org>' }
    }),
  setSeen: (mailbox: string, uid: number, seen: boolean) =>
    antworte('setSeen', () => {
      server[mailbox]!.find(m => m.uid === uid)!.seen = seen
    })
}

const ungelesen = (path: string) => $mailboxes.get().find(box => box.path === path)?.unseen
const betreffs = () => $messages.get().map(m => m.subject)
const ruhe = () => new Promise(resolve => setTimeout(resolve))

beforeEach(async () => {
  for (const ordner of Object.keys(server)) {
    delete server[ordner]
  }

  server.INBOX = [
    { seen: false, subject: 'Einladung', uid: 1 },
    { seen: false, subject: 'Rechnung', uid: 2 }
  ]
  server.Archiv = [
    { seen: true, subject: 'Altes Angebot', uid: 1 },
    { seen: true, subject: 'Alter Vertrag', uid: 2 }
  ]
  langsam = new Set()
  wartend.length = 0
  gesendet.length = 0
  Object.defineProperty(window, 'hermesDesktop', { configurable: true, value: { tikkiMail: bruecke } })

  await mailLogout()
  $mailbox.set('INBOX')
  await loadMailboxes()
})

afterEach(() => {
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('a uid counts within its folder only', () => {
  it('a message that arrives after the person changed folder is not shown as that folder’s', async () => {
    langsam = new Set(['read'])

    const liest = openMessage(1)

    await openMailbox('Archiv')
    // The person now opens uid 1 of the archive; the inbox's uid 1 is still on its way.
    const liestArchiv = openMessage(1)

    await lasseDurch('read')
    expect($message.get()).toBeNull()

    await lasseDurch('read')
    await Promise.all([liest, liestArchiv])

    expect($message.get()).toMatchObject({ mailbox: 'Archiv', subject: 'Altes Angebot', uid: 1 })
  })

  it('"mark unread" and "delete" act on the folder the message was read from', async () => {
    await openMessage(2)

    const offen = $message.get()!

    await openMailbox('Archiv')
    await markUnread(offen)
    await ruhe()

    expect(server.INBOX!.find(m => m.uid === 2)!.seen).toBe(false)
    // The archive has a uid 2 as well: it is neither touched on the server nor on screen.
    expect(server.Archiv!.find(m => m.uid === 2)!.seen).toBe(true)
    expect($messages.get().find(m => m.uid === 2)!.seen).toBe(true)

    await removeMessage(offen)
    await ruhe()

    expect(server.INBOX!.map(m => m.uid)).toEqual([1])
    expect(server.Archiv!.map(m => m.uid)).toEqual([1, 2])
    expect(betreffs()).toEqual(['Altes Angebot', 'Alter Vertrag'])
  })

  it('a slow list of the folder just left does not replace the list on screen', async () => {
    langsam = new Set(['list'])

    const inbox = openMailbox('INBOX')
    const archiv = openMailbox('Archiv')

    // The archive answers first, the inbox after it.
    wartend.reverse()
    await lasseDurch('list')
    await lasseDurch('list')
    await Promise.all([inbox, archiv])

    expect($mailbox.get()).toBe('Archiv')
    expect(betreffs()).toEqual(['Altes Angebot', 'Alter Vertrag'])
  })
})

describe('the unread count beside a folder', () => {
  it('follows what the person does: read, mark unread, delete', async () => {
    expect(ungelesen('INBOX')).toBe(2)

    await openMessage(1)
    await ruhe()
    expect(ungelesen('INBOX')).toBe(1)

    await markUnread($message.get()!)
    await ruhe()
    expect(ungelesen('INBOX')).toBe(2)

    await removeMessage($message.get()!)
    await ruhe()
    expect(ungelesen('INBOX')).toBe(1)
    expect($message.get()).toBeNull()
    expect($selectedUid.get()).toBeNull()
  })

  it('never goes back to an older answer that arrives late', async () => {
    langsam = new Set(['mailboxes'])

    const alt = loadMailboxes()

    await ruhe()
    langsam = new Set()
    await openMessage(1)
    await ruhe()
    expect(ungelesen('INBOX')).toBe(1)

    // The first request was sent when two were unread; say the server answers it only now, with that number.
    server.INBOX!.find(m => m.uid === 1)!.seen = false
    await lasseDurch('mailboxes')
    await alt

    expect(ungelesen('INBOX')).toBe(1)
  })
})

describe('what is running', () => {
  it('stays "running" until the last of several things is back', async () => {
    langsam = new Set(['list', 'read'])

    const liste = openMailbox('INBOX')
    const lesen = openMessage(1)

    expect([...$busy.get()].sort()).toEqual(['list', 'read'])

    await lasseDurch('list')
    await liste
    // The list is in; the message is still being read.
    expect([...$busy.get()]).toEqual(['read'])

    await lasseDurch('read')
    await lesen
    expect($busy.get().size).toBe(0)
  })
})

describe('the draft', () => {
  it('is in the store as the person types, so it is there when the Post area comes back', () => {
    startCompose()
    updateCompose({ to: 'karin@example.org' })
    updateCompose({ text: 'Liebe Karin,' })

    expect($compose.get()).toMatchObject({ subject: '', text: 'Liebe Karin,', to: 'karin@example.org' })
  })

  it('sends what was typed, and a new draft begun meanwhile is not thrown away with it', async () => {
    startCompose()
    updateCompose({ subject: 'Hallo', text: 'Erster', to: 'a@example.org' })
    langsam = new Set(['send'])

    const sendet = sendCompose('Gesendet')

    startCompose()
    updateCompose({ text: 'Zweiter' })
    await lasseDurch('send')
    expect(await sendet).toBe(true)

    expect(gesendet).toEqual([expect.objectContaining({ subject: 'Hallo', text: 'Erster', to: 'a@example.org' })])
    expect($compose.get()).toMatchObject({ text: 'Zweiter' })
  })

  it('a reply and a new mail are different drafts', async () => {
    await openMessage(1)
    startReply($message.get()!, from => `${from} schrieb:`)

    const antwort = $compose.get()!

    expect(antwort.text).toContain('Karin schrieb:')
    expect(antwort.text).toContain('> Text von Einladung')

    startCompose()

    expect($compose.get()!.id).not.toBe(antwort.id)
    expect($compose.get()).toMatchObject({ subject: '', text: '', to: '' })
  })
})
