import { describe, expect, it } from 'vitest'

import { raumAuftragAusText } from './vorzimmer'

describe('raumAuftragAusText', () => {
  it("reads Tikki's room order, markdown and all", () => {
    const text = [
      'Klar, ich kümmere mich drum.',
      '**RAUM:** Wärmepumpen-Förderung laufend',
      'ZIEL: Jeden Tag neue Förderregeln finden und hochladen.',
      'ANNAHMEN: Server per SSH erreichbar.',
      'TAKT: täglich 06:00',
      'Der Raum steht in deiner Liste.'
    ].join('\n')

    expect(raumAuftragAusText(text)).toEqual({
      name: 'Wärmepumpen-Förderung laufend',
      ziel: 'Jeden Tag neue Förderregeln finden und hochladen.',
      annahmen: 'Server per SSH erreichbar.',
      takt: 'täglich 06:00'
    })
  })

  it('treats talk and half an order as no order', () => {
    expect(raumAuftragAusText('Berlin. Seit 1990 wieder.')).toBeUndefined()
    expect(raumAuftragAusText('RAUM: Nur ein Name')).toBeUndefined()
  })
})
