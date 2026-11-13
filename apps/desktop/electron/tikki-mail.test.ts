import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

import type { ImapFlow, ImapFlowOptions } from 'imapflow'
import nodemailer from 'nodemailer'
import { describe, test } from 'vitest'

import { normalizeMailAddress, resolveMailServers, rewriteMailStoreSecret, TikkiMailService } from './tikki-mail'

describe('resolveMailServers', () => {
  test('tikki.team goes to the family server: IMAP 993 TLS, SMTP 587 STARTTLS', () => {
    assert.deepEqual(resolveMailServers('karin@tikki.team', {}), {
      imap: { host: 'mail.tikki.email', port: 993, secure: true },
      smtp: { host: 'mail.tikki.email', port: 587, secure: false }
    })
  })

  test('env overrides win and 465 means implicit TLS', () => {
    const servers = resolveMailServers('x@tikki.team', {
      TIKKI_MAIL_IMAP_HOST: 'localhost',
      TIKKI_MAIL_IMAP_PORT: '1143',
      TIKKI_MAIL_SMTP_PORT: '465'
    })

    assert.deepEqual(servers, {
      imap: { host: 'localhost', port: 1143, secure: false },
      smtp: { host: 'localhost', port: 465, secure: true }
    })
  })
})

describe('normalizeMailAddress', () => {
  test('lowercases and trims a full address, rejects anything else', () => {
    assert.equal(normalizeMailAddress('  Thorsten@Tikki.Team '), 'thorsten@tikki.team')
    assert.equal(normalizeMailAddress('thorsten'), null)
    assert.equal(normalizeMailAddress('a@b'), null)
    assert.equal(normalizeMailAddress(''), null)
  })
})

describe('TikkiMailService store', () => {
  const io = (text: string) => {
    const writes: string[] = []

    return {
      io: {
        decrypt: (s: any) => (s?.encoding === 'test' ? Buffer.from(String(s.value), 'base64').toString() : ''),
        encrypt: (v: string) => ({ encoding: 'test', value: Buffer.from(v).toString('base64') }),
        readStoreText: () => text,
        writeStoreText: (t: string) => writes.push(t)
      },
      writes
    }
  }

  test('starts signed out when no store exists', () => {
    const { io: store } = io('')

    const service = new TikkiMailService({
      ...store,
      readStoreText: () => {
        throw new Error('ENOENT')
      }
    })

    assert.deepEqual(service.status(), { address: null, signedIn: false })
  })

  test('loads a stored account through decrypt and logout clears it', () => {
    const { io: store, writes } = io(
      JSON.stringify({
        address: 'zoe@tikki.team',
        password: { encoding: 'test', value: Buffer.from('pw').toString('base64') }
      })
    )

    const service = new TikkiMailService(store)

    assert.deepEqual(service.status(), { address: 'zoe@tikki.team', signedIn: true })
    assert.deepEqual(service.logout(), { address: null, signedIn: false })
    assert.deepEqual(writes, ['null'])
  })

  test('login rejects a bare user name before touching the network', async () => {
    const service = new TikkiMailService(io('').io)

    await assert.rejects(service.login({ address: 'zoe', password: 'x' }), /name@tikki\.team/)
    await assert.rejects(service.login({ address: 'zoe@tikki.team', password: '' }), /Passwort/)
  })

  test('a storage-policy rewrite re-encodes the password and the account survives the restart', () => {
    // What the encryption toggle does to every secret store: re-encode, then
    // read under the new policy. `decrypt` below reads only the new encoding,
    // like safeStorage-off refuses a keychain blob.
    const { io: store, writes } = io(
      JSON.stringify({ address: 'zoe@tikki.team', password: { encoding: 'plain', value: 'pw' } })
    )

    const isPlain = (secret: any) => secret?.encoding === 'plain'
    const toTest = (secret: any) => store.encrypt(String(secret.value))

    assert.equal(rewriteMailStoreSecret(store, isPlain, toTest), true)
    assert.equal(writes.length, 1)

    const afterRestart = new TikkiMailService({ ...store, readStoreText: () => writes[0] })

    assert.deepEqual(afterRestart.status(), { address: 'zoe@tikki.team', signedIn: true })

    // Nothing to re-encode: the store is left alone, signed out or already converted.
    assert.equal(rewriteMailStoreSecret({ ...store, readStoreText: () => writes[0] }, isPlain, toTest), false)
    assert.equal(rewriteMailStoreSecret({ ...store, readStoreText: () => 'null' }, isPlain, toTest), false)
    assert.equal(writes.length, 1)
  })
})

// ── the network legs, against fakes ────────────────────────────────────────

interface FakeMessage {
  uid: number
  envelope?: { subject?: string; date?: Date | string }
  flags?: Set<string>
  source?: Buffer
}

interface FakeServer {
  boxes?: { path: string; name: string; specialUse?: string }[]
  messages?: FakeMessage[]
  /** What the server answers to a flag change, a move, a delete and an append. */
  accepts?: boolean
}

class FakeImap extends EventEmitter {
  readonly appended: { path: string; raw: Buffer }[] = []

  constructor(
    readonly options: ImapFlowOptions,
    private readonly server: FakeServer
  ) {
    super()
  }

  get mailbox() {
    return { exists: this.server.messages?.length ?? 0 }
  }

  private get verdict() {
    return this.server.accepts ?? true
  }

  async connect() {}
  async logout() {}

  async getMailboxLock() {
    return { release: () => {} }
  }

  async list() {
    return this.server.boxes ?? []
  }

  async *fetch() {
    yield* this.server.messages ?? []
  }

  async fetchOne(uid: string) {
    return (this.server.messages ?? []).find(message => String(message.uid) === uid) ?? false
  }

