import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { normalizeMailAddress, resolveMailServers, TikkiMailService } from './tikki-mail'

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
})
