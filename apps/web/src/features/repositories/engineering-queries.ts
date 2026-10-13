import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import type { EvidenceValidation } from './evidence-validation-panel'

export const engineeringPath = (repo: string, path: string) =>
  `${API_BASE_URL}/github/repositories/${encodeURIComponent(repo)}${path}`
export async function engineeringRead<T>(
  repo: string,
  path: string,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(engineeringPath(repo, path), {
    credentials: 'include',
    signal,
  })
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'Repository access changed. Check repository selection and your session.'
        : response.status === 409
          ? 'Snapshot integrity could not be verified. Contact your administrator.'
          : 'Could not load this information. Try again.'
    )
  return response.json() as Promise<T>
}
export type GatePreview = {
  evaluatorVersion: number
  sourceSha: string
  status: 'PASS' | 'WARN' | 'BLOCK' | 'INCOMPLETE'
  evaluationHash: string
  requiredRules: number
  requiredRulesSatisfied: number
  advisoryIncomplete: number
  advisoryFailed: number
  requiredRulesBlocked: number
  requiredRulesIncomplete: number
  reasons: string[]
  rules: {
    ruleId: string
    title: string
    required: boolean
    status: string
    reasons: string[]
    deliveryId: string | null
    recordedAt?: string | null
  }[]
}
export function useGatePreview(
  repo: string,
  assessmentId?: string,
  enabled = true
) {
  return useQuery({
    queryKey: ['gate-preview', repo, assessmentId],
    enabled: enabled && !!assessmentId,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<GatePreview>(
        repo,
        `/assessments/${encodeURIComponent(assessmentId!)}/gate-preview`,
        signal
      ),
  })
}
export type SourceIdentity = {
  kind: 'check_run' | 'workflow_run'
  appId?: string
  checkName?: string
  workflowId?: string
  runAttempt?: number
}
export type Binding = Omit<SourceIdentity, 'runAttempt'> & { ruleId: string }
export type BindingResult = {
  supportedRuleIds?: string[]
  active: boolean
  binding: null | {
    id: string
    revision: number
    selectionId: string
    bindings: Binding[]
    createdAt: string
  }
}
export function useBindings(repo: string, policyId?: string) {
  return useQuery({
    queryKey: policyId
      ? ['ci-bindings', repo, policyId]
      : ['ci-bindings', repo],
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<BindingResult>(
        repo,
        `/ci-bindings${policyId ? `?policy=${encodeURIComponent(policyId)}` : ''}`,
        signal
      ),
  })
}
export type PrContext = {
  head: { repositoryId: string; ref: string; sha: string }
  base: { repositoryId: string; ref: string; sha: string }
  state: string
  draft: boolean
  merged: boolean
  number?: number
  objectId?: string
}
export type TrackedPr = {
  id: string
  number: number
  context: PrContext
  revision: number
  syncState: string
  verifiedAt: string | null
  lastSyncAttemptAt: string | null
  verification: string
}
export type PrDetail = {
  pullRequest: TrackedPr
  verification: string
  reason: string
  readiness: string
  qualityGate: null
  prAssessment: { id: string; assessmentHash: string } | null
  ciAssessment: { id: string; assessmentHash: string } | null
  collectionTruncated: boolean
}
export function usePullRequests(repo: string) {
  return useQuery({
    queryKey: ['pull-requests', repo],
    retry: false,
    refetchInterval: 15000,
    queryFn: ({ signal }) =>
      engineeringRead<{ pullRequests: TrackedPr[]; truncated: boolean }>(
        repo,
        '/pull-requests',
        signal
      ),
  })
}
export function usePullRequest(repo: string, number: number | null) {
  return useQuery({
    queryKey: ['pull-request', repo, number],
    enabled: number !== null,
    retry: false,
    refetchInterval: 15000,
    queryFn: ({ signal }) =>
      engineeringRead<PrDetail>(repo, `/pull-requests/${number}`, signal),
  })
}
export type ContextRequest = {
  trigger: string
  subjectKind?: string
  sourceDeliveryId?: string | null
  pullRequest?: PrContext
  sourceBindings?: {
    id: string
    revision: number
    selectionId: string
    bindings: Binding[]
  } | null
}
export type Snapshot = {
  id: string
  sourceSha: string
  assessmentHash: string
  request: ContextRequest
  report: {
    observations?: {
      deliveryId: string
      sourceKind: string
      sourceObjectId: string
      evidenceHash: string
      sourcePayloadHash: string
      artifacts: {
        id: string
        format: string
        sha256: string
        verification: string
      }[]
    }[]
    coverage: string
    trustedExecutedChecks: number
    collectionTruncated: boolean
    checks: {
      ruleId: string
      title: string
      coverage: string
      evidenceValidation?: EvidenceValidation | null
      providerResult: string | null
      mappingTrust?: string | null
      reason: string
    }[]
  }
}
export function useSnapshot(repo: string, id: string | null) {
  return useQuery({
    queryKey: ['assessment', repo, id],
    enabled: !!id,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<Snapshot>(repo, `/assessments/${id}`, signal),
  })
}
export function identityLabel(binding: SourceIdentity) {
  return binding.kind === 'check_run'
    ? `${binding.checkName} · app ${binding.appId}`
    : `Workflow ${binding.workflowId}`
}
