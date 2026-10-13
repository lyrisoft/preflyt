import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  GitCommitHorizontal,
  ClipboardList,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { SkillReviewPanel } from '../intelligence/skill-review-panel'
import { AssessmentContext } from './assessment-context'
import {
  checkNextStep,
  checkReview,
  isExecutionVerified,
  reviewReason,
  reviewStatuses,
} from './assessment-result'
import { AssessmentResultsChart } from './assessment-results-chart'
import { useGatePreview, type ContextRequest } from './engineering-queries'
import {
  EvidenceValidationPanel,
  type EvidenceValidation,
} from './evidence-validation-panel'
import { GateEvaluationDetails, GatePreviewPanel } from './gate-preview-panel'
import { NativeExecutionStatus } from './native-execution-status'
import {
  useAssessmentList,
  useCiEvidence,
  useStandards,
  type AssessmentListItem,
} from './repository-queries'
import {
  ciResultStatus,
  coverageStatus,
  sentence,
  sourceLabel,
  type CiResult,
} from './repository-vocabulary'

type Assessment = AssessmentListItem & {
  assessmentHash: string
  selectionId: string
  request: ContextRequest & {
    trigger: string
    selectionRevision: number
    profileSnapshotId: string | null
  }
  plan: {
    adoptionProfile: string
    packs: { id: string; version: string; digest: string }[]
  }
  report: {
    collectedAt: string
    coverage: string
    requiredChecks: number
    trustedExecutedChecks: number
    collectionTruncated: boolean
    checks: {
      ruleId: string
      title: string
      required: boolean
      coverage: string
      evidenceValidation?: EvidenceValidation | null
      providerResult: CiResult | null
      mappingTrust?: string | null
      freshness: string
      deliveryId: string | null
      reason: string
    }[]
    observations: {
      deliveryId: string
      sourceKind: string
      sourceObjectId: string
      result: string
      evidenceHash: string
      sourcePayloadHash: string
      artifacts: {
        id: string
        format: string
        sha256: string
        verification: string
        summary: Record<string, unknown>
      }[]
    }[]
  }
}

