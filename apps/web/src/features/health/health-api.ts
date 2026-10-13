import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import type { StatusTone } from '@/components/status-badge'
import type {
  Finding,
  FindingGuidance,
} from '@/features/findings/finding-types'
import { useNavigationSession } from '@/features/workspace/navigation-session'

export type HealthFinding = {
  reportGuidance?: Finding['reportGuidance']
  relatedLocations?: { path: string; line: number; endLine: number }[]
  referenceGuidance?: Finding['referenceGuidance']
  guidance?: FindingGuidance
  fingerprint: string
  category: string
  severity: string
  title: string
  ruleId: string | null
  path: string | null
  line: number | null
  endLine?: number | null
  checkId: string
  evidence: string
}
export type OverallHealth = {
  version: 1
  status:
    | 'HEALTHY'
    | 'NEEDS_ATTENTION'
    | 'UNHEALTHY'
    | 'INCOMPLETE'
    | 'NOT_ASSESSED'
    | 'QUEUED'
    | 'RUNNING'
  reasons: string[]
}
export type HealthReport = {
  policyContext?: {
    version: 1
    state: 'NO_PUBLISHED_POLICY' | 'POLICY_INVALID' | 'CAPTURED'
    policyId?: string
    revision?: number
    definitionHash?: string
    selectionId?: string
    branchRef: string
    capturedAt: string
    healthRules?: { id: string; required: boolean; maxFailedChecks: number }[]
    requirements?: number
    evidence: {
      state: 'UNAVAILABLE' | 'HISTORICAL_PREVIEW'
      assessmentId?: string
      assessmentHash?: string
      formula?: 'historical-policy-evidence-v1'
      evaluatorVersion?: number
      covered?: number
      passing?: number
      blocked?: number
      incomplete?: number
      percentage: number | null
    }
  }

  completeness: 'COMPLETE' | 'PARTIAL'
  mode: 'EXECUTED' | 'INSPECTION_ONLY'
  inspection: { complete: boolean; fileCount: number; languages: string[] }
  analyses: {
    id: string
    title: string
    scope?: string
    fileAnalysis?: {
      version: 1
      formula: 'semgrep-candidate-files-v1'
      scope: 'js-ts-python'
      candidateFiles: number
      analyzedFiles: number
      skippedFiles: number
      pathsDigest: string
    }
    state: string
    reason: string
    tool?: string
    reportHash?: string
    findingsRetained?: number
    findingsReported?: number
    findingsSuppressed?: number
  }[]
  findings: HealthFinding[]
  limits: string[]
  measurements?: {
    coverage?: {
      version: 1
      formula: 'node-covered-lines-v1'
      scope: 'node-loaded-files'
      analyzedLines: number
      coveredLines: number
      analyzedFiles: number
      tests: number
      passed: number
    }
    duplication?: {
      version: 1
      formula: 'unique-lines-v1'
      analyzedLines: number
      duplicatedLines: number
      analyzedFiles: number
      clonePairs: number
    }
  }
}
export type HealthAssessment = {
  progress?: string | null
  overallHealth?: OverallHealth
  id: string
  branch: string
  state: string
  sourceSha: string | null
  report: HealthReport | null
  reason: string | null
  includeCoverage?: boolean
  cancelled: boolean
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}
export type HealthTimelinePoint = {
  checkIds?: string[]
  id: string
  sourceSha: string
  at: string
  findings: number
}
export type HealthData = {
  repository?: string
  branch: string | null
  assessment: HealthAssessment | null
  freshness: string
  checkedAt: string | null
  history: Omit<HealthAssessment, 'report'>[]
  total: number
  page: number
  hotspotReview?: {
    version: number
    formula: string
    reviewed: number
    total: number
    complete: boolean
    percentage: number | null
  } | null
  timeline: HealthTimelinePoint[]
  trend: {
    introduced: number
    noLongerReported: number
    checkIds?: string[]
  } | null
}
export type HealthPortfolioData = {
  statuses: {
    complete: number
    partial: number
    failed: number
    cancelled: number
  }
  priorityFindings: {
    assessedAt?: string | null
    repositoryId: string
    repositoryName: string
    assessmentId: string
    branch: string
    fingerprint: string
    title: string
    severity: string
    path: string | null
    line: number | null
  }[]
  summary: {
    repositories: number
    analyzed: number
    assessed: number
    active: number
    incomplete: number
    high: number
    notAssessed: number
  }
  bounded: boolean
  total: number
  page: number
  items: {
    repositoryId: string
    name: string
    branch: string | null
    id: string | null
    state: string
    overallHealth?: OverallHealth
    result?: 'PASS' | 'FAIL' | 'INCOMPLETE' | null
    completeness: string | null
    mode: string | null
    freshness: string
    finishedAt: string | null
    findings: number | null
    severity: Record<string, number> | null
  }[]
}
export class HealthRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}
export async function healthRequest<T>(
  path: string,
  signal?: AbortSignal,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/github/${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string | string[]
    } | null
    throw new HealthRequestError(
      response.status,
      response.status === 403
        ? 'Repository access is unavailable or you do not have permission.'
        : typeof data?.message === 'string'
          ? data.message
          : 'Health assessment could not be loaded. Try again.'
    )
  }
  return response.json() as Promise<T>
}
export function useHealth(
  repositoryId: string,
  assessment?: string,
  page = 1,
  enabled = true
) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'repository-health',
      session.data?.organizationId,
      session.data?.identityId,
      repositoryId,
      assessment,
      page,
    ],
    enabled: enabled && session.isSuccess,
    queryFn: ({ signal }) =>
      healthRequest<HealthData>(
        `repositories/${repositoryId}/health?${new URLSearchParams({ page: String(page), ...(assessment ? { assessment } : {}) })}`,
        signal
      ),
    retry: false,
    staleTime: 10000,
    refetchInterval: (q) =>
      ['QUEUED', 'RUNNING'].includes(q.state.data?.assessment?.state ?? '')
        ? 5000
        : false,
  })
}
export type HealthFreshness = {
  assessmentId: string
  sourceSha: string | null
  branch: string
  freshness: string
  checkedAt: string | null
}
export function useHealthFreshness(repositoryId: string, assessment?: string) {
  const session = useNavigationSession()
  return useQuery<HealthFreshness>({
    queryKey: [
      'health-freshness',
      session.data?.organizationId,
      session.data?.identityId,
      repositoryId,
      assessment,
    ],
    enabled: session.isSuccess && !!assessment,
    retry: false,
    gcTime: 0,
    staleTime: (q) =>
      q.state.data?.checkedAt
        ? Math.max(
            0,
            new Date(q.state.data.checkedAt).getTime() +
              60000 -
              q.state.dataUpdatedAt
          )
        : 60000,
    refetchInterval: (q) =>
      q.state.data?.checkedAt
        ? Math.max(
            1000,
            new Date(q.state.data.checkedAt).getTime() +
              60000 -
              q.state.dataUpdatedAt
          )
        : 60000,
    queryFn: ({ signal }) =>
      healthRequest<HealthFreshness>(
        `repositories/${repositoryId}/health/freshness?assessment=${assessment}`,
        signal
      ),
  })
}
export const healthReasons: Record<string, string> = {
  SOURCE_LOCATION_INVALID:
    'Some reported file locations did not match the assessed source and were excluded. Valid findings are retained.',
  ASSESSMENT_TIMED_OUT:
    'The assessment exceeded its time limit. Retry after checking runtime availability.',
  EXECUTION_INTERRUPTED:
    'Analysis stopped before a verified result was established.',
  ADAPTER_UNAVAILABLE:
    'No qualified analyzer supports this check in the current installation.',
  PREFLIGHT_DISABLED:
    'The operator has not enabled an approved analysis runtime.',
  TESTS_FAILED:
    'Tests failed. Fix the failures before requesting measured coverage.',
  TESTS_SKIPPED:
    'Tests were skipped or marked TODO. Coverage remains unavailable until a complete run succeeds.',
  NO_SOURCE_COVERAGE:
    'Tests ran without measured application source coverage. Test-only files are excluded.',
  TEST_SCOPE_LIMIT:
    'The test file scope exceeds the reviewed limit of 100 files.',
  TEST_RUNNER_FAILED: 'The reviewed test runner did not complete successfully.',
  TESTS_CANCELLED:
    'The test run was cancelled before coverage could be verified.',
  FILE_ANALYSIS_SCAN_ERRORS:
    'The code analyzer reported parse or processing errors. Valid findings are retained, but file coverage is unavailable.',
  FILE_ANALYSIS_SCOPE_EMPTY:
    'The code analyzer did not analyze a nonempty supported file scope.',
  SUPPORTED_TESTS_REQUIRED:
    'No supported Node test files were found. Coverage needs a reviewed test recipe for this project.',
  COVERAGE_UNAVAILABLE:
    'Coverage was not verified. Tests must pass without skips and produce nonempty measured source coverage.',
  REVIEW_REQUIRED:
    'This older assessment predates automatic Health scanning. Reassess to run the current scanners.',
  SCANNER_UNAVAILABLE:
    'The Preflyt scanning service is temporarily unavailable. Retry the assessment. Your administrator can check the scanner service logs if it continues.',
  SOURCE_ACCESS_UNAVAILABLE:
    'Repository files could not be fetched and verified. Check GitHub access and retry the assessment.',
  GITHUB_RATE_LIMITED:
    'GitHub has temporarily limited repository requests. Wait for the GitHub request budget to reset, then reassess.',
  SCANNER_PENDING: 'Waiting for the Preflyt scanners.',
  SCANNER_RESULT_UNVERIFIED:
    'The scanner result could not be verified. Retry the assessment; no passing result was recorded.',
  CONTROLLER_UNAVAILABLE:
    'The approved analysis controller could not be reached or verified.',
  DISPATCHER_REQUIRED: 'Reviewed analysis is not enabled by the operator.',
  TOOL_REVIEW_REQUIRED:
    'This analyzer needs a current version and configuration qualification.',
  CHECKS_PASSED: 'No findings reported within the recorded scope.',
  FINDINGS_REPORTED: 'The analyzer reported potential issues.',
  CHECK_FAILED: 'The analyzer reported a failing check.',
  EVIDENCE_INCOMPLETE: 'Complete evidence was not established.',
  ACCESS_REVOKED: 'Access changed before analysis finished.',
  SOURCE_OR_ANALYSIS_UNAVAILABLE:
    'Source access or analysis could not be verified.',
  REPORT_INVALID: 'The analyzer output failed validation.',
  TOOL_EXECUTION_FAILED: 'The analyzer could not finish successfully.',
  RECEIPT_UNVERIFIED: 'The signed execution result could not be verified.',
  EXECUTION_UNAVAILABLE:
    'Analysis could not be completed under the approved runtime.',
  EXECUTION_CANCELLED: 'The assessment was cancelled.',
}
export const healthLabel = (state: string) =>
  ({
    HEALTHY: 'Healthy',
    NEEDS_ATTENTION: 'Needs attention',
    UNHEALTHY: 'Unhealthy',
    FINDINGS_REPORTED: 'Findings reported',
    NOT_ASSESSED: 'Not assessed',
    QUEUED: 'Queued',
    RUNNING: 'Running',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
    CANCELLED: 'Cancelled',
    CURRENT: 'Current',
    STALE: 'Stale',
    UNVERIFIED: 'Freshness unverified',
    PARTIAL: 'Partial',
    COMPLETE: 'Complete',
    UNAVAILABLE: 'Not run',
    PASS: 'No findings reported',
    FAIL: 'Findings reported',
    INCOMPLETE: 'Incomplete',
  })[state] ?? state

