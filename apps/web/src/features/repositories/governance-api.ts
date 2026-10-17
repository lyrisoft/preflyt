import { API_BASE_URL } from '@/lib/api'

export type BlockedPolicyRepository = {
  repositoryId: string | null
  name: string | null
  reason: string
  message: string
}

async function governanceResponse(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal: signal ?? AbortSignal.timeout(120_000),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      message?: string
      blockedRepositories?: BlockedPolicyRepository[]
    } | null
    throw Object.assign(
      new Error(
        typeof error?.message === 'string'
          ? error.message
          : 'The request could not be completed. Refresh and try again.'
      ),
      {
        blockedRepositories: Array.isArray(error?.blockedRepositories)
          ? error.blockedRepositories.filter(
              (item) =>
                item &&
                typeof item.message === 'string' &&
                (item.name === null || typeof item.name === 'string')
            )
          : [],
      }
    )
  }
  return response
}

export async function governanceRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  return (await governanceResponse(path, body, signal)).json() as Promise<T>
}
export async function governanceTextRequest(
  path: string,
  signal?: AbortSignal
): Promise<string> {
  return (await governanceResponse(path, undefined, signal)).text()
}
