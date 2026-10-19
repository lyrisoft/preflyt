import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type CompanionConnection = {
  id: string
  name: string
  agents: ('codex' | 'claude')[]
  repositories: string[]
  lastSeenAt: string
  expiresAt: string
  revokedAt: string | null
}
export type CompanionJob = {
  id: string
  agent: string
  mode: string
  state: string
  failure: string | null
  createdAt: string
  cancelRequested: boolean
}
export async function companionCall<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/companions${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      typeof data?.message === 'string'
        ? data.message
        : 'Could not reach the companion. Try again.'
    )
  }
  return response.json()
}
export function useCompanions(enabled = true) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'companions',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    queryFn: () => companionCall<CompanionConnection[]>(''),
    enabled,
    retry: false,
    refetchInterval: 10000,
    gcTime: 0,
  })
}
export function companionStatus(c: CompanionConnection) {
  return c.revokedAt
    ? 'Disconnected'
    : new Date(c.expiresAt) <= new Date()
      ? 'Expired'
      : Date.now() - new Date(c.lastSeenAt).getTime() < 45000
        ? 'Online'
        : 'Offline'
}