export const healthTone = (value: string): StatusTone =>
  value === 'INCOMPLETE'
    ? 'neutral'
    : ['UNHEALTHY', 'FAILED', 'FINDINGS_REPORTED', 'critical', 'high'].includes(
          value
        )
      ? 'error'
      : [
            'NEEDS_ATTENTION',
            'PARTIAL',
            'INCOMPLETE',
            'STALE',
            'medium',
          ].includes(value)
        ? 'warning'
        : ['HEALTHY', 'COMPLETE', 'CURRENT', 'PASS', 'COMPLETED'].includes(
              value
            )
          ? 'success'
          : value === 'RUNNING'
            ? 'info'
            : 'neutral'

export function useHealthPortfolio({
  page = 1,
  search = '',
  repository,
  enabled = true,
  pageSize = 25,
}: {
  page?: number
  search?: string
  repository?: string
  pageSize?: number
  enabled?: boolean
} = {}) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'health-portfolio',
      session.data?.organizationId,
      session.data?.identityId,
      page,
      search,
      repository ?? 'all',
      pageSize,
    ],
    enabled: enabled && session.isSuccess && !!session.data.organizationId,
    queryFn: ({ signal }) =>
      healthRequest<HealthPortfolioData>(
        `health?${new URLSearchParams({ page: String(page), q: search, pageSize: String(pageSize), ...(repository ? { repository } : {}) })}`,
        signal
      ),
    retry: false,
    refetchInterval: (q) => (q.state.data?.summary.active ? 5000 : false),
  })
}
