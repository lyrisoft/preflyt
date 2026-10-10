import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type Item = {
  id: string
  readAt: string | null
  createdAt: string
  type: string
  severity: string
  repository: string
  repositoryId: string
  assessmentId: string | null
  policyId?: string | null
  emailDelivery?: {
    state: string
    attempts: number
    failureCode: string | null
    sentAt: string | null
    nextAttemptAt: string
  } | null
  sourceSha: string | null
}
type InboxData = {
  enabled: boolean
  unreadCount: number
  items: Item[]
  total: number
  page: number
  repositories: { repositoryGithubId: string; repositoryName: string }[]
}
export const titles: Record<string, string> = {
  NATIVE_EXECUTION_FAILED: 'Check execution failed',
  AI_MODEL_UNAVAILABLE: 'Model requests keep failing',
  AI_REVIEW_BUDGET_REACHED: 'Daily AI review reservation limit reached',
  CRITICAL_FINDINGS_REPORTED: 'Critical findings reported',
  POLICY_PUBLISHED: 'Policy published',
  POLICY_EXCEPTION_REQUESTED: 'Policy exception requested',
  POLICY_EXCEPTION_APPROVED: 'Policy exception approved',
  POLICY_EXCEPTION_REJECTED: 'Policy exception rejected',
  POLICY_EXCEPTION_REVOKED: 'Policy exception revoked',
  POLICY_EXCEPTION_EXPIRED: 'Policy exception expired',
  READINESS_BLOCKED: 'PR check blocked',
  READINESS_INCOMPLETE: 'PR check needs more evidence',
  RULESET_ACTIVATED: 'GitHub protection activated',
  RULESET_ROLLED_BACK: 'Managed GitHub protection disabled',
  RULESET_DRIFTED: 'GitHub protection changed outside Preflyt',
  ASSESSMENT_COMPLETED: 'Assessment saved',
  ASSESSMENT_FAILED: 'CI failure recorded',
  ASSESSMENT_INCOMPLETE: 'Assessment needs more evidence',
}
export async function notificationRequest<T>(
  path: string,
  signal?: AbortSignal,
  method = 'GET'
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/notifications${path}`, {
    credentials: 'include',
    cache: 'no-store',
    method,
    signal,
  })
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? 'Your session expired. Sign in again.'
        : 'Could not load notifications. Try again.'
    )
  return response.json() as Promise<T>
}
export function useInbox(filters: Record<string, string> = {}) {
  const session = useNavigationSession()
  const query = useQuery({
    queryKey: [
      'notifications',
      session.data?.identityId,
      session.data?.organizationId,
      filters,
    ],
    queryFn: ({ signal }) =>
      notificationRequest<InboxData>(
        `?${new URLSearchParams(filters)}`,
        signal
      ),
    enabled: !!session.data?.identityId && !session.isFetching,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 30000,
    retry: false,
  })
  const client = useQueryClient()
  const read = useMutation({
    mutationFn: (id: string | null) =>
      notificationRequest(id ? `/${id}/read` : '/read-all', undefined, 'POST'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  })
  return { query, read, session }
}
