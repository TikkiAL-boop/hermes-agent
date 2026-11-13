import http from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { probeLocalHealth } from './tikki-local-health'

const servers: http.Server[] = []

async function serve(handler: http.RequestListener): Promise<number> {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

  return (server.address() as AddressInfo).port
}

const close = (server: http.Server) => new Promise(resolve => server.close(resolve))

afterEach(async () => {
  await Promise.all(servers.splice(0).map(close))
})

describe('probeLocalHealth', () => {
  it('reports a service by what it answers, whatever it thinks of foreign origins', async () => {
    // What Hermes' API server and Honcho send a page: no CORS header at all.
    const up = await serve((request, response) => {
      response.writeHead(request.url === '/health' ? 200 : 404).end('{"status":"ok"}')
    })

    const refusing = await serve((_request, response) => response.writeHead(403).end())
    const gone = await serve((_request, response) => response.end())
    await close(servers.pop()!)

    expect(await probeLocalHealth(up)).toBe(true)
    expect(await probeLocalHealth(refusing)).toBe(false)
    expect(await probeLocalHealth(gone)).toBe(false)
  })

  it('never turns anything but a port into a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>()

    for (const port of ['8000', '8000@evil.example', 0, 70000, 80.5, null, { port: 8000 }]) {
      expect(await probeLocalHealth(port, fetchImpl)).toBe(false)
    }

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
