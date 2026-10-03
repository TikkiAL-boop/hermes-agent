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
})
