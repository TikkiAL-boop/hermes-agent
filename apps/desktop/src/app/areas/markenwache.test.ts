import { describe, expect, it } from 'vitest'

import { markeAnwenden } from './markenwache'

const tikki = (text: string) => text.replace(/\bHermes\b/g, 'Tikki')

describe('markeAnwenden', () => {
  it('renames the product in interface text but leaves what people and the model wrote', () => {
    document.body.innerHTML = `
      <div id="fehler">Timed out reconnecting to Hermes backend</div>
      <input placeholder="Ask Hermes" />
      <div class="aui-md">Die Hermes-Tasche kostet viel.</div>
      <div data-role="user">Was kostet eine Hermes Birkin?</div>
      <pre>hermes --version  # Hermes Agent</pre>`

    markeAnwenden(document.body, tikki)

    expect(document.getElementById('fehler')!.textContent).toBe('Timed out reconnecting to Tikki backend')
    expect(document.querySelector('input')!.getAttribute('placeholder')).toBe('Ask Tikki')
    expect(document.querySelector('.aui-md')!.textContent).toContain('Hermes-Tasche')
    expect(document.querySelector('[data-role="user"]')!.textContent).toContain('Hermes Birkin')
    expect(document.querySelector('pre')!.textContent).toContain('Hermes Agent')
  })

  it("leaves the outside world's words alone: mail, page titles, a draft in a locked editor", () => {
    document.body.innerHTML = `
      <div data-post-area="">
        <span id="absender">Hermes Germany &lt;noreply@myhermes.de&gt;</span>
        <h2 id="betreff">Ihre Hermes-Sendung ist unterwegs</h2>
      </div>
      <div role="tablist" data-marke-frei=""><button role="tab" id="seite">Hermes Paketshop finden</button></div>
      <div data-tree-tab="preview-tile:url:1"><span id="kachel">Hermes Sendungsverfolgung</span></div>
      <div data-tree-tab="session-tile:abc"><span id="sitzung">Hermes backend error</span></div>
      <div contenteditable="false" id="entwurf">Schick das Paket mit Hermes.</div>`

    markeAnwenden(document.body, tikki)

    expect(document.getElementById('absender')!.textContent).toBe('Hermes Germany <noreply@myhermes.de>')
    expect(document.getElementById('betreff')!.textContent).toBe('Ihre Hermes-Sendung ist unterwegs')
    expect(document.getElementById('seite')!.textContent).toBe('Hermes Paketshop finden')
    expect(document.getElementById('kachel')!.textContent).toBe('Hermes Sendungsverfolgung')
    expect(document.getElementById('entwurf')!.textContent).toBe('Schick das Paket mit Hermes.')
    // …while the app's own tabs are still the app speaking.
    expect(document.getElementById('sitzung')!.textContent).toBe('Tikki backend error')
  })

  it('writes an attribute only when the name in it actually changes', async () => {
    // A name the filter keeps ("Hermes Cloud" is someone else's service): writing it back
    // unchanged would wake a watching observer again and again.
    const cloud = (text: string) => text.replace(/\bHermes\b(?! Cloud\b)/g, 'Tikki')
    document.body.innerHTML = '<button aria-label="Sign in to Hermes Cloud" id="knopf"></button>'
    const seen: MutationRecord[] = []
    const observer = new MutationObserver(records => seen.push(...records))
    observer.observe(document.body, { attributes: true, subtree: true })

    markeAnwenden(document.body, cloud)
    await Promise.resolve()
    observer.disconnect()

    expect(document.getElementById('knopf')!.getAttribute('aria-label')).toBe('Sign in to Hermes Cloud')
    expect(seen).toEqual([])
  })
})
