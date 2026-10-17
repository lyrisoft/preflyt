import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import type { CiResult } from './repository-vocabulary'
import type { WorkflowSnippetData } from './workflow-snippet'

const repositoryPath = (repositoryId: string, path: string) =>
  `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}${path}`

async function read<T>(
  url: string,
  signal: AbortSignal,
  message: (status: number) => string
): Promise<T> {
  const response = await fetch(url, { credentials: 'include', signal })
  if (!response.ok) throw new Error(message(response.status))
  return response.json() as Promise<T>
}

type Rule = {
  id: string
  title: string
  capability: string
  guidance: string
  workflowCommand?: string
  reportPath?: string
  workflowSetup?: WorkflowSnippetData
  requiredIn: string[]
}
export type AiCheck = {
  id: string
  title: string
  kind: 'AI_REVIEW'
  mode: 'ADVISORY'
  skillId: string
  skillVersion: number
  skillDigest: string
  stages: ('repository' | 'pull_request')[]
}
export type Pack = {
  workflowSetup?: WorkflowSnippetData
  aiChecks?: AiCheck[]
  id: string
  version: string
  digest: string
  title: string
  description: string
  stages: string[]
  rules: Rule[]
}
export type Selection = {
  policyId?: string
  branchRef?: string
  standardsSource?: string
  id: string
  revision: number
  profile: string
  packs: { id: string; version: string }[]
  sourceSha: string | null
  createdAt: string
}
type StandardsControl = {
  id: string
  title: string
  required: boolean
  capability: string
  configuration: string
  reason: string
  evidence: { path: string; blobSha: string }[]
}
export type Standards = {
  selectionIntegrity: boolean
  catalogue: Pack[]
  workspaceCatalogue?: Pack[]
  adoptionProfiles: string[]
  selection: Selection | null
  recommendations: { id: string; version: string; reason: string }[]
  profileSnapshot: { sourceSha: string; complete: boolean } | null
  controls: StandardsControl[]
}

export function useStandards(repositoryId: string, policyId?: string) {
  return useQuery<Standards>({
    queryKey: policyId
      ? ['repository-standards', repositoryId, policyId]
      : ['repository-standards', repositoryId],
    retry: false,
    queryFn: ({ signal }) =>
      read<Standards>(
        repositoryPath(
          repositoryId,
          `/standards${policyId ? `?policy=${encodeURIComponent(policyId)}` : ''}`
        ),
        signal,
        () =>
          'Could not load standards. Check repository selection and account access.'
      ),
  })
}

export type ArtifactSummary = {
  id: string
  format: 'junit' | 'sarif'
  sha256: string
  parserVersion: number
  verification: string
  summary: Record<string, number | boolean | string>
  createdAt: string
}
export type CiObservation = {
  artifacts: ArtifactSummary[]
  sourceAction: string
  deliveryId: string
  version: number
  sourceSha: string
  sourceKind: string
  sourceObjectId: string
  sourceStatus: string | null
  sourceConclusion: string | null
  sourceUpdatedAt: string | null
  result: CiResult
  sourcePayloadHash: string
  evidenceHash: string
  observedAt: string
}
export type CiEvidence = {
  enabled: boolean
  observations: CiObservation[]
  pagination?: {
    page: number
    pageSize: number
    total: number
    hasNext: boolean
  }
}

export function useCiEvidence(
  repositoryId: string,
  sha = '',
  {
    enabled = true,
    poll = false,
    page,
    pageSize = 10,
  }: {
    enabled?: boolean
    poll?: boolean
    page?: number
    pageSize?: number
  } = {}
) {
  return useQuery<CiEvidence>({
    queryKey: ['ci-evidence', repositoryId, sha, page, pageSize],
    enabled,
    retry: false,
    refetchInterval: (query) =>
      poll && query.state.data?.enabled ? 10_000 : false,
    queryFn: ({ signal }) =>
      read<CiEvidence>(
        repositoryPath(
          repositoryId,
          `/ci-evidence?${new URLSearchParams({ ...(sha ? { sha } : {}), ...(page ? { page: String(page), pageSize: String(pageSize) } : {}) })}`
        ),
        signal,
        (status) =>
          status === 403
            ? 'Repository selection or access changed. Reload the profile.'
            : 'Could not load CI evidence. Try again.'
      ),
  })
}

export type AssessmentListItem = {
  id: string
  sourceSha: string
  createdAt: string
}

export function useAssessmentList(
  repositoryId: string,
  {
    selectionId,
    selectionRevision,
    enabled = true,
  }: {
    selectionId?: string
    selectionRevision?: number
    enabled?: boolean
  } = {}
) {
  return useQuery({
    queryKey: selectionId
      ? ['assessments', repositoryId, selectionId, selectionRevision]
      : ['assessments', repositoryId],
    enabled,
    retry: false,
    queryFn: ({ signal }) =>
      read<{ assessments: AssessmentListItem[] }>(
        repositoryPath(
          repositoryId,
          `/assessments${
            selectionId
              ? `?${new URLSearchParams({ selection: selectionId, revision: String(selectionRevision) })}`
              : ''
          }`
        ),
        signal,
        () =>
          'Could not load assessments. Check your session and repository access.'
      ),
  })
}

type Signal = {
  id: string
  label: string
  state: 'detected' | 'not_detected' | 'unknown'
  observations: string[]
  evidence: { path: string; blobSha: string; reason: string }[]
}
export type Profile = {
  id: string
  sourceSha: string
  treeSha: string
  branch: string
  fullName: string
  createdAt: string
  complete: boolean
  report: {
    inspectedFileCount: number
    omittedPaths?: {
      path: string
      kind: string
      scope: string
      reason: string
      affectedChecks: string[]
    }[]
    signals: Signal[]
    warnings: string[]
    limitations: string[]
  }
}
