import { useQuery } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import type { StatusTone } from '@/components/status-badge'
import type {
  Finding,
  FindingGuidance,
} from '@/features/findings/finding-types'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { freshnessTiming } from './freshness-timing'

export type HealthFinding = {
  review?: Finding['review']
  assessmentId?: string
  assessedAt?: string | null
  aiReview?: Finding['aiReview']
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
  paymentRiskSummary?: { profile: 'payment-risk-v1'; findings: number }
  findingSummary?: {
    total: number
    unsuppressed: number
    analyzerHigh: number
    groups: Array<{
      category: string | null
      checkId: string | null
      count: number
    }>
  }

  sourceReviewCoverage?: {
    version: 1
    scope: 'SOURCE_ONLY'
    evidence: 'AI_REPORTED'
    available: boolean
    truncated: boolean
    entries: Array<{
      surface: string
      riskArea: string
      outcome:
        | 'reported'
        | 'no_issue_found'
        | 'ruled_out'
        | 'not_applicable'
        | 'needs_follow_up'
    }>
    gaps: Array<{ surface: string; riskArea: string; detail: string }>
    caveats: string[]
  }
  selection?: 'all' | HealthCategory
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
    testResults?: Array<{
      directory: string
      framework: string
      state: string
      reason: string
    }>
    scanErrors?: Array<{ type: string; path: string | null; line?: number }>
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
      version: 1 | 2
      formula: 'node-covered-lines-v1' | 'repository-lcov-lines-v1'
      scope: 'node-loaded-files' | 'configured-test-packages'
      packages?: { directory: string; framework: string; manager: string }[]
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
  reviewProfile?: 'general' | 'payment-risk-v1' | 'general-and-payment-risk-v1'
  parentId?: string | null
  includeAiSecurity?: boolean
  aiReviewId?: string | null
  scanner?: 'strix' | null
  category?: HealthCategory | null
  retryAt?: string | null
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
  categories?: Partial<
    Record<
      'security' | 'reliability' | 'maintainability',
      {
        findings: number
        partial: boolean
        comparisonKey: string | null
        bySeverity?: Record<string, number>
        remediation?: {
          status:
            'COMPARED' | 'BASELINE' | 'PARTIAL' | 'SCOPE_CHANGED' | 'AI_REVIEW'
          previousAssessmentId?: string
          previousSourceSha?: string
          introduced?: number
          noLongerReported?: number
          remaining?: number
        }
      } | null
    >
  >
  scope?: HealthCategory | 'all' | 'ai'
  partial: boolean
  comparableFindings: number | null
  checkIds?: string[]
  id: string
  sourceSha: string
  at: string
  findings: number
}
export type HealthData = {
  strixReview?: HealthAssessment | null
  assessmentOptions?: { includeAiSecurity: boolean }

  latestAttempt?: HealthAssessment | null
  refreshPending?: boolean
  branchCoverage?: {
    branch: string | null
    result: NonNullable<HealthData['ciCoverage']>
    matchesHealth: boolean
    latestAttempt: {
      state: string
      sourceSha: string
      failureCode: string | null
      retryAt: string
      createdAt: string
      finishedAt: string | null
      runUrl: string
    } | null
  }

  categoryResults?: Partial<
    Record<
      HealthCategory,
      {
        assessmentId: string
        assessmentIds?: string[]
        aiFindings?: number
        standardFindings?: number
        finishedAt: string | null
        value: string
      } | null
    >
  >
  ciCoverage?: {
    sourceSha: string | null
    state: 'VERIFIED' | 'MISSING' | 'UNVERIFIED'
    reason: string
    runUrl?: string
    receivedAt?: string
    measurement?: {
      analyzedFiles: number
      analyzedLines: number
      coveredLines: number
    }
    tests?: {
      tests: number
      passed: number
      failures: number
      errors: number
      skipped: number
    }
    testsState?: 'PASS' | 'FAIL' | 'INCOMPLETE'
  }
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
export type HealthCategory =
  'security' | 'reliability' | 'maintainability' | 'duplication' | 'coverage'
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
export function healthFindingCount(report: HealthReport) {
  return report.findingSummary?.total ?? report.findings.length
}
export type HealthFindingsPage = {
  unfilteredTotal?: number
  assessmentId: string
  sourceSha: string | null
  rows: HealthFinding[]
  total: number
  page: number
  pageSize: number
}
export function useHealthFindings(
  repositoryId: string,
  assessment: string | undefined,
  page: number,
  pageSize: number,
  search: string,
  severity: string,
  enabled: boolean,
  reports?: string
) {
  const session = useNavigationSession()
  return useQuery({
    queryKey: [
      'health-findings',
      reports,
      session.data?.organizationId,
      session.data?.identityId,
      repositoryId,
      assessment,
      page,
      pageSize,
      search,
      severity,
    ],
    enabled: enabled && !!assessment && session.isSuccess,
    queryFn: ({ signal }) =>
      healthRequest<HealthFindingsPage>(
        `repositories/${repositoryId}/health/${assessment}/findings?${new URLSearchParams({ page: String(page), pageSize: String(pageSize), q: search, severity, ...(reports ? { reports } : {}) })}`,
        signal
      ),
    retry: false,
    staleTime: 10000,
  })
}
export function useHealth(
  repositoryId: string,
  assessment?: string,
  page = 1,
  enabled = true,
  branch?: string
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
      branch,
    ],
    enabled: enabled && session.isSuccess,
    queryFn: ({ signal }) =>
      healthRequest<HealthData>(
        `repositories/${repositoryId}/health?${new URLSearchParams({ page: String(page), ...(assessment ? { assessment } : {}), ...(branch ? { branch } : {}) })}`,
        signal
      ),
    retry: false,
    staleTime: 10000,
    refetchInterval: (q) =>
      q.state.data?.refreshPending ||
      ['QUEUED', 'RUNNING'].includes(q.state.data?.strixReview?.state ?? '') ||
      ['QUEUED', 'RUNNING'].includes(
        q.state.data?.latestAttempt?.state ??
          q.state.data?.assessment?.state ??
          ''
      ) ||
      ['PENDING', 'PROCESSING'].includes(
        q.state.data?.branchCoverage?.latestAttempt?.state ?? ''
      )
        ? 5000
        : assessment
          ? false
          : 30000,
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
      freshnessTiming(q.state.data?.checkedAt, q.state.dataUpdatedAt).staleTime,
    refetchInterval: (q) =>
      freshnessTiming(q.state.data?.checkedAt, q.state.dataUpdatedAt)
        .refetchInterval,
    queryFn: ({ signal }) =>
      healthRequest<HealthFreshness>(
        `repositories/${repositoryId}/health/freshness?assessment=${assessment}`,
        signal
      ),
  })
}
export const healthReasons: Record<string, string> = {
  AI_SECURITY_UNAVAILABLE:
    'AI security review was skipped because the model connection, source-sharing permission or scanner is unavailable. Standard checks can still run.',
  HEALTH_SHARED_SOURCE_UNAVAILABLE:
    'The saved source snapshot is unavailable. Start a new assessment to fetch and verify source again.',
  STRIX_RUNNER_BUSY:
    'Waiting for AI security review runner capacity. This assessment will retry automatically.',
  STRIX_REVIEW_UNAVAILABLE:
    'Strix review could not finish. Check the dedicated runner and repository model connection.',
  STRIX_RUNNER_STATE_LOST:
    'The runner lost this review. Start a new Strix review after checking the runner.',
  STRIX_REVIEW_PENDING: 'Strix security review is running.',
  STRIX_INPUT_LIMIT_REACHED:
    'The AI security review reached its input-token limit before it could finish.',
  STRIX_OUTPUT_LIMIT_REACHED:
    'The AI security review reached its output-token limit before it could finish.',
  STRIX_REQUEST_LIMIT_REACHED:
    'The AI security review reached its model-request limit before it could finish.',
  AI_REVIEW_REPORTED:
    'Strix review finished. Findings are AI suggestions; coverage remains limited.',
  PAYMENT_RISK_REPORT_INCOMPLETE:
    'The payment review did not produce a complete, source-backed report.',
  STRIX_REVIEW_INCOMPLETE:
    'Strix stopped before completing the requested review.',

  HEALTH_TEST_EXECUTION_REMOVED:
    'Repository Health no longer runs tests. Reassess for static analysis and submit test results and coverage from your CI workflow.',
  NO_APPLICABLE_ANALYSIS:
    'No supported files or configuration were found for this category at the selected commit.',
  GIT_UNAVAILABLE:
    'The deployment cannot fetch repository source because Git is unavailable. Ask your administrator to update the Preflyt worker image.',
  SOURCE_FETCH_FAILED:
    'The pinned commit could not be fetched through Git. Check GitHub App access and retry the assessment.',
  SOURCE_FETCH_TIMED_OUT:
    'The Git source fetch exceeded its time limit. Retry; if it continues, ask your administrator to check network connectivity.',
  SOURCE_FETCH_LIMIT_EXCEEDED:
    'The repository source exceeds the bounded Git download or source-size limit. Ask your administrator to review the repository size and scanner limits.',
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
    'The test command or its setup failed. Coverage was not produced. Check the repository’s test setup and failing tests before retrying.',
  TESTS_SKIPPED:
    'Tests were skipped or marked TODO. Coverage remains unavailable until a complete run succeeds.',
  NO_TEST_SETUP:
    'The historical Health run found no test setup. Configure tests and coverage in your CI workflow.',
  UNSUPPORTED_TEST_COMMAND:
    'The historical Health test command was unsupported. Configure tests and coverage in CI.',
  LOCKFILE_REQUIRED:
    'Commit a package-lock.json, pnpm-lock.yaml or Yarn Classic yarn.lock so dependencies can be installed reproducibly.',
  AMBIGUOUS_LOCKFILES:
    'More than one package manager lockfile was found. Keep the lockfile used by this package.',
  UNSUPPORTED_PACKAGE_MANAGER:
    'This package manager is not supported yet. Supported managers are npm, pnpm and Yarn Classic.',
  COVERAGE_PROVIDER_UNAVAILABLE:
    'The coverage provider matching this Vitest version could not be installed. Check that the version is available in the public npm registry.',
  DEPENDENCY_SOURCE_UNSUPPORTED:
    'A dependency uses a private registry, Git URL or unsupported source. Health currently installs dependencies from the public npm and Yarn registries.',
  LOCKFILE_OUT_OF_SYNC:
    'This package’s lockfile is out of sync. Run the package manager install command in the affected package, commit the updated lockfile, and run test coverage again.',
  DEPENDENCY_INSTALL_TIMED_OUT:
    'Dependency installation exceeded its four-minute limit. Retry or ask the deployment operator to check registry connectivity and runner capacity.',
  DEPENDENCY_INSTALL_FAILED:
    'Dependencies could not be installed from the public npm registry. Check the lockfile and package versions. Private registries and install scripts are not available in Health.',
  TEST_ENVIRONMENT_UNAVAILABLE:
    'The isolated test environment could not start. Retry, or ask the deployment operator to check the Health scanner service.',
  TESTS_TIMED_OUT:
    'The test run exceeded its time limit. Review the CI workflow logs and test job timeout.',
  NO_SOURCE_COVERAGE:
    'Tests ran without usable line coverage for the assessed source files.',
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
    'Repository requests are temporarily paused. Wait until the retry time, then reassess.',
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
/** Fixed user-facing failure descriptions; never expose provider exception text. */
export function healthFailure(reason: string | null, canRetry = true) {
  const actions: Record<string, string> = {
    STRIX_INPUT_LIMIT_REACHED:
      'An organization administrator can raise the input-token limit in AI Intelligence → Security review limits. Then start a new review.',
    STRIX_OUTPUT_LIMIT_REACHED:
      'An organization administrator can raise the output-token limit in AI Intelligence → Security review limits. Then start a new review.',
    STRIX_REQUEST_LIMIT_REACHED:
      'An organization administrator can raise the model-request limit in AI Intelligence → Security review limits. Then start a new review.',
    PAYMENT_RISK_REPORT_INCOMPLETE:
      'Open any retained findings, then start a new Payment Risk Review to complete the missing report sections.',
    STRIX_REVIEW_INCOMPLETE:
      'Select Include AI security review in Assessment options, then Reassess to start another review. If it fails again, give your administrator the assessment ID.',
    STRIX_REVIEW_UNAVAILABLE:
      'Check the security testing model and scanner, then select Include AI security review in Assessment options and Reassess.',
    STRIX_RUNNER_STATE_LOST:
      'The interrupted review will not restart automatically. Select Include AI security review in Assessment options, then Reassess to start a new review.',
    NO_APPLICABLE_ANALYSIS:
      'Choose a category that matches the repository files, or run a full assessment after adding the relevant files or test setup.',
    GIT_UNAVAILABLE:
      'Ask your administrator to update the Preflyt worker image to include Git, then reassess.',
    SOURCE_FETCH_LIMIT_EXCEEDED:
      'Ask your administrator to review the repository size and fetch limits before retrying.',
    SOURCE_FETCH_FAILED:
      'Check GitHub App access and select Reassess. If it continues, ask your administrator to check the worker’s network access to github.com.',
    SOURCE_FETCH_TIMED_OUT:
      'Select Reassess. If it times out again, ask your administrator to check the worker’s network access to github.com.',
    GITHUB_RATE_LIMITED: 'Wait until the retry time, then select Reassess.',
    ACCESS_REVOKED:
      'Check that the repository is selected and the GitHub App still has access, then select Reassess.',
    SOURCE_ACCESS_UNAVAILABLE:
      'Check the selected branch and GitHub App access, then select Reassess.',
    SOURCE_OR_ANALYSIS_UNAVAILABLE:
      'Select Reassess to try again. If it fails again, ask your administrator to check repository access and scanner availability.',
    SCANNER_UNAVAILABLE:
      'Select Reassess to retry. If it continues, ask your administrator to check the Health scanner service.',
    ASSESSMENT_TIMED_OUT:
      'Select Reassess. If it times out again, ask your administrator to check scanner capacity and the repository’s test command.',
    SCANNER_RESULT_UNVERIFIED:
      'Select Reassess. If verification keeps failing, ask your administrator to check the Health scanner service.',
    RECEIPT_UNVERIFIED:
      'Select Reassess. If verification keeps failing, ask your administrator to check the Health scanner service.',
    EXECUTION_INTERRUPTED: 'Select Reassess to start a new assessment.',
  }
  return {
    message:
      reason && Object.prototype.hasOwnProperty.call(healthReasons, reason)
        ? healthReasons[reason]
        : 'The assessment stopped without a usable result. A specific cause was not recorded.',
    action: !canRetry
      ? 'Ask a repository maintainer to retry the assessment after resolving this problem.'
      : reason && Object.prototype.hasOwnProperty.call(actions, reason)
        ? actions[reason]
        : 'Select Reassess to try again. If it fails again, give your administrator the assessment ID below.',
  }
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
    SKIPPED: 'Skipped',
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
  ['UNHEALTHY', 'FAILED', 'FINDINGS_REPORTED', 'critical', 'high'].includes(
    value
  )
    ? 'error'
    : ['NEEDS_ATTENTION', 'PARTIAL', 'INCOMPLETE', 'STALE', 'medium'].includes(
          value
        )
      ? 'warning'
      : ['HEALTHY', 'COMPLETE', 'CURRENT', 'PASS', 'COMPLETED'].includes(value)
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
