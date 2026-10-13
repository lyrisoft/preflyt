import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type FindingSource = {
  path: string | null
  line: number | null
  endLine?: number | null
  sourceSha: string
  lines: { number: number; text: string }[]
  reason: string | null
  truncated?: boolean
  retryable?: boolean
}
export async function findingRequest<T>(
  path: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(
      response.status === 403
        ? 'Repository access is unavailable or you do not have permission.'
        : typeof body?.message === 'string'
          ? body.message
          : 'Finding details could not be loaded. Try again.'
    )
  }
  return response.json() as Promise<T>
}

export function useFindingSource(path: string, valid: boolean) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'finding-source',
      session.data?.organizationId,
      session.data?.identityId,
      path,
    ],
    enabled: session.isSuccess && valid,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => findingRequest<FindingSource>(path, signal),
  })
}