function AssessmentCreator({
  repositoryId,
  initialSha,
  onCreated,
}: {
  repositoryId: string
  initialSha: string
  onCreated: (id: string) => void
}) {
  const [sha, setSha] = useState(initialSha)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const key = useRef(crypto.randomUUID())
  const valid = /^[a-f0-9]{40}$/i.test(sha)
  const standards = useStandards(repositoryId)
  const evidence = useCiEvidence(repositoryId, sha, { enabled: valid })
  const mutation = useMutation({
    meta: { successMessage: 'Assessment saved' },
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/assessments`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceSha: sha,
            expectedSelectionId: standards.data?.selection?.id,
            requestKey: key.current,
            mappings: Object.entries(mappings)
              .filter(([, value]) => value !== 'none')
              .map(([ruleId, deliveryId]) => ({ ruleId, deliveryId })),
          }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Inputs or standards changed. Reload before creating a new assessment.'
            : response.status === 404
              ? 'This commit has no saved profile or imported check results and reports.'
              : 'Could not create assessment. Check the mappings, session and repository access.'
        )
      return response.json() as Promise<{ assessment: Assessment }>
    },
    onSuccess: ({ assessment }) => {
      key.current = crypto.randomUUID()
      onCreated(assessment.id)
    },
  })
  const ready = standards.data?.selection && standards.data.selectionIntegrity
  return (
    <>
      <div className='flex-1 space-y-5 overflow-y-auto px-4'>
        <label className='block space-y-2 text-sm'>
          <span className='font-medium'>Commit SHA</span>
          <Input
            value={sha}
            maxLength={40}
            placeholder='Full 40-character SHA'
            className='font-mono text-xs'
            aria-invalid={sha !== '' && !valid}
            disabled={mutation.isPending}
            onChange={(event) => {
              setSha(event.target.value.trim().toLowerCase())
              setMappings({})
              key.current = crypto.randomUUID()
            }}
          />
          <span className='block text-xs text-muted-foreground'>
            Defaults to the profiled commit.
          </span>
        </label>
        {standards.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {standards.error.message}
          </p>
        ) : !standards.data?.selection ? (
          <p className='text-sm'>Save a standards selection first.</p>
        ) : !standards.data.selectionIntegrity ? (
          <p role='alert' className='text-sm text-destructive'>
            The saved pack versions could not be verified. Review your standards
            selection before creating an assessment.
          </p>
        ) : (
          <fieldset className='space-y-3'>
            <legend className='mb-1 text-sm font-medium'>
              CI result per control
            </legend>
            <p className='text-xs text-muted-foreground'>
              You can manually link a CI result to a control. Otherwise, Preflyt
              uses its approved CI source when available. Manual links do not
              verify that the control ran.
            </p>
            {evidence.isError && (
              <p role='alert' className='text-sm text-destructive'>
                {evidence.error.message}
              </p>
            )}
            {standards.data.controls.map((rule) => (
              <label key={rule.id} className='block space-y-1.5 text-sm'>
                <span>{rule.title}</span>
                <Select
                  value={mappings[rule.id] ?? 'none'}
                  disabled={!valid || evidence.isFetching || mutation.isPending}
                  onValueChange={(value) => {
                    setMappings((old) => ({ ...old, [rule.id]: value }))
                    key.current = crypto.randomUUID()
                  }}
                >
                  <SelectTrigger
                    className='w-full'
                    aria-label={`CI result for ${rule.title}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>
                      Use the approved CI source if available
                    </SelectItem>
                    {evidence.data?.observations.map((item) => (
                      <SelectItem key={item.deliveryId} value={item.deliveryId}>
                        {sourceLabel(item.sourceKind, item.sourceObjectId)} ·{' '}
                        {ciResultStatus[item.result].label} ·{' '}
                        <ResultTimestamp value={item.observedAt} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </fieldset>
        )}
        {mutation.error && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
      <SheetFooter className='border-t'>
        <Button
          disabled={
            !ready ||
            !valid ||
            mutation.isPending ||
            evidence.isFetching ||
            evidence.isError
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Creating…' : 'Create assessment'}
        </Button>
      </SheetFooter>
    </>
  )
}

type AssessmentProps = {
  repositoryId: string
  canCreate: boolean
  initialSha: string
  initialAssessmentId?: string
  reportOrigin?: 'quality-gates'
}

function assessmentReportHref(
  repositoryId: string,
  assessmentId: string,
  from?: 'quality-gates'
) {
  const search = new URLSearchParams({
    repository: repositoryId,
    assessment: assessmentId,
  })
  if (from) search.set('from', from)
  return `/assessments?${search}`
}

export function RepositoryAssessments(props: AssessmentProps) {
  return props.initialAssessmentId ? (
    <AssessmentReport {...props} />
  ) : (
    <AssessmentList {...props} />
  )
}

function AssessmentListRow({
  repositoryId,
  assessment,
  from,
}: {
  repositoryId: string
  assessment: AssessmentListItem
  from?: 'quality-gates'
}) {
  const query = useGatePreview(repositoryId, assessment.id)
  // Never retain a cached pass after access or verification fails.
  const result =
    !query.isError && query.data?.sourceSha === assessment.sourceSha
      ? query.data
      : undefined
  const status = result && reviewStatuses[result.status]
  const unavailable = query.isError || (!query.isPending && !status)
  // A completed evaluation has a passed or failed result. Missing or unverified
  // evidence is incomplete, even when the CI provider reported success.
  const counts =
    result && status && !result.reasons.includes('SNAPSHOT_SCHEMA_UNSUPPORTED')
      ? result.rules.reduce(
          (totals, rule) => {
            if (rule.status === 'PASS') totals.passed += 1
            else if (rule.status === 'BLOCK') totals.failed += 1
            else totals.incomplete += 1
            return totals
          },
          { total: result.rules.length, passed: 0, failed: 0, incomplete: 0 }
        )
      : undefined
  const metrics = [
    {
      label: 'Evaluated',
      value: counts
        ? `${counts.passed + counts.failed} / ${counts.total}`
        : '—',
      description: counts
        ? `${counts.passed + counts.failed} of ${counts.total} checks evaluated`
        : 'Evaluated checks unavailable',
      tone: '',
    },
    {
      label: 'Passed',
      value: counts?.passed ?? '—',
      description: counts
        ? `${counts.passed} checks passed`
        : 'Passed checks unavailable',
      tone: counts?.passed ? 'text-success-text' : '',
    },
    {
      label: 'Failed',
      value: counts?.failed ?? '—',
      description: counts
        ? `${counts.failed} ${counts.failed === 1 ? 'check' : 'checks'} failed`
        : 'Failed checks unavailable',
      tone: counts?.failed ? 'text-destructive' : '',
    },
    {
      label: 'Incomplete',
      value: counts?.incomplete ?? '—',
      description: counts
        ? `${counts.incomplete} checks incomplete`
        : 'Incomplete checks unavailable',
      tone: counts?.incomplete ? 'text-warning-text' : '',
    },
  ]
  return (
    <li>
      <a
        href={assessmentReportHref(repositoryId, assessment.id, from)}
        aria-label={`Open assessment for commit ${assessment.sourceSha.slice(0, 7)}: ${unavailable ? 'Result unavailable' : (status?.label ?? 'Loading result')}${counts ? `, ${counts.passed + counts.failed} of ${counts.total} checks evaluated, ${counts.passed} passed, ${counts.failed} failed, ${counts.incomplete} incomplete` : ''}`}
        className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 text-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring @4xl/assessments:grid-cols-[minmax(7rem,0.75fr)_minmax(6rem,0.8fr)_5.5rem_3.5rem_3.5rem_5.5rem_minmax(0,1.4fr)_1rem]'
      >
        <span className='flex items-center gap-2 font-medium'>
          <GitCommitHorizontal
            aria-hidden='true'
            className='size-4 shrink-0 text-chart-1'
          />
          <code title={assessment.sourceSha}>
            {assessment.sourceSha.slice(0, 7)}
          </code>
        </span>
        <ResultTimestamp
          value={assessment.createdAt}
          className='text-xs text-muted-foreground sm:text-sm'
        />
        <span className='col-span-2 grid grid-cols-2 gap-x-3 gap-y-2 @sm/assessments:grid-cols-4 @4xl/assessments:contents'>
          {metrics.map((metric) => (
            <span
              key={metric.label}
              aria-label={metric.description}
              className={`min-w-0 space-y-1 tabular-nums ${metric.tone}`}
            >
              <span className='block text-[11px] font-normal text-muted-foreground @4xl/assessments:hidden'>
                {metric.label}
              </span>
              <span className='font-medium'>{metric.value}</span>
            </span>
          ))}
        </span>
        <span className='col-span-2 @4xl/assessments:col-span-1'>
          {unavailable ? (
            <StatusBadge tone='warning'>Result unavailable</StatusBadge>
          ) : status ? (
            <StatusBadge
              tone={status.tone}
              className='max-w-full text-left whitespace-normal'
            >
              {status.label}
            </StatusBadge>
          ) : (
            <span className='text-xs text-muted-foreground'>
              Loading result…
            </span>
          )}
        </span>
        <ArrowRight
          aria-hidden='true'
          className='hidden size-4 text-muted-foreground @4xl/assessments:block'
        />
      </a>
    </li>
  )
}

export function AssessmentList({
  repositoryId,
  canCreate,
  initialSha,
  reportOrigin,
}: AssessmentProps) {
  const history = useAssessmentList(repositoryId)
  const client = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [page, setPage] = useState(1)
  const records = history.isError ? [] : (history.data?.assessments ?? [])
  const pages = Math.max(1, Math.ceil(records.length / 5))
  const currentPage = Math.min(page, pages)
  const visible = records.slice((currentPage - 1) * 5, currentPage * 5)
  return (
    <Card className='@container/assessments gap-0 overflow-hidden'>
      <CardHeader className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-4'>
        <div className='space-y-1'>
          <CardTitle asChild>
            <h2>Saved assessments</h2>
          </CardTitle>
          <p className='text-xs text-muted-foreground'>
            Open an assessment to review its checks and evidence.
          </p>
        </div>
        <CardAction className='flex gap-2'>
          <Button
            size='icon'
            variant='outline'
            className='touch-target size-8'
            aria-label='Reload assessments'
            disabled={history.isFetching}
            onClick={() => {
              void history.refetch()
              void client.invalidateQueries({
                queryKey: ['gate-preview', repositoryId],
              })
            }}
          >
            <RefreshCw className={history.isFetching ? 'animate-spin' : ''} />
          </Button>
          <PageHelpDrawer
            title='Saved assessments'
            sections={[
              {
                title: 'Check counts',
                content:
                  'Evaluated shows checks with a passed or failed result out of all checks in the saved assessment. Counts include required and optional checks. Incomplete checks lack enough verified evidence for a result. AI reviews are separate and appear in the report.',
              },
              {
                title: 'Saved results',
                content:
                  'Each row uses the saved evaluation for that commit. Successful CI alone does not establish a passing check. Unavailable counts appear as a dash. GitHub decides whether merging is allowed.',
              },
            ]}
          />
          {canCreate && !history.isError && (
            <Sheet open={creating} onOpenChange={setCreating}>
              <SheetTrigger asChild>
                <Button size='sm'>
                  <Plus aria-hidden='true' />
                  New assessment
                </Button>
              </SheetTrigger>
              <SheetContent className='gap-0 sm:max-w-md'>
                <SheetHeader>
                  <SheetTitle>New commit assessment</SheetTitle>
                  <SheetDescription>
                    Freeze the saved standards and CI results at one commit.
                  </SheetDescription>
                </SheetHeader>
                <AssessmentCreator
                  repositoryId={repositoryId}
                  initialSha={initialSha}
                  onCreated={(id) => {
                    setCreating(false)
                    void client.invalidateQueries({
                      queryKey: ['assessments', repositoryId],
                    })
                    window.location.assign(
                      assessmentReportHref(repositoryId, id, reportOrigin)
                    )
                  }}
                />
              </SheetContent>
            </Sheet>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className='px-4 py-4 sm:px-4'>
        {history.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading assessments…
          </p>
        ) : history.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {history.error.message}
          </p>
        ) : !records.length ? (
          <div className='flex items-start gap-3 rounded-lg bg-muted/15 p-4'>
            <SurfaceIcon icon={ClipboardList} />
            <div className='space-y-2'>
              <p className='text-sm font-semibold'>No saved assessments yet</p>
              <p className='text-sm text-muted-foreground'>
                {canCreate
                  ? 'Create an assessment to see which required checks need attention at this commit.'
                  : 'Ask a repository administrator to create an assessment for this commit.'}
              </p>
              {canCreate && (
                <Button size='sm' onClick={() => setCreating(true)}>
                  Create assessment
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className='overflow-hidden rounded-lg border'>
              <div
                className='hidden grid-cols-[minmax(7rem,0.75fr)_minmax(6rem,0.8fr)_5.5rem_3.5rem_3.5rem_5.5rem_minmax(0,1.4fr)_1rem] gap-4 border-b bg-muted/20 px-4 py-2.5 text-xs font-medium text-muted-foreground @4xl/assessments:grid'
                aria-hidden='true'
              >
                <span>Commit</span>
                <span>Created</span>
                <span>Evaluated</span>
                <span>Passed</span>
                <span>Failed</span>
                <span>Incomplete</span>
                <span>Merge review result</span>
                <span />
              </div>
              <ul className='divide-y' aria-label='Saved assessments'>
                {visible.map((item) => (
                  <AssessmentListRow
                    key={item.id}
                    repositoryId={repositoryId}
                    assessment={item}
                    from={reportOrigin}
                  />
                ))}
              </ul>
            </div>
            <nav
              aria-label='Assessment pages'
              className='mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'
            >
              <span>
                {(currentPage - 1) * 5 + 1}–
                {Math.min(currentPage * 5, records.length)} of {records.length}{' '}
                assessments
              </span>
              {pages > 1 && (
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    Previous assessments
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={currentPage === pages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    Next assessments
                  </Button>
                </div>
              )}
            </nav>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AssessmentReport({
  repositoryId,
  canCreate,
  initialSha,
  initialAssessmentId,
}: {
  repositoryId: string
  canCreate: boolean
  initialSha: string
  initialAssessmentId?: string
}) {
  const client = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [resultFilter, setResultFilter] = useState('all')
  const [checkView, setCheckView] = useState('attention')
  const checksRef = useRef<HTMLDivElement>(null)
  const [assessmentTab, setAssessmentTab] = useState('checks')
  const [checkPage, setCheckPage] = useState(1)
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const history = useAssessmentList(repositoryId)
  const current =
    selected ?? initialAssessmentId ?? history.data?.assessments[0]?.id
  const detail = useQuery({
    queryKey: ['assessment', repositoryId, current],
    retry: false,
    enabled: !!current && !history.isError,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/assessments/${current}`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new Error(
          'Could not load this assessment. Check your session and repository access.'
        )
      return response.json() as Promise<Assessment>
    },
  })
  const data = detail.isError || history.isError ? undefined : detail.data
  const preview = useGatePreview(repositoryId, current, !!data)
  const evaluated =
    !preview.isError && preview.data?.sourceSha === data?.sourceSha
      ? preview.data
      : undefined
  const ruleResults = new Map(
    evaluated?.rules.map((rule) => [rule.ruleId, rule])
  )
  const ruleFor = (check: Assessment['report']['checks'][number]) => {
    const rule = ruleResults.get(check.ruleId)
    return rule?.required === check.required ? rule : undefined
  }
  const attentionCount =
    data?.report.checks.filter(
      (check) => check.required && ruleFor(check)?.status !== 'PASS'
    ).length ?? 0
  const sources = new Map(
    data?.report.observations.map((item) => [
      item.deliveryId,
      sourceLabel(item.sourceKind, item.sourceObjectId),
    ])
  )
  const totalChecks = data?.report.checks.length ?? 0
  const passedChecks =
    data?.report.checks.filter((check) => ruleFor(check)?.status === 'PASS')
      .length ?? 0
  const failedChecks =
    data?.report.checks.filter((check) => ruleFor(check)?.status === 'BLOCK')
      .length ?? 0
  const notEvaluatedChecks = totalChecks - passedChecks - failedChecks
  const checks = (data?.report.checks ?? [])
    .filter((check) =>
      checkView === 'attention'
        ? check.required && ruleFor(check)?.status !== 'PASS'
        : checkView === 'passing'
          ? ruleFor(check)?.status === 'PASS'
          : checkView === 'optional'
            ? !check.required
            : true
    )
    .filter((check) =>
      resultFilter === 'passed'
        ? ruleFor(check)?.status === 'PASS'
        : resultFilter === 'failed'
          ? ruleFor(check)?.status === 'BLOCK'
          : resultFilter === 'incomplete'
            ? !['PASS', 'BLOCK'].includes(ruleFor(check)?.status ?? '')
            : true
    )
    .sort((a, b) => {
      const priority = (check: Assessment['report']['checks'][number]) =>
        (check.required ? 0 : 3) +
        (ruleFor(check)?.status === 'BLOCK'
          ? 0
          : ruleFor(check)?.status === 'PASS'
            ? 2
            : 1)
      return priority(a) - priority(b)
    })
  const checkPages = Math.max(1, Math.ceil(checks.length / 5))
  const currentCheckPage = Math.min(checkPage, checkPages)
  const visibleChecks = checks.slice(
    (currentCheckPage - 1) * 5,
    currentCheckPage * 5
  )
  return (
    <Card className='gap-0 overflow-hidden'>
      <CardHeader className='flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-4'>
        <div className='flex min-w-0 flex-wrap items-center gap-3'>
          <CardTitle asChild>
            <h2>Assessment report</h2>
          </CardTitle>
        </div>
        <CardAction className='flex flex-wrap gap-2'>
          <Button
            size='icon'
            variant='outline'
            className='touch-target size-8'
            aria-label='Reload assessments'
            disabled={history.isFetching}
            onClick={() => {
              void history.refetch()
              if (current) {
                void detail.refetch()
                void preview.refetch()
              }
            }}
          >
            <RefreshCw className={history.isFetching ? 'animate-spin' : ''} />
          </Button>
          {canCreate && !history.isError && (
            <Sheet open={creating} onOpenChange={setCreating}>
              <SheetTrigger asChild>
                <Button size='sm'>
                  <Plus aria-hidden='true' />
                  New assessment
                </Button>
              </SheetTrigger>
              <SheetContent className='gap-0 sm:max-w-md'>
                <SheetHeader>
                  <SheetTitle>New commit assessment</SheetTitle>
                  <SheetDescription>
                    Freeze the saved standards and CI results at one commit.
                  </SheetDescription>
                </SheetHeader>
                <AssessmentCreator
                  key={initialSha}
                  repositoryId={repositoryId}
                  initialSha={initialSha}
                  onCreated={(id) => {
                    setSelected(id)
                    setResultFilter('all')
                    setCheckView('attention')
                    setCheckPage(1)
                    setExpandedCheck(null)
                    setAssessmentTab('checks')
                    setCreating(false)
                    void client.invalidateQueries({
                      queryKey: ['assessments', repositoryId],
                    })
                  }}
                />
              </SheetContent>
            </Sheet>
          )}
          <PageHelpDrawer
            title='Saved assessments'
            sections={[
              {
                title: 'Reading the result',
                content: (
                  <p>
                    A saved assessment evaluates the standards and evidence for
                    one commit. Required failures and missing results appear
                    first. Passing configuration checks confirm configuration,
                    not successful test or scan execution. The Check results
                    chart uses the same evaluation as this summary and includes
                    both required and optional checks.
                  </p>
                ),
              },
              {
                title: 'CI evidence and verification',
                content: (
                  <p>
                    A successful CI result or a signed report alone does not
                    prove which tools and checks ran. The merge review uses the
                    saved evidence verification. Review each check for its
                    evidence and next step.
                  </p>
                ),
              },
              {
                title: 'New results and merge permission',
                content: (
                  <p>
                    Later CI results do not change an existing assessment. Save
                    a new assessment to include them. GitHub merge protection is
                    managed separately in Merge Protection; AI reviews provide
                    suggestions only.
                  </p>
                ),
              },
            ]}
          />
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-5 px-4 py-4 sm:px-4'>
        {history.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading assessments…
          </p>
        ) : history.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {history.error.message}
          </p>
        ) : history.data.assessments.length === 0 ? (
          <div className='flex items-start gap-3 rounded-lg border bg-muted/15 p-5'>
            <SurfaceIcon icon={ClipboardList} />
            <div className='min-w-0 space-y-2'>
              <p className='text-sm font-semibold'>No saved assessments yet</p>
              <p className='text-sm text-muted-foreground'>
                {canCreate
                  ? 'Create an assessment to see which required checks need attention at this commit.'
                  : 'Ask a repository administrator to create an assessment for this commit.'}
              </p>
              {canCreate && (
                <Button size='sm' onClick={() => setCreating(true)}>
                  Create assessment
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {detail.isError ? (
              <p role='alert' className='text-sm text-destructive'>
                {detail.error.message}
              </p>
            ) : detail.isPending ? (
              <p role='status' className='text-sm text-muted-foreground'>
                Loading assessment…
              </p>
            ) : (
              data && (
                <>
                  <GatePreviewPanel
                    preview={preview}
                    onReviewChecks={() => {
                      setCheckView(
                        evaluated?.status === 'WARN' ? 'optional' : 'attention'
                      )
                      setResultFilter('all')
                      setCheckPage(1)
                      setExpandedCheck(null)
                      setAssessmentTab('checks')
                      requestAnimationFrame(() => checksRef.current?.focus())
                    }}
                  />
                  <p className='text-xs text-muted-foreground'>
                    Commit{' '}
                    <code className='text-foreground' title={data.sourceSha}>
                      {data.sourceSha.slice(0, 12)}
                    </code>{' '}
                    · Standards revision {data.request.selectionRevision} ·
                    collected{' '}
                    <ResultTimestamp value={data.report.collectedAt} />
                  </p>
                  {initialSha && initialSha !== data.sourceSha && (
                    <div
                      role='status'
                      className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3'
                    >
                      <p className='text-sm sm:min-w-0 sm:flex-1'>
                        This assessment is for a different commit than the
                        inspected repository. Inspected commit:{' '}
                        <code className='text-xs'>
                          {initialSha.slice(0, 12)}
                        </code>
                        .
                      </p>
                      {canCreate && (
                        <Button
                          size='sm'
                          variant='outline'
                          onClick={() => setCreating(true)}
                        >
                          Assess inspected commit
                        </Button>
                      )}
                    </div>
                  )}
                  {data.report.collectionTruncated && (
                    <p
                      role='alert'
                      className='flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm'
                    >
                      <AlertTriangle
                        aria-hidden='true'
                        className='size-4 text-warning'
                      />
                      CI collection hit its 100-result limit; coverage is
                      incomplete.
                    </p>
                  )}
                  <Tabs
                    key={data.id}
                    value={assessmentTab}
                    onValueChange={setAssessmentTab}
                    className='space-y-4'
                  >
                    <TabsList className='h-auto flex-wrap justify-start'>
                      <TabsTrigger value='checks'>
                        Checks ({data.report.checks.length})
                      </TabsTrigger>
                      <TabsTrigger value='ai'>AI reviews</TabsTrigger>
                      <TabsTrigger value='details'>Details</TabsTrigger>
                    </TabsList>
                    <TabsContent value='checks' className='space-y-4'>
                      <div
                        ref={checksRef}
                        tabIndex={-1}
                        aria-label='Check results'
                        className='space-y-4 rounded-lg focus-visible:outline-2 focus-visible:outline-ring'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <div>
                            <h3 className='text-sm font-semibold'>
                              {checkView === 'attention'
                                ? 'Required checks needing attention'
                                : checkView === 'passing'
                                  ? 'Passing checks'
                                  : checkView === 'optional'
                                    ? 'Optional checks'
                                    : 'All check results'}
                            </h3>
                            <p className='mt-1 text-xs text-muted-foreground'>
                              {checks.length} of {data.report.checks.length}{' '}
                              checks
                            </p>
                          </div>
                          <Select
                            value={checkView}
                            onValueChange={(value) => {
                              setCheckView(value)
                              setCheckPage(1)
                              setExpandedCheck(null)
                              setResultFilter('all')
                            }}
                          >
                            <SelectTrigger
                              aria-label='Checks to show'
                              className='w-full sm:w-60'
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='attention'>
                                Needs attention ({attentionCount})
                              </SelectItem>
                              <SelectItem value='all'>
                                All checks ({data.report.checks.length})
                              </SelectItem>
                              <SelectItem value='passing'>
                                Passing checks
                              </SelectItem>
                              <SelectItem value='optional'>
                                Optional checks
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {resultFilter !== 'all' && (
                          <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
                            <span>
                              Result filter:{' '}
                              {resultFilter === 'passed'
                                ? 'Passed'
                                : resultFilter === 'failed'
                                  ? 'Failed'
                                  : 'Not evaluated'}
                            </span>
                            <Button
                              size='sm'
                              variant='ghost'
                              onClick={() => {
                                setResultFilter('all')
                                setCheckPage(1)
                                setExpandedCheck(null)
                              }}
                            >
                              Clear filter
                            </Button>
                          </div>
                        )}
                        <ul className='divide-y overflow-hidden rounded-lg border'>
                          {visibleChecks.map((check) => {
                            const rule = ruleFor(check)
                            const status = checkReview(rule)
                            const next = checkNextStep(rule)
                            const coverage =
                              check.coverage === 'INVALID'
                                ? {
                                    tone: 'error' as const,
                                    label: 'Invalid evidence',
                                  }
                                : isExecutionVerified(check.evidenceValidation)
                                  ? {
                                      tone: 'success' as const,
                                      label: 'Execution verified',
                                    }
                                  : coverageStatus(check.coverage)
                            return (
                              <li key={check.ruleId} className='text-sm'>
                                <button
                                  type='button'
                                  aria-expanded={expandedCheck === check.ruleId}
                                  aria-controls={`check-evidence-${check.ruleId}`}
                                  onClick={() =>
                                    setExpandedCheck(
                                      expandedCheck === check.ruleId
                                        ? null
                                        : check.ruleId
                                    )
                                  }
                                  className='group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4 text-left hover:bg-muted/30 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1.2fr)_1rem]'
                                >
                                  <span className='min-w-0'>
                                    <span className='block text-sm font-semibold break-words'>
                                      {check.title}
                                    </span>
                                    <span className='mt-0.5 block text-xs text-muted-foreground'>
                                      {check.required ? 'Required' : 'Optional'}
                                    </span>
                                    <span className='mt-1 block text-xs text-muted-foreground'>
                                      Recorded at{' '}
                                      <ResultTimestamp
                                        value={rule?.recordedAt}
                                      />
                                    </span>
                                  </span>
                                  <StatusBadge
                                    tone={status.tone}
                                    className='w-fit'
                                  >
                                    {status.label}
                                  </StatusBadge>
                                  <span className='col-span-2 flex items-center justify-between gap-3 text-xs text-muted-foreground sm:col-span-1 sm:text-sm'>
                                    {rule?.status === 'PASS'
                                      ? 'Requirement satisfied'
                                      : rule?.status === 'BLOCK'
                                        ? reviewReason(
                                            'APPROVED_CI_SOURCE_FAILED'
                                          )
                                        : rule?.reasons.length
                                          ? reviewReason(rule.reasons[0])
                                          : 'No verified result is available.'}
                                    <ChevronDown
                                      aria-hidden='true'
                                      className={`size-4 shrink-0 transition-transform sm:hidden ${expandedCheck === check.ruleId ? 'rotate-180' : ''}`}
                                    />
                                  </span>
                                  <ChevronDown
                                    aria-hidden='true'
                                    className={`hidden size-4 shrink-0 text-muted-foreground transition-transform sm:block ${expandedCheck === check.ruleId ? 'rotate-180' : ''}`}
                                  />
                                </button>
                                {expandedCheck === check.ruleId && (
                                  <div
                                    id={`check-evidence-${check.ruleId}`}
                                    className='space-y-4 border-t bg-muted/10 p-4'
                                  >
                                    <div className='flex flex-wrap items-start gap-3'>
                                      <div className='min-w-0 sm:flex-1'>
                                        <p className='text-xs font-semibold text-muted-foreground'>
                                          Next step
                                        </p>
                                        <p className='mt-1 text-sm'>
                                          {next.text}
                                        </p>
                                      </div>
                                      {next.destination && (
                                        <Button
                                          size='sm'
                                          variant='outline'
                                          asChild
                                        >
                                          <a
                                            href={`/repositories/${encodeURIComponent(repositoryId)}?tab=${next.destination}`}
                                          >
                                            {next.destination === 'activity'
                                              ? 'View CI activity'
                                              : 'Review standards'}
                                          </a>
                                        </Button>
                                      )}
                                    </div>
                                    <div className='space-y-3 border-t pt-4 text-xs break-words'>
                                      <p className='font-semibold text-muted-foreground'>
                                        Saved evidence
                                      </p>
                                      <StatusBadge tone={coverage.tone}>
                                        {coverage.label}
                                      </StatusBadge>
                                      <p>{check.reason}</p>
                                      {!!rule?.reasons.length && (
                                        <ul className='list-disc space-y-1 pl-4'>
                                          {rule.reasons.map((reason) => (
                                            <li key={reason}>
                                              {reviewReason(reason)}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                      {check.deliveryId && (
                                        <p className='text-muted-foreground'>
                                          {sources.get(check.deliveryId) ??
                                            'CI result'}{' '}
                                          ·{' '}
                                          {check.providerResult
                                            ? ciResultStatus[
                                                check.providerResult
                                              ].label
                                            : 'No result'}{' '}
                                          · {sentence(check.freshness)} ·{' '}
                                          {check.mappingTrust ===
                                          'APPROVED_SOURCE_BINDING'
                                            ? 'Approved source'
                                            : 'Manual association'}
                                        </p>
                                      )}
                                      <EvidenceValidationPanel
                                        validation={check.evidenceValidation}
                                      />
                                    </div>
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                        {checks.length === 0 && (
                          <div className='space-y-3 rounded-lg border bg-muted/10 p-5'>
                            <p className='text-sm'>
                              {checkView === 'attention' && evaluated
                                ? 'No required checks need attention in this saved assessment.'
                                : 'No checks match this filter.'}
                            </p>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => {
                                setCheckView('all')
                                setResultFilter('all')
                                setCheckPage(1)
                                setExpandedCheck(null)
                              }}
                            >
                              View all checks
                            </Button>
                          </div>
                        )}
                        {checkPages > 1 && (
                          <nav
                            aria-label='Check results pages'
                            className='flex flex-wrap items-center justify-between gap-3 border-t pt-3'
                          >
                            <span className='text-xs text-muted-foreground'>
                              Page {currentCheckPage} of {checkPages}
                            </span>
                            <div className='flex gap-2'>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={currentCheckPage === 1}
                                onClick={() => {
                                  setCheckPage(currentCheckPage - 1)
                                  setExpandedCheck(null)
                                }}
                              >
                                Previous
                              </Button>
                              <Button
                                size='sm'
                                variant='outline'
                                disabled={currentCheckPage === checkPages}
                                onClick={() => {
                                  setCheckPage(currentCheckPage + 1)
                                  setExpandedCheck(null)
                                }}
                              >
                                Next
                              </Button>
                            </div>
                          </nav>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value='ai'>
                      <SkillReviewPanel
                        key={data.id}
                        repositoryId={repositoryId}
                        assessmentId={data.id}
                        stage={
                          data.request.subjectKind === 'PULL_REQUEST'
                            ? 'pull_request'
                            : 'repository'
                        }
                      />
                    </TabsContent>
                    <TabsContent value='details' className='space-y-4'>
                      <section
                        aria-labelledby='assessment-check-results'
                        className='rounded-lg border text-sm'
                      >
                        <h3
                          id='assessment-check-results'
                          className='px-4 py-3 font-medium'
                        >
                          Check results
                        </h3>
                        <div className='border-t p-4'>
                          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                            <AssessmentResultsChart
                              total={data.report.checks.length}
                              passed={passedChecks}
                              failed={failedChecks}
                              incomplete={notEvaluatedChecks}
                              selected={resultFilter}
                              onSelect={(value) => {
                                setResultFilter(value)
                                setCheckView('all')
                                setCheckPage(1)
                                setExpandedCheck(null)
                                setAssessmentTab('checks')
                              }}
                            />
                            <div className='grid grid-cols-2 gap-3'>
                              <div className='rounded-lg border border-info/20 bg-info/5 p-4'>
                                <p className='text-xs text-muted-foreground'>
                                  Required checks
                                </p>
                                <p className='mt-2 text-2xl font-semibold tabular-nums'>
                                  {data.report.requiredChecks}
                                </p>
                                <p className='mt-1 text-xs text-muted-foreground'>
                                  {data.report.checks.length} checks in this
                                  assessment
                                </p>
                              </div>
                              <div className='rounded-lg border border-success/20 bg-success/5 p-4'>
                                <p className='text-xs text-muted-foreground'>
                                  Passed
                                </p>
                                <p className='mt-2 text-2xl font-semibold tabular-nums'>
                                  {passedChecks}
                                </p>
                                <p className='mt-1 text-xs text-muted-foreground'>
                                  Requirements satisfied
                                </p>
                              </div>
                              <div className='rounded-lg border border-danger/20 bg-danger/5 p-4'>
                                <p className='text-xs text-muted-foreground'>
                                  Failed
                                </p>
                                <p className='mt-2 text-2xl font-semibold tabular-nums'>
                                  {failedChecks}
                                </p>
                                <p className='mt-1 text-xs text-muted-foreground'>
                                  Checks that need fixing
                                </p>
                              </div>
                              <div className='rounded-lg border border-warning/20 bg-warning/5 p-4'>
                                <p className='text-xs text-muted-foreground'>
                                  Not evaluated
                                </p>
                                <p className='mt-2 text-2xl font-semibold tabular-nums'>
                                  {notEvaluatedChecks}
                                </p>
                                <p className='mt-1 text-xs text-muted-foreground'>
                                  Missing or unverified results
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                      <GateEvaluationDetails preview={preview} />
                      <details className='rounded-lg border text-sm'>
                        <summary className='cursor-pointer px-4 py-3 font-medium'>
                          Check execution status
                        </summary>
                        <div className='p-4 pt-0'>
                          <NativeExecutionStatus repositoryId={repositoryId} />
                        </div>
                      </details>
                      <AssessmentContext request={data.request} />
                      <details className='group rounded-md border text-xs'>
                        <summary className='cursor-pointer px-4 py-3 text-sm font-medium'>
                          Source and verification details
                        </summary>
                        <dl className='grid gap-x-4 gap-y-2 border-t px-4 py-3 font-mono break-all sm:grid-cols-[max-content_1fr]'>
                          <dt className='font-sans text-muted-foreground'>
                            Assessment SHA-256
                          </dt>
                          <dd>{data.assessmentHash}</dd>
                          <dt className='font-sans text-muted-foreground'>
                            Selection
                          </dt>
                          <dd>{data.selectionId}</dd>
                          {data.plan.packs.map((pack) => (
                            <div key={pack.id} className='contents'>
                              <dt className='font-sans text-muted-foreground'>
                                {pack.id} v{pack.version}
                              </dt>
                              <dd>{pack.digest}</dd>
                            </div>
                          ))}
                          {data.report.observations.map((item) => (
                            <div key={item.deliveryId} className='contents'>
                              <dt className='font-sans text-muted-foreground'>
                                {sourceLabel(
                                  item.sourceKind,
                                  item.sourceObjectId
                                )}
                              </dt>
                              <dd>
                                Delivery {item.deliveryId}
                                <br />
                                Evidence {item.evidenceHash}
                                <br />
                                Signed payload {item.sourcePayloadHash}
                                {item.artifacts.map((artifact) => (
                                  <span key={artifact.id} className='block'>
                                    {artifact.format.toUpperCase()} report{' '}
                                    {artifact.sha256} ·{' '}
                                    {sentence(artifact.verification)} ·{' '}
                                    {Object.entries(artifact.summary)
                                      .map(
                                        ([key, value]) =>
                                          `${key} ${String(value)}`
                                      )
                                      .join(', ')}
                                  </span>
                                ))}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    </TabsContent>
                  </Tabs>
                </>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
