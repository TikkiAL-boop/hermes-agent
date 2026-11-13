import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '@/i18n'

import { PostArea } from './post-area'
import { $compose, $mailboxes, $mailStatus, $message, $messages, $selectedUid } from './post/store'

const desktopWindow = window as Window & { hermesDesktop?: Window['hermesDesktop'] }

function installBridge() {
  const bridge = {
    list: vi.fn().mockResolvedValue([
      {
        answered: false,
        date: '2026-09-27T10:00:00.000Z',
        flagged: false,
        from: 'Karin <karin@tikki.team>',
        fromAddress: 'karin@tikki.team',
        hasAttachments: false,
        seen: false,
        size: 1200,
        subject: 'Einkauf',
        to: 'thorsten@tikki.team',
        uid: 7
      }
    ]),
    login: vi.fn().mockResolvedValue({ address: 'thorsten@tikki.team', signedIn: true }),
    logout: vi.fn().mockResolvedValue({ address: null, signedIn: false }),
    mailboxes: vi.fn().mockResolvedValue([
      { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox', unseen: 1 },
      { name: 'Sent', path: 'Sent', specialUse: '\\Sent' }
    ]),
    read: vi.fn().mockResolvedValue({
      answered: false,
      attachments: [],
      cc: '',
      date: '2026-09-27T10:00:00.000Z',
      flagged: false,
      from: 'Karin <karin@tikki.team>',
      fromAddress: 'karin@tikki.team',
      hasAttachments: false,
      html: '<p>Bitte <b>Milch</b><script>alert(1)</script></p>',
      inReplyTo: null,
      messageId: '<a@tikki.team>',
      seen: true,
      size: 1200,
      subject: 'Einkauf',
      text: 'Bitte Milch',
      to: 'thorsten@tikki.team',
      uid: 7
    }),
    remove: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue({ messageId: '<b@tikki.team>' }),
    setSeen: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({ address: null, signedIn: false })
  }

  desktopWindow.hermesDesktop = { tikkiMail: bridge } as unknown as Window['hermesDesktop']

  return bridge
}

const ui = () => (
  <I18nProvider configClient={null} initialLocale="de">
    <PostArea />
  </I18nProvider>
)

beforeEach(() => {
  $mailStatus.set(null)
  $mailboxes.set([])
  $messages.set([])
  $message.set(null)
  $selectedUid.set(null)
  $compose.set(null)
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(desktopWindow, 'hermesDesktop')
})

describe('PostArea', () => {
  it('signs in with address and password, then lists folders and messages', async () => {
    const bridge = installBridge()
    render(ui())

    await waitFor(() => expect(bridge.status).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('name@tikki.team'), { target: { value: 'Thorsten@tikki.team' } })
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'geheim' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))

    await waitFor(() =>
      expect(bridge.login).toHaveBeenCalledWith({ address: 'Thorsten@tikki.team', password: 'geheim' })
    )
    await screen.findByText('Einkauf')
    expect(bridge.list).toHaveBeenCalledWith('INBOX', 80)
    expect(screen.getByText('thorsten@tikki.team')).toBeTruthy()
    expect(screen.getAllByText('Posteingang').length).toBe(2)
  })

  it('opens a message with sanitized HTML and starts a quoted reply', async () => {
    const bridge = installBridge()
    bridge.status.mockResolvedValue({ address: 'thorsten@tikki.team', signedIn: true })
    render(ui())

    fireEvent.click(await screen.findByText('Einkauf'))
    await waitFor(() => expect(bridge.read).toHaveBeenCalledWith('INBOX', 7))

    // The mail's HTML is a document of its own, never part of the app's.
    const frame = await waitFor(() => {
      const found = document.querySelector('iframe[data-mail-html]')

      expect(found).toBeTruthy()

      return found as HTMLIFrameElement
    })

    const body = frame.getAttribute('srcdoc') ?? ''

    expect(body).toContain('<b>Milch</b>')
    expect(body).not.toContain('<script')
    expect(body).not.toContain('alert(1)')
    expect(frame.getAttribute('sandbox')).not.toBeNull()
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(document.body.innerHTML.replace(frame.outerHTML, '')).not.toContain('Milch</b>')

    fireEvent.click(screen.getByRole('button', { name: 'Antworten' }))
    const subject = (await screen.findByLabelText('Betreff')) as HTMLInputElement
    expect(subject.value).toBe('Re: Einkauf')
    expect((screen.getByLabelText('An') as HTMLInputElement).value).toBe('karin@tikki.team')
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toContain('> Bitte Milch')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    })
    await waitFor(() => expect(bridge.send).toHaveBeenCalled())
    expect(bridge.send.mock.calls[0][0]).toMatchObject({
      inReplyTo: '<a@tikki.team>',
      subject: 'Re: Einkauf',
      to: 'karin@tikki.team'
    })
    expect($compose.get()).toBeNull()
  })

  it('still has the mail being written after the person looked at another area', async () => {
    const bridge = installBridge()
    bridge.status.mockResolvedValue({ address: 'thorsten@tikki.team', signedIn: true })

    const erste = render(ui())

    fireEvent.click(await screen.findByRole('button', { name: 'Schreiben' }))
    fireEvent.change(await screen.findByLabelText('An'), { target: { value: 'karin@tikki.team' } })
    fireEvent.change(screen.getByLabelText('Betreff'), { target: { value: 'Wochenende' } })
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'Liebe Karin, ich wollte' } })

    // The shell unmounts Post while another area is on screen.
    erste.unmount()
    render(ui())

    expect(((await screen.findByLabelText('An')) as HTMLInputElement).value).toBe('karin@tikki.team')
    expect((screen.getByLabelText('Betreff') as HTMLInputElement).value).toBe('Wochenende')
    expect(document.querySelector('textarea')!.value).toBe('Liebe Karin, ich wollte')
  })

  it('starts an empty mail when the person presses "write" in the middle of a reply', async () => {
    const bridge = installBridge()
    bridge.status.mockResolvedValue({ address: 'thorsten@tikki.team', signedIn: true })
    render(ui())

    fireEvent.click(await screen.findByText('Einkauf'))
    fireEvent.click(await screen.findByRole('button', { name: 'Antworten' }))
    expect(((await screen.findByLabelText('Betreff')) as HTMLInputElement).value).toBe('Re: Einkauf')

    fireEvent.click(screen.getByRole('button', { name: 'Schreiben' }))

    // Not the reply's recipient and quote under a "new message" heading.
    await waitFor(() => expect((screen.getByLabelText('Betreff') as HTMLInputElement).value).toBe(''))
    expect((screen.getByLabelText('An') as HTMLInputElement).value).toBe('')
    expect(document.querySelector('textarea')!.value).toBe('')

    await act(async () => {
      fireEvent.change(screen.getByLabelText('An'), { target: { value: 'zoe@tikki.team' } })
      fireEvent.change(screen.getByLabelText('Betreff'), { target: { value: 'Neu' } })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Senden' }))
    })
    await waitFor(() => expect(bridge.send).toHaveBeenCalled())
    // A new mail answers nothing.
    expect(bridge.send.mock.calls[0][0].inReplyTo).toBeUndefined()
    expect(bridge.send.mock.calls[0][0]).toMatchObject({ subject: 'Neu', to: 'zoe@tikki.team' })
  })

  it('shows the cleaned error from main when sign-in fails', async () => {
    const bridge = installBridge()
    bridge.login.mockRejectedValue(
      new Error("Error invoking remote method 'tikki:mail:login': Error: Anmeldung abgelehnt")
    )
    render(ui())

    await waitFor(() => expect(bridge.status).toHaveBeenCalled())
    fireEvent.change(screen.getByPlaceholderText('name@tikki.team'), { target: { value: 'zoe@tikki.team' } })
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, {
      target: { value: 'falsch' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Anmeldung abgelehnt')
  })
})
