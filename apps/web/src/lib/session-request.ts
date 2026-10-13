export class SessionUnavailableError extends Error {
  constructor() {
    super(
      'Preflyt could not verify your session. Reconnect when the API is available.'
    )
    this.name = 'SessionUnavailableError'
  }
}

/** An unavailable API is not an unauthenticated session. Never cache login decisions. */
export async function checkSession(
  url: string
): Promise<{ authenticated: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    try {
      const response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      })
      if (response.status === 401) return { authenticated: false }
      if (!response.ok) throw new SessionUnavailableError()
      const session: unknown = await response.json()
      if (
        !session ||
        typeof session !== 'object' ||
        !('authenticated' in session) ||
        typeof session.authenticated !== 'boolean'
      )
        throw new SessionUnavailableError()
      return { authenticated: session.authenticated }
    } catch {
      if (attempt === 2) throw new SessionUnavailableError()
    } finally {
      clearTimeout(timeout)
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
  }
  throw new SessionUnavailableError()
}
