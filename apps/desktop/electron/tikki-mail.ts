// Tikki Post: the mail client's main-process half.
//
// The family mail lives on the tikki.team server (IMAP over TLS on 993, SMTP
// with STARTTLS on 587). Every user signs in with `name@tikki.team` and their
// mailbox password; the address alone decides the servers (resolveMailServers),
// so the login form has exactly two fields. The password is persisted through
// the same secret store Hermes uses for gateway tokens (safeStorage when the
// user opted in, plain otherwise) and never crosses to the renderer.
//
// One IMAP connection per operation: connect, do the thing, log out. Family
// mail volume does not justify a long-lived socket that must survive sleep
// and network changes; the cost is a TLS handshake per click, which is fine.

import { ImapFlow, type ListResponse } from 'imapflow'
import { type ParsedMail, simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'

export const TIKKI_MAIL_DOMAIN = 'tikki.team'

export interface MailServers {
  imap: { host: string; port: number; secure: boolean }
  smtp: { host: string; port: number; secure: boolean }
}

export interface MailAccount {
  address: string
  password: string
  servers: MailServers
}

export interface MailStatus {
  address: string | null
  signedIn: boolean
}

export interface MailboxInfo {
  path: string
  name: string
  specialUse: string | null
  unseen?: number
}

export interface MailSummary {
  uid: number
  subject: string
  from: string
  fromAddress: string
  to: string
  date: string | null
  seen: boolean
  flagged: boolean
  answered: boolean
  size: number
  hasAttachments: boolean
}

export interface MailAttachmentInfo {
  filename: string
  contentType: string
  size: number
}

export interface MailMessage extends MailSummary {
  cc: string
  text: string
  html: string | null
  messageId: string | null
  inReplyTo: string | null
  attachments: MailAttachmentInfo[]
}

export interface SendMailInput {
  to: string
  cc?: string
  subject: string
  text: string
  inReplyTo?: string | null
  references?: string | null
}

export interface MailLoginInput {
  address: string
  password: string
}

/**
 * Servers for an address. tikki.team mail is hosted at mail.tikki.email; the
 * env overrides exist for the day the server moves or another family domain
 * joins, and for tests against a local Dovecot.
 */
export function resolveMailServers(address: string, env: NodeJS.ProcessEnv = process.env): MailServers {
  const domain = address.split('@')[1]?.toLowerCase() ?? ''
  const defaultHost = domain === TIKKI_MAIL_DOMAIN ? 'mail.tikki.email' : `mail.${domain}`
  const imapHost = env.TIKKI_MAIL_IMAP_HOST || defaultHost
  const smtpHost = env.TIKKI_MAIL_SMTP_HOST || imapHost
  const imapPort = Number(env.TIKKI_MAIL_IMAP_PORT) || 993
  const smtpPort = Number(env.TIKKI_MAIL_SMTP_PORT) || 587

  return {
    imap: { host: imapHost, port: imapPort, secure: imapPort === 993 },
    smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465 }
  }
}

/** `name@tikki.team` is the only accepted shape: lowercase, one `@`, a domain with a dot. */
export function normalizeMailAddress(raw: string): string | null {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()

  if (!/^[a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value)) {
    return null
  }

  return value
}

const addr = (value: { name?: string; address?: string }[] | undefined): string =>
  (value ?? []).map(entry => (entry.name ? `${entry.name} <${entry.address ?? ''}>` : (entry.address ?? ''))).join(', ')

const firstAddress = (value: { address?: string }[] | undefined): string => value?.[0]?.address ?? ''

interface StoredAccount {
  address: string
  password: { encoding: string; value: string } | null
}

export interface MailStoreIo {
  encrypt(value: string): { encoding: string; value: string } | null
  decrypt(secret: unknown): string
  readStoreText(): string
  writeStoreText(text: string): void
  log?(message: string): void
}

/** Optional env override so the SMTP leg can be pointed at a test relay. */
export interface MailServiceOptions {
  env?: NodeJS.ProcessEnv
}

export class TikkiMailService {
  private account: MailAccount | null = null
  private loaded = false

  constructor(
    private readonly io: MailStoreIo,
    private readonly options: MailServiceOptions = {}
  ) {}

  private load(): void {
    if (this.loaded) {
      return
    }

    this.loaded = true

    try {
      const parsed = JSON.parse(this.io.readStoreText()) as StoredAccount
      const address = normalizeMailAddress(parsed?.address ?? '')
      const password = parsed?.password ? this.io.decrypt(parsed.password) : ''

      if (address && password) {
        this.account = { address, password, servers: resolveMailServers(address, this.options.env) }
      }
    } catch {
      this.account = null
    }
  }

