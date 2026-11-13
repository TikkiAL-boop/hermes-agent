// Is a service on this machine up? The renderer cannot ask by itself: its
// origin is `file://` (or the dev server), and a local service answers a
// foreign origin with 403 or without CORS headers, so every probe from the
// page reads as "down". Main asks instead — loopback and `/health` only, so
// this is a yes/no about a local port and nothing more.

const TIMEOUT_MS = 2500

export const isLocalPort = (port: unknown): port is number =>
  typeof port === 'number' && Number.isInteger(port) && port > 0 && port < 65536

export async function probeLocalHealth(
  port: unknown,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS
): Promise<boolean> {
  if (!isLocalPort(port)) {
    return false
  }

  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/health`, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    })

    return response.ok
  } catch {
    return false
  }
}
