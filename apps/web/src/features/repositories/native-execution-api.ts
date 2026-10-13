import { queryOptions } from '@tanstack/react-query'
import type { ScopedSession } from '@/features/workspace/scoped-access'
import { governanceRequest } from './governance-api'

export type NativeStatus = {
  executionAvailable: boolean
  preflightVerified: boolean
  checkedAt: string
  message: string
  reason: string
}

export function nativeStatusOptions(
  session: ScopedSession | undefined,
  repositoryId: string
) {
  return queryOptions({
    queryKey: [
      'native-execution-status',
      session?.identityId,
      session?.organizationId,
      repositoryId,
    ],
    queryFn: async ({ signal }) => {
      const result = await governanceRequest<NativeStatus>(
        `/github/repositories/${repositoryId}/native-execution/status`,
        undefined,
        signal
      )
      if (
        typeof result?.executionAvailable !== 'boolean' ||
        typeof result.reason !== 'string' ||
        (result.executionAvailable &&
          (result.reason !== 'READY' || result.preflightVerified !== true))
      )
        throw new Error('Scanning readiness could not be verified.')
      return result
    },
    enabled: !!session?.identityId && !!session.organizationId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
    meta: { silent: true },
  })
}
