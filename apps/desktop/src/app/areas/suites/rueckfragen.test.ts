import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/store/gateway', () => ({ activeGateway: () => ({ request: (...args: unknown[]) => rpc(...args) }) }))

const { ladeRueckfragen, rueckfrageBeantworten } = await import('./rueckfragen')

const calls = () => rpc.mock.calls.map(([method, params]) => [method, params])

beforeEach(() => {
  rpc.mockReset()
})

describe('ladeRueckfragen', () => {
  it("finds the open questions of room members and nobody else's", async () => {
    const offen: Record<string, unknown[]> = {
      // A member that asked one question and waits.
      's-raum': [
        { id: 'srq-1', method: 'clarify', params: { question: 'Welches Budget?', choices: ['1000', '2000'] } }
      ],
      // A member that waits for an approval: the room driver reports that one, it is no question.
      's-freigabe': [{ id: 'srq-2', method: 'approval', params: { command: 'rm -rf x' } }],
      // The person's own chat: its questions belong to that chat, not to a room.
      's-chat': [{ id: 'srq-3', method: 'clarify', params: { question: 'Nicht für einen Raum' } }]
    }

    rpc.mockImplementation(async (method: string, params: Record<string, unknown>) =>
      method === 'session.active_list'
        ? {
            sessions: [
              { id: 's-raum', status: 'waiting', title: 'Group: tikki-urlaub-1' },
              { id: 's-freigabe', status: 'waiting', title: 'Group: tikki-app-2' },
              { id: 's-chat', status: 'waiting', title: 'Urlaub planen' },
              { id: 's-laeuft', status: 'working', title: 'Group: tikki-still-3' }
            ]
          }
        : { open_requests: offen[String(params.session_id)] ?? [] }
    )

    expect(await ladeRueckfragen()).toEqual([
      {
        raum: 'tikki-urlaub-1',
        sitzung: 's-raum',
        anfrage: 'srq-1',
        frage: 'Welches Budget?',
        auswahl: ['1000', '2000'],
        teile: []
      }
    ])
    // Reading the open requests must not replay or take over the member's session.
    expect(calls().every(([method]) => method === 'session.active_list' || method === 'session.events.since')).toBe(
      true
    )
  })

  it('reports no question when the backend cannot say, instead of failing the room list', async () => {
    rpc.mockRejectedValue(new Error('unknown method'))

    expect(await ladeRueckfragen()).toEqual([])
  })
})

describe('rueckfrageBeantworten', () => {
  const frage = { raum: 'r', sitzung: 's', anfrage: 'srq-9', frage: 'Wohin?', auswahl: [], teile: [] }

  it('answers a single question on its request', async () => {
    rpc.mockResolvedValue({})
    await rueckfrageBeantworten(frage, 'Ostsee')

    expect(calls()).toEqual([['request.answer', { id: 'srq-9', result: { answer: 'Ostsee' } }]])
  })

  it('locks every part of a batch with its own answer, so the member gets all of them', async () => {
    rpc.mockResolvedValue({})

    await rueckfrageBeantworten(
      {
        ...frage,
        teile: [
          { id: 'q1', frage: 'Wohin?', auswahl: [] },
          { id: 'q2', frage: 'Wann?', auswahl: ['Juli', 'August'] }
        ]
      },
      { q1: 'Ostsee', q2: 'Juli' }
    )

    expect(calls()).toEqual([
      ['clarify.lock', { request_id: 'srq-9', question_id: 'q1', answer: 'Ostsee' }],
      ['clarify.lock', { request_id: 'srq-9', question_id: 'q2', answer: 'Juli' }]
    ])
  })
})
