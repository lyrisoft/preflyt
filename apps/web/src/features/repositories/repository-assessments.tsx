import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ClipboardList,
  GitCommitHorizontal,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { AssessmentContext } from './assessment-context'
import { AssessmentCoverageChart } from './assessment-coverage-chart'
import type { ContextRequest } from './engineering-queries'
import {
  EvidenceValidationPanel,
  type EvidenceValidation,
} from './evidence-validation-panel'
import { GatePreviewPanel } from './gate-preview-panel'
import { NativeExecutionStatus } from './native-execution-status'
import { RelativeTime } from './relative-time'
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
              ? 'This commit has no saved profile or imported CI evidence.'
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
                        {new Date(item.observedAt).toLocaleString()}
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
          {mutation.isPending ? 'Creating…' : 'Create snapshot'}
        </Button>
      </SheetFooter>
    </>
  )
}

export function RepositoryAssessments({
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
  const [inputFilter, setInputFilter] = useState('all')
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
          'Could not load this snapshot. Check your session and repository access.'
        )
      return response.json() as Promise<Assessment>
    },
  })
  const data = detail.data
  const sources = new Map(
    data?.report.observations.map((item) => [
      item.deliveryId,
      sourceLabel(item.sourceKind, item.sourceObjectId),
    ])
  )
  const configFound =
    data?.report.checks.filter((c) => c.coverage === 'CONFIGURATION_OBSERVED')
      .length ?? 0
  const withCi = data?.report.checks.filter((c) => c.deliveryId).length ?? 0
  const coverage = data ? coverageStatus(data.report.coverage) : null
  const configurationOnly =
    data?.report.checks.filter(
      (check) =>
        !check.deliveryId && check.coverage === 'CONFIGURATION_OBSERVED'
    ).length ?? 0
  const noInputs =
    (data?.report.checks.length ?? 0) - withCi - configurationOnly
  const checks =
    data?.report.checks.filter((check) =>
      inputFilter === 'linked'
        ? !!check.deliveryId
        : inputFilter === 'configuration'
          ? !check.deliveryId && check.coverage === 'CONFIGURATION_OBSERVED'
          : inputFilter === 'missing'
            ? !check.deliveryId && check.coverage !== 'CONFIGURATION_OBSERVED'
            : true
    ) ?? []
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle asChild>
          <h2>Commit assessments</h2>
        </CardTitle>
        <CardDescription>
          Standards and CI results saved for a specific commit.
        </CardDescription>
        <CardAction className='flex gap-2'>
          <Button
            size='icon'
            variant='outline'
            className='touch-target size-8'
            aria-label='Reload assessments'
            disabled={history.isFetching}
            onClick={() => {
              void history.refetch()
              if (current) void detail.refetch()
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
                    setInputFilter('all')
                    setCreating(false)
                    void client.invalidateQueries({
                      queryKey: ['assessments', repositoryId],
                    })
                  }}
                />
              </SheetContent>
            </Sheet>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        <NativeExecutionStatus repositoryId={repositoryId} />
        {history.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading assessments…
          </p>
        ) : history.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {history.error.message}
          </p>
        ) : history.data.assessments.length === 0 ? (
          <div className='rounded-lg border bg-muted/15 p-5'>
            <div className='flex items-start gap-3'>
              <span className='rounded-lg border bg-background p-2.5 text-info'>
                <ClipboardList className='size-5' aria-hidden='true' />
              </span>
              <div>
                <p className='text-sm font-semibold'>
                  Create your first assessment
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {canCreate
                    ? 'Save standards, then use New assessment to freeze the evidence at a commit.'
                    : 'An Owner or Admin can freeze the evidence at a commit.'}
                </p>
              </div>
            </div>
            <div className='mt-5 grid gap-3 border-t pt-4 text-xs sm:grid-cols-3'>
              {[
                {
                  icon: Layers,
                  label: 'Adopt standards',
                  detail: 'Choose packs for this repository',
                },
                {
                  icon: GitCommitHorizontal,
                  label: 'Pin a revision',
                  detail: 'Use a full commit SHA',
                },
                {
                  icon: ShieldCheck,
                  label: 'Review evidence',
                  detail: 'Review the saved assessment',
                },
              ].map(({ icon: Icon, label, detail }, index) => (
                <div key={label} className='flex items-center gap-2.5'>
                  <span className='flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'>
                    <Icon className='size-3.5' aria-hidden='true' />
                  </span>
                  <div>
                    <p className='font-medium'>
                      {index + 1}. {label}
                    </p>
                    <p className='mt-0.5 text-muted-foreground'>{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className='rounded-lg border bg-muted/10 p-3'>
              <div className='mb-3 flex items-center justify-between gap-3'>
                <p className='text-xs font-medium text-muted-foreground'>
                  Revision history
                </p>
                <span className='text-xs text-muted-foreground'>
                  {history.data.assessments.length} saved snapshots
                </span>
              </div>
              <div className='flex flex-wrap gap-2'>
                {history.data.assessments.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type='button'
                    aria-pressed={current === item.id}
                    onClick={() => {
                      setSelected(item.id)
                      setInputFilter('all')
                    }}
                    className='flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-info/50 aria-pressed:bg-info/10'
                  >
                    <GitCommitHorizontal
                      className='size-3.5 text-muted-foreground'
                      aria-hidden='true'
                    />
                    <span>
                      <code className='block font-medium'>
                        {item.sourceSha.slice(0, 7)}
                      </code>
                      <span className='text-[10px] text-muted-foreground'>
                        {new Date(item.createdAt).toLocaleDateString(
                          undefined,
                          { month: 'short', day: 'numeric' }
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <Select
                value={current}
                onValueChange={(id) => {
                  setSelected(id)
                  setInputFilter('all')
                }}
              >
                <SelectTrigger
                  aria-label='Assessment snapshot'
                  className='w-full sm:w-80'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {history.data.assessments.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <code className='text-xs'>
                        {item.sourceSha.slice(0, 7)}
                      </code>{' '}
                      · {new Date(item.createdAt).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className='text-xs text-muted-foreground'>
                {history.data.assessments.length} snapshot
                {history.data.assessments.length === 1 ? '' : 's'}
              </span>
            </div>
            {detail.isError ? (
              <p role='alert' className='text-sm text-destructive'>
                {detail.error.message}
              </p>
            ) : detail.isPending ? (
              <p role='status' className='text-sm text-muted-foreground'>
                Loading snapshot…
              </p>
            ) : (
              data &&
              coverage && (
                <>
                  <GatePreviewPanel
                    repositoryId={repositoryId}
                    assessmentId={data.id}
                  />
                  <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                    <AssessmentCoverageChart
                      total={data.report.checks.length}
                      linked={withCi}
                      configuration={configurationOnly}
                      missing={noInputs}
                      selected={inputFilter}
                      onSelect={setInputFilter}
                    />
                    <div className='grid grid-cols-2 gap-3'>
                      <div className='rounded-lg border border-info/20 bg-info/5 p-4'>
                        <p className='text-xs text-muted-foreground'>
                          Required controls
                        </p>
                        <p className='mt-2 text-2xl font-semibold tabular-nums'>
                          {data.report.requiredChecks}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          {data.report.checks.length} controls in this snapshot
                        </p>
                      </div>
                      <div className='rounded-lg border border-chart-2/20 bg-chart-2/5 p-4'>
                        <p className='text-xs text-muted-foreground'>
                          Configuration found
                        </p>
                        <p className='mt-2 text-2xl font-semibold tabular-nums'>
                          {configFound}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Observed repository configuration
                        </p>
                      </div>
                      <div className='rounded-lg border p-4'>
                        <p className='text-xs text-muted-foreground'>
                          Coverage status
                        </p>
                        <div className='mt-3'>
                          <StatusBadge tone={coverage.tone}>
                            {coverage.label}
                          </StatusBadge>
                        </div>
                      </div>
                      <div className='rounded-lg border p-4'>
                        <p className='text-xs text-muted-foreground'>
                          Verified execution
                        </p>
                        <p className='mt-2 text-2xl font-semibold tabular-nums'>
                          {data.report.trustedExecutedChecks}
                        </p>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Quality gate not evaluated
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Commit{' '}
                    <code className='text-foreground' title={data.sourceSha}>
                      {data.sourceSha.slice(0, 12)}
                    </code>{' '}
                    · {sentence(data.plan.adoptionProfile)} profile, revision{' '}
                    {data.request.selectionRevision} · collected{' '}
                    <RelativeTime value={data.report.collectedAt} />
                  </p>
                  <AssessmentContext request={data.request} />
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
                  <div className='overflow-hidden rounded-md border'>
                    <div className='flex items-center justify-between gap-3 border-b bg-muted/15 px-4 py-3'>
                      <p className='text-sm font-medium'>
                        Control evidence{' '}
                        <span className='ml-1 text-xs font-normal text-muted-foreground'>
                          {checks.length} of {data.report.checks.length}
                        </span>
                      </p>
                      {inputFilter !== 'all' && (
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setInputFilter('all')}
                        >
                          Show all
                        </Button>
                      )}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Control</TableHead>
                          <TableHead>Requirement</TableHead>
                          <TableHead>Coverage</TableHead>
                          <TableHead>CI result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {checks.map((check) => {
                          const status =
                            check.coverage === 'INVALID'
                              ? {
                                  tone: 'error' as const,
                                  label: 'Invalid evidence',
                                }
                              : coverageStatus(check.coverage)
                          return (
                            <TableRow key={check.ruleId}>
                              <TableCell className='max-w-md min-w-64 whitespace-normal'>
                                <p className='font-medium'>{check.title}</p>
                                <details className='mt-1.5 text-xs'>
                                  <summary className='cursor-pointer text-muted-foreground hover:text-foreground'>
                                    Review evidence
                                  </summary>
                                  <div className='mt-2 space-y-2'>
                                    <p className='text-muted-foreground'>
                                      {check.reason}
                                    </p>
                                    <EvidenceValidationPanel
                                      validation={check.evidenceValidation}
                                    />
                                  </div>
                                </details>
                              </TableCell>
                              <TableCell>
                                <Badge variant='neutral'>
                                  {check.required ? 'Required' : 'Advisory'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <StatusBadge tone={status.tone}>
                                  {status.label}
                                </StatusBadge>
                              </TableCell>
                              <TableCell className='text-xs'>
                                {check.deliveryId ? (
                                  <>
                                    <p className='font-medium'>
                                      {sources.get(check.deliveryId) ??
                                        'CI result'}
                                    </p>
                                    <p className='text-muted-foreground'>
                                      {check.providerResult
                                        ? ciResultStatus[check.providerResult]
                                            .label
                                        : 'No result'}{' '}
                                      · {sentence(check.freshness)}
                                    </p>
                                    <p className='text-muted-foreground'>
                                      {check.mappingTrust ===
                                      'APPROVED_SOURCE_BINDING'
                                        ? 'Approved source'
                                        : 'Manual association'}
                                    </p>
                                  </>
                                ) : (
                                  <span className='text-muted-foreground'>
                                    None
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {checks.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className='py-6 text-center text-sm text-muted-foreground'
                            >
                              No controls in this input category.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
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
                            {sourceLabel(item.sourceKind, item.sourceObjectId)}
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
                                    ([key, value]) => `${key} ${String(value)}`
                                  )
                                  .join(', ')}
                              </span>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </>
              )
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
