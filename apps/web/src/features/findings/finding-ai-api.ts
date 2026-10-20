import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type FindingAiScope = {
  origin: 'ci' | 'health'
  repositoryId: string
  assessmentId: string
  findingId: string
}
export type FindingAiResult = {
  version: 1
  sourceSha: string
  contextHash: string
  problem: string
  impact: string
  solution: string
  evidenceLines: number[]
}
type GuidanceResponse = {
  cacheKey?: string
  available: boolean
  canGenerate: boolean
  state: 'NONE' | 'UNAVAILABLE' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  result: FindingAiResult | null
  model: string | null
  finishedAt: string | null
  failure?: string | null
  reason?: string
}

async function request(scope: FindingAiScope, retry = false) {
  const response = await fetch(`${API_BASE_URL}/finding-guidance`, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...scope, ...(retry ? { retry: true } : {}) }),
  })
  if (!response.ok)
    throw new Error('AI guidance is unavailable. Showing saved guidance.')
  return response.json() as Promise<GuidanceResponse>
}

export function useFindingAiGuidance(scope: FindingAiScope | null) {
  const session = useNavigationSession()
  const client = useQueryClient()
  const attempted = useRef(new Set<string>())
  const key = [
    'finding-ai-guidance',
    session.data?.organizationId,
    session.data?.identityId,
    scope,
  ]
  const query = useQuery<GuidanceResponse>({
    queryKey: key,
    enabled: session.isSuccess && !!scope,
    retry: false,
    gcTime: 0,
    refetchInterval: (q) =>
      q.state.data?.state === 'QUEUED' || q.state.data?.state === 'RUNNING'
        ? 2000
        : false,
    queryFn: async ({ signal }): Promise<GuidanceResponse> => {
      const params = new URLSearchParams(scope!)
      const response = await fetch(
        `${API_BASE_URL}/finding-guidance?${params}`,
        {
          credentials: 'include',
          cache: 'no-store',
          signal,
        }
      )
      if (!response.ok)
        throw new Error('AI guidance is unavailable. Showing saved guidance.')
      return response.json() as Promise<GuidanceResponse>
    },
  })
  const mutation = useMutation({
    meta: { silent: true },
    mutationFn: async (retry: boolean) => {
      const queryKey = key
      const data = await request(scope!, retry)
      return { data, queryKey }
    },
    onSuccess: ({ data, queryKey }) => {
      client.setQueryData(queryKey, data)
      return client.invalidateQueries({ queryKey })
    },
  })
  const { mutate } = mutation
  useEffect(() => {
    const data = query.data
    if (
      !scope ||
      !data?.available ||
      !data.canGenerate ||
      data.state !== 'NONE'
    )
      return
    const id =
      data.cacheKey ??
      JSON.stringify([session.data?.organizationId, ...Object.values(scope)])
    if (attempted.current.has(id)) return
    attempted.current.add(id)
    mutate(false)
  }, [scope, query.data, session.data?.organizationId, mutate])
  return {
    data: query.data,
    isLoading: query.isLoading,
    retryGeneration: () => mutate(query.data?.state === 'FAILED'),
    isGenerating: mutation.isPending,
    generationFailed: mutation.isError || query.isError,
    reason:
      query.data?.reason ??
      (query.data?.failure === 'INVALID_RESPONSE'
        ? 'The model did not return a valid recommendation. Showing saved rule guidance.'
        : query.data?.failure === 'TRUNCATED'
          ? 'The model response was cut off. Showing saved rule guidance.'
          : undefined),
    isPreparing:
      !mutation.isError &&
      !query.isError &&
      (mutation.isPending ||
        (query.data?.available &&
          (query.data.state === 'QUEUED' ||
            query.data.state === 'RUNNING' ||
            (query.data.state === 'NONE' && query.data.canGenerate)))),
  }
}