  async messageFlagsAdd() {
    return this.verdict
  }

  async messageFlagsRemove() {
    return this.verdict
  }

  async messageMove() {
    return this.verdict && { path: 'Trash' }
  }

  async messageDelete() {
    return this.verdict
  }

  async append(path: string, raw: Buffer) {
    this.appended.push({ path, raw })

    return this.verdict && { destination: path }
  }
}

function signedIn(server: FakeServer, env: NodeJS.ProcessEnv = {}) {
  const logs: string[] = []
  const compiled: Buffer[] = []
  const clients: FakeImap[] = []

  const service = new TikkiMailService(
    {
      decrypt: (secret: any) => String(secret?.value ?? ''),
      encrypt: (value: string) => ({ encoding: 'plain', value }),
      log: message => logs.push(message),
      readStoreText: () => JSON.stringify({ address: 'zoe@tikki.team', password: { encoding: 'plain', value: 'pw' } }),
      writeStoreText: () => {}
    },
    {
      createImapClient: options => {
        const client = new FakeImap(options, server)

        clients.push(client)

        return client as unknown as ImapFlow
      },
      // Every leg compiles through nodemailer's own stream transport: real
      // MIME, no socket. `compiled` keeps what each pass produced.
      createTransport: (() => {
        const transport = nodemailer.createTransport({ buffer: true, streamTransport: true })
        const send = transport.sendMail.bind(transport)

        transport.sendMail = (async (message: any) => {
          const info = await send(message)

          compiled.push(info.message as Buffer)

          return info
        }) as typeof transport.sendMail

        return transport
      }) as unknown as typeof nodemailer.createTransport,
      env
    }
  )

  return { clients, compiled, logs, service }
}

const header = (raw: Buffer, name: string) =>
  new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(raw.toString('utf8'))?.[1]?.trim() ?? null

describe('TikkiMailService against a mail server', () => {
  test('one message with an unparsable Date header does not hide the folder', async () => {
    const { service } = signedIn({
      messages: [
        { envelope: { date: 'Thu, 32 Foo 2026 25:61:00 +9999', subject: 'kaputt' }, uid: 1 },
        { envelope: { date: new Date('2026-10-01T10:00:00Z'), subject: 'heil' }, uid: 2 }
      ]
    })

    const listed = await service.list('INBOX')

    assert.deepEqual(
      listed.map(message => [message.uid, message.date]),
      [
        [2, '2026-10-01T10:00:00.000Z'],
        [1, null]
      ]
    )
  })

  test('a change the server refuses is an error, never a silent success', async () => {
    const boxes = [{ name: 'Papierkorb', path: 'Trash', specialUse: '\\Trash' }]
    const refusing = signedIn({ accepts: false, boxes }).service

    await assert.rejects(refusing.remove('INBOX', 7), /abgelehnt/)
    await assert.rejects(refusing.remove('Trash', 7), /abgelehnt/)
    await assert.rejects(refusing.setSeen('INBOX', 7, true), /nicht übernommen/)
    await assert.rejects(refusing.setSeen('INBOX', 7, false), /nicht übernommen/)

    const accepting = signedIn({ accepts: true, boxes }).service

    await accepting.remove('INBOX', 7)
    await accepting.setSeen('INBOX', 7, true)
  })

  test('reading in a folder that refuses flags still shows the message, and shows it unseen', async () => {
    const messages = [{ flags: new Set<string>(), source: Buffer.from('Subject: Hallo\r\n\r\nText\r\n'), uid: 3 }]

    const refused = await signedIn({ accepts: false, messages }).service.read('Geteilt', 3)
    const stored = await signedIn({ accepts: true, messages }).service.read('INBOX', 3)

    assert.equal(refused.subject, 'Hallo')
    assert.equal(refused.seen, false)
    assert.equal(stored.seen, true)
  })

  test('the copy filed in Sent is the message that went out', async () => {
    const { clients, compiled, service } = signedIn({ boxes: [{ name: 'Gesendet', path: 'Sent', specialUse: '\\Sent' }] })

    const result = await service.send({ subject: 'Hallo', text: 'Text', to: 'karin@tikki.team' })
    const copy = clients.flatMap(client => client.appended)

    assert.equal(copy.length, 1)
    assert.equal(copy[0].path, 'Sent')

    // A reply carries In-Reply-To with the delivered Message-ID; the copy must
    // answer to the same one, and sort at the same moment.
    const delivered = compiled[0]

    assert.ok(header(delivered, 'Message-ID'))
    assert.equal(header(copy[0].raw, 'Message-ID'), header(delivered, 'Message-ID'))
    assert.equal(header(copy[0].raw, 'Date'), header(delivered, 'Date'))
    assert.equal(result.messageId, header(delivered, 'Message-ID'))
  })

  test('a connection that drops after connect is logged, not thrown into the main process', async () => {
    const { clients, logs, service } = signedIn({})

    await service.mailboxes()

    // An EventEmitter without an 'error' listener throws on emit: that throw is
    // the uncaught exception.
    assert.doesNotThrow(() => clients[0].emit('error', new Error('read ECONNRESET')))
    assert.ok(logs.some(line => line.includes('ECONNRESET')))
  })

  test('the password is only ever sent inside TLS, on any configured port', async () => {
    for (const env of [{}, { TIKKI_MAIL_IMAP_PORT: '143' }, { TIKKI_MAIL_IMAP_PORT: '1143' }]) {
      const { clients, service } = signedIn({}, env)

      await service.mailboxes()

      const { doSTARTTLS, secure } = clients[0].options

      // Implicit TLS, or STARTTLS as a requirement: `true`, not "if offered".
      assert.equal(secure === true || doSTARTTLS === true, true, JSON.stringify(env))
    }
  })
})