  private persist(): void {
    const stored: StoredAccount | null = this.account
      ? { address: this.account.address, password: this.io.encrypt(this.account.password) }
      : null

    this.io.writeStoreText(JSON.stringify(stored))
  }

  status(): MailStatus {
    this.load()

    return { address: this.account?.address ?? null, signedIn: this.account !== null }
  }

  private require(): MailAccount {
    this.load()

    if (!this.account) {
      throw new Error('Nicht angemeldet.')
    }

    return this.account
  }

  private client(account: MailAccount): ImapFlow {
    return new ImapFlow({
      auth: { pass: account.password, user: account.address },
      host: account.servers.imap.host,
      logger: false,
      port: account.servers.imap.port,
      secure: account.servers.imap.secure,
      socketTimeout: 60_000
    })
  }

  private async withImap<T>(account: MailAccount, run: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = this.client(account)
    await client.connect()

    try {
      return await run(client)
    } finally {
      await client.logout().catch(() => {})
    }
  }

  /** Verify the credentials against IMAP, then remember them. */
  async login(input: MailLoginInput): Promise<MailStatus> {
    const address = normalizeMailAddress(input?.address ?? '')
    const password = String(input?.password ?? '')

    if (!address) {
      throw new Error('Bitte eine vollständige Adresse eingeben, z. B. name@tikki.team.')
    }

    if (!password) {
      throw new Error('Bitte das Passwort eingeben.')
    }

    const candidate: MailAccount = { address, password, servers: resolveMailServers(address, this.options.env) }

    try {
      await this.withImap(candidate, async () => {})
    } catch (error) {
      throw new Error(describeImapError(error, candidate))
    }

    this.account = candidate
    this.loaded = true
    this.persist()
    this.io.log?.(`[tikki-mail] signed in as ${address}`)

    return this.status()
  }

  logout(): MailStatus {
    this.account = null
    this.loaded = true
    this.persist()

    return this.status()
  }

  async mailboxes(): Promise<MailboxInfo[]> {
    const account = this.require()

    return this.withImap(account, async client => {
      const list = await client.list({ statusQuery: { unseen: true } })

      return list
        .filter(box => !box.flags?.has('\\Noselect'))
        .map((box: ListResponse) => ({
          name: box.name,
          path: box.path,
          specialUse: box.specialUse ?? (box.path.toUpperCase() === 'INBOX' ? '\\Inbox' : null),
          unseen: box.status?.unseen
        }))
        .sort((a, b) => specialUseRank(a.specialUse) - specialUseRank(b.specialUse) || a.path.localeCompare(b.path))
    })
  }

  /** Newest `limit` messages of a mailbox, newest first. */
  async list(mailbox: string, limit = 50): Promise<MailSummary[]> {
    const account = this.require()

    return this.withImap(account, async client => {
      const lock = await client.getMailboxLock(mailbox)

      try {
        const total = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.exists : 0

        if (!total) {
          return []
        }

        const from = Math.max(1, total - Math.max(1, Math.min(limit, 500)) + 1)
        const out: MailSummary[] = []

        for await (const message of client.fetch(`${from}:*`, {
          bodyStructure: true,
          envelope: true,
          flags: true,
          size: true,
          uid: true
        })) {
          out.push(summarize(message))
        }

        return out.sort((a, b) => b.uid - a.uid)
      } finally {
        lock.release()
      }
    })
  }

  async read(mailbox: string, uid: number): Promise<MailMessage> {
    const account = this.require()

    return this.withImap(account, async client => {
      const lock = await client.getMailboxLock(mailbox)

      try {
        const message = await client.fetchOne(
          String(uid),
          { envelope: true, flags: true, size: true, source: true, uid: true },
          { uid: true }
        )

        if (!message || !message.source) {
          throw new Error('Nachricht nicht gefunden.')
        }

        const parsed: ParsedMail = await simpleParser(message.source)
        const summary = summarize(message)

        // Reading marks the message seen, like every mail client.
        if (!summary.seen) {
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
          summary.seen = true
        }

        return {
          ...summary,
          attachments: (parsed.attachments ?? []).map(part => ({
            contentType: part.contentType,
            filename: part.filename ?? 'anhang',
            size: part.size
          })),
          cc: addr(toList(parsed.cc)),
          hasAttachments: (parsed.attachments?.length ?? 0) > 0,
          html: typeof parsed.html === 'string' ? parsed.html : null,
          inReplyTo: parsed.inReplyTo ?? null,
          messageId: parsed.messageId ?? null,
          subject: parsed.subject ?? summary.subject,
          text: parsed.text ?? ''
        }
      } finally {
        lock.release()
      }
    })
  }

