import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
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

type ListItem = { id: string; sourceSha: string; createdAt: string }
type Assessment = ListItem & {
  assessmentHash: string
  selectionId: string
  request: {
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
      providerResult: string | null
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
type Standards = {
  selection: { id: string } | null
  selectionIntegrity: boolean
  controls: { id: string; title: string }[]
}
type Evidence = {
  observations: {
    deliveryId: string
    sourceKind: string
    sourceObjectId: string
    result: string
    observedAt: string
  }[]
}
async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    signal,
  })
  if (!response.ok)
    throw new Error(
      'Could not load assessment inputs. Check your session and repository access.'
    )
  return response.json() as Promise<T>
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
  const standards = useQuery({
    queryKey: ['repository-standards', repositoryId],
    retry: false,
    queryFn: ({ signal }) =>
      read<Standards>(
        `/github/repositories/${encodeURIComponent(repositoryId)}/standards`,
        signal
      ),
  })
  const evidence = useQuery({
    queryKey: ['ci-evidence', repositoryId, sha],
    enabled: valid,
    retry: false,
    queryFn: ({ signal }) =>
      read<Evidence>(
        `/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence?sha=${sha}`,
        signal
      ),
  })
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
  return (
    <details className='rounded-md border p-3'>
      <summary className='cursor-pointer text-sm font-medium'>
        Create commit assessment
      </summary>
      <div className='mt-4 space-y-4'>
        <label className='block space-y-2 text-sm'>
          <span>Exact commit SHA</span>
          <Input
            value={sha}
            maxLength={40}
            placeholder='Full 40-character SHA'
            disabled={mutation.isPending}
            onChange={(event) => {
              setSha(event.target.value.trim().toLowerCase())
              setMappings({})
              key.current = crypto.randomUUID()
            }}
          />
        </label>
        <p className='text-sm text-muted-foreground'>
          Associations are administrative claims, not verified check coverage.
          Provider success cannot produce Preflyt PASS.
        </p>
        {standards.isError ? (
          <p role='alert'>{standards.error.message}</p>
        ) : !standards.data?.selection ? (
          <p className='text-sm'>Save a standards selection first.</p>
        ) : !standards.data.selectionIntegrity ? (
          <p role='alert'>
            Review the saved pack versions and digests before creating an
            assessment.
          </p>
        ) : (
          <>
            {evidence.isError && <p role='alert'>{evidence.error.message}</p>}
            <div className='space-y-3'>
              {standards.data.controls.map((rule) => (
                <label key={rule.id} className='block space-y-2 text-sm'>
                  <span>{rule.title}</span>
                  <Select
                    value={mappings[rule.id] ?? 'none'}
                    disabled={
                      !valid || evidence.isFetching || mutation.isPending
                    }
                    onValueChange={(value) => {
                      setMappings((old) => ({ ...old, [rule.id]: value }))
                      key.current = crypto.randomUUID()
                    }}
                  >
                    <SelectTrigger
                      aria-label={`CI observation for ${rule.title}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='none'>No association</SelectItem>
                      {evidence.data?.observations.map((item) => (
                        <SelectItem
                          key={item.deliveryId}
                          value={item.deliveryId}
                        >
                          {item.sourceKind} #{item.sourceObjectId} ·{' '}
                          {item.result} ·{' '}
                          {new Date(item.observedAt).toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ))}
            </div>
            <Button
              disabled={
                !valid ||
                mutation.isPending ||
                evidence.isFetching ||
                evidence.isError
              }
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Creating…' : 'Create assessment snapshot'}
            </Button>
          </>
        )}
        {mutation.error && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
    </details>
  )
}
export function RepositoryAssessments({
  repositoryId,
  canCreate,
  initialSha,
}: {
  repositoryId: string
  canCreate: boolean
  initialSha: string
}) {
  const client = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const history = useQuery({
    queryKey: ['assessments', repositoryId],
    retry: false,
    queryFn: ({ signal }) =>
      read<{ assessments: ListItem[] }>(
        `/github/repositories/${encodeURIComponent(repositoryId)}/assessments`,
        signal
      ),
  })
  const current = selected ?? history.data?.assessments[0]?.id
  const detail = useQuery({
    queryKey: ['assessment', repositoryId, current],
    retry: false,
    enabled: !!current && !history.isError,
    queryFn: ({ signal }) =>
      read<Assessment>(
        `/github/repositories/${encodeURIComponent(repositoryId)}/assessments/${current}`,
        signal
      ),
  })
  const data = detail.data
  return (
    <Card className='mb-6'>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
        <div>
          <CardTitle>Commit assessments</CardTitle>
          <CardDescription className='mt-2'>
            Frozen plans and imported evidence at exact revisions. Quality gates
            are not evaluated.
          </CardDescription>
        </div>
        <Button
          size='sm'
          variant='outline'
          disabled={history.isFetching}
          onClick={() => {
            void history.refetch()
            if (current) void detail.refetch()
          }}
        >
          Reload assessments
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {canCreate && !history.isError && (
          <AssessmentCreator
            key={initialSha}
            repositoryId={repositoryId}
            initialSha={initialSha}
            onCreated={(id) => {
              setSelected(id)
              void client.invalidateQueries({
                queryKey: ['assessments', repositoryId],
              })
            }}
          />
        )}
        {history.isPending ? (
          <p role='status'>Loading assessments…</p>
        ) : history.isError ? (
          <p role='alert' className='text-destructive'>
            {history.error.message}
          </p>
        ) : history.data.assessments.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            No assessment snapshots yet.
          </p>
        ) : (
          <>
            <Select value={current} onValueChange={setSelected}>
              <SelectTrigger aria-label='Assessment snapshot'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {history.data.assessments.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.sourceSha.slice(0, 12)} ·{' '}
                    {new Date(item.createdAt).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {detail.isError ? (
              <p role='alert' className='text-destructive'>
                {detail.error.message}
              </p>
            ) : detail.isPending ? (
              <p role='status'>Loading snapshot…</p>
            ) : (
              data && (
                <>
                  <div className='space-y-1 text-sm'>
                    <p className='break-all'>Commit: {data.sourceSha}</p>
                    <p>
                      Selection revision {data.request.selectionRevision} ·{' '}
                      {data.plan.adoptionProfile.toLowerCase()} ·{' '}
                      {data.report.coverage.replace(/_/g, ' ').toLowerCase()}{' '}
                      coverage
                    </p>
                    <p className='text-muted-foreground'>
                      {data.report.requiredChecks} required controls ·{' '}
                      {data.report.trustedExecutedChecks} trusted executed
                      checks. Historical snapshot; current branch readiness is
                      not verified.
                    </p>
                    <p className='text-muted-foreground'>
                      Collected{' '}
                      {new Date(data.report.collectedAt).toLocaleString()}.
                      Freshness below is recorded at collection, not a live
                      readiness claim.
                    </p>
                    {data.report.collectionTruncated && (
                      <p role='alert'>
                        CI collection reached its 100-observation limit;
                        coverage is incomplete.
                      </p>
                    )}
                  </div>
                  <div className='space-y-3'>
                    {data.report.checks.map((check) => (
                      <div
                        key={check.ruleId}
                        className='rounded-md border p-3 text-sm'
                      >
                        <div className='flex flex-wrap items-center gap-2'>
                          <span>{check.title}</span>
                          <Badge variant='secondary'>
                            {check.required ? 'Required' : 'Advisory'}
                          </Badge>
                          <Badge variant='outline'>
                            {check.coverage.replace(/_/g, ' ').toLowerCase()}
                          </Badge>
                        </div>
                        <p className='mt-2 text-xs text-muted-foreground'>
                          {check.reason}
                        </p>
                        {check.deliveryId && (
                          <p className='mt-1 text-xs break-all'>
                            Associated delivery {check.deliveryId} · provider{' '}
                            {check.providerResult?.toLowerCase()} ·{' '}
                            {check.freshness.replace(/_/g, ' ').toLowerCase()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <details className='rounded-md border p-3 text-xs'>
                    <summary className='cursor-pointer'>
                      Frozen provenance and integrity
                    </summary>
                    <div className='mt-3 space-y-2 break-all'>
                      <p>Assessment SHA-256: {data.assessmentHash}</p>
                      <p>Selection: {data.selectionId}</p>
                      {data.plan.packs.map((pack) => (
                        <p key={pack.id}>
                          {pack.id} v{pack.version} · {pack.digest}
                        </p>
                      ))}
                      {data.report.observations.map((item) => (
                        <div
                          key={item.deliveryId}
                          className='space-y-1 border-t pt-2'
                        >
                          <p>
                            {item.sourceKind} #{item.sourceObjectId} ·{' '}
                            {item.result}
                          </p>
                          <p>Delivery: {item.deliveryId}</p>
                          <p>Evidence: {item.evidenceHash}</p>
                          <p>Signed payload: {item.sourcePayloadHash}</p>
                          {item.artifacts.map((artifact) => (
                            <p key={artifact.id}>
                              {artifact.format} · {artifact.sha256} ·{' '}
                              {artifact.verification.toLowerCase()} ·{' '}
                              {JSON.stringify(artifact.summary)}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
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