  async setSeen(mailbox: string, uid: number, seen: boolean): Promise<void> {
    const account = this.require()

    await this.withImap(account, async client => {
      const lock = await client.getMailboxLock(mailbox)

      try {
        if (seen) {
          await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
        } else {
          await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true })
        }
      } finally {
        lock.release()
      }
    })
  }

  /** Move to Trash when the server has one, otherwise delete outright. */
  async remove(mailbox: string, uid: number): Promise<void> {
    const account = this.require()

    await this.withImap(account, async client => {
      const boxes = await client.list()
      const trash = boxes.find(box => box.specialUse === '\\Trash')
      const lock = await client.getMailboxLock(mailbox)

      try {
        if (trash && trash.path !== mailbox) {
          await client.messageMove(String(uid), trash.path, { uid: true })
        } else {
          await client.messageDelete(String(uid), { uid: true })
        }
      } finally {
        lock.release()
      }
    })
  }

  async send(input: SendMailInput): Promise<{ messageId: string }> {
    const account = this.require()
    const to = String(input?.to ?? '').trim()

    if (!to) {
      throw new Error('Bitte einen Empfänger angeben.')
    }

    const transport = nodemailer.createTransport({
      auth: { pass: account.password, user: account.address },
      host: account.servers.smtp.host,
      port: account.servers.smtp.port,
      requireTLS: !account.servers.smtp.secure,
      secure: account.servers.smtp.secure
    })

    const message = {
      cc: input.cc?.trim() || undefined,
      from: account.address,
      inReplyTo: input.inReplyTo || undefined,
      references: input.references || undefined,
      subject: String(input.subject ?? ''),
      text: String(input.text ?? ''),
      to
    }

    const info = await transport.sendMail(message)

    // Keep a copy in Sent so the thread is complete in every client.
    try {
      const raw = await nodemailer.createTransport({ buffer: true, streamTransport: true }).sendMail(message)
      const boxes = await this.withImap(account, client => client.list())
      const sent = boxes.find(box => box.specialUse === '\\Sent')

      if (sent && Buffer.isBuffer(raw.message)) {
        await this.withImap(account, client => client.append(sent.path, raw.message as Buffer, ['\\Seen']))
      }
    } catch (error) {
      this.io.log?.(`[tikki-mail] could not file the sent copy: ${(error as Error)?.message ?? error}`)
    }

    return { messageId: info.messageId }
  }
}

function toList(value: ParsedMail['to']): { name?: string; address?: string }[] | undefined {
  if (!value) {
    return undefined
  }

  const groups = Array.isArray(value) ? value : [value]

  return groups.flatMap(group => group.value ?? [])
}

function summarize(message: {
  uid: number
  envelope?: {
    subject?: string
    from?: { name?: string; address?: string }[]
    to?: { name?: string; address?: string }[]
    date?: Date | string
  }
  flags?: Set<string>
  size?: number
  bodyStructure?: { childNodes?: { disposition?: string }[] }
}): MailSummary {
  const env = message.envelope ?? {}
  const flags = message.flags ?? new Set<string>()
  const children = message.bodyStructure?.childNodes ?? []

  return {
    answered: flags.has('\\Answered'),
    date: env.date ? new Date(env.date).toISOString() : null,
    flagged: flags.has('\\Flagged'),
    from: addr(env.from),
    fromAddress: firstAddress(env.from),
    hasAttachments: children.some(part => part.disposition === 'attachment'),
    seen: flags.has('\\Seen'),
    size: message.size ?? 0,
    subject: env.subject ?? '',
    to: addr(env.to),
    uid: message.uid
  }
}

const SPECIAL_ORDER = ['\\Inbox', '\\Drafts', '\\Sent', '\\Junk', '\\Trash', '\\Archive', '\\All']

const specialUseRank = (specialUse: string | null): number => {
  const index = specialUse ? SPECIAL_ORDER.indexOf(specialUse) : -1

  return index === -1 ? SPECIAL_ORDER.length : index
}

function describeImapError(error: unknown, account: MailAccount): string {
  const raw = error as { authenticationFailed?: boolean; code?: string; message?: string }

  if (raw?.authenticationFailed) {
    return `Anmeldung abgelehnt: Adresse oder Passwort stimmen nicht (${account.address}).`
  }

  if (raw?.code === 'ENOTFOUND' || raw?.code === 'EAI_AGAIN') {
    return `Mailserver ${account.servers.imap.host} nicht gefunden. Ist das Netz da?`
  }

  if (raw?.code === 'ECONNREFUSED' || raw?.code === 'ETIMEDOUT') {
    return `Mailserver ${account.servers.imap.host}:${account.servers.imap.port} antwortet nicht.`
  }

  return raw?.message ? `Verbindung fehlgeschlagen: ${raw.message}` : 'Verbindung fehlgeschlagen.'
}
