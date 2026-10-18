import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Download,
  FileCode2,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { statusTones } from '@/lib/status-tones'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { governanceRequest } from './governance-api'
import { WorkflowRequestError } from './workflow-request-error'
import { WorkflowSnippet } from './workflow-snippet'
import { YamlWorkflowEditor } from './yaml-workflow-editor'

type Setup = {
  apiUrl: string | null
  branch: string
  enabled: boolean
  available: boolean
  ai: { available: boolean; model: string | null; reason: string | null }
  write: { available: boolean; reason: string | null }
  setupPr: { url: string; number: number; branch: string; path: string } | null
  checks: { id: string; title: string; required: boolean }[]
  submissions: {
    id: string
    state: string
    assessmentId: string | null
    failureCode: string | null
    commentUrl: string | null
    createdAt: string
  }[]
}
type Source = {
  workflow: string
  original: string
  path: string
  baseSha: string
  branch: string
  exists: boolean
  notes: string[]
  setupSources: string[]
}
type Proposal = {
  workflow: string
  summary: string
  model: string
  original: string
  notes?: string[]
  setupSources?: string[]
  skill?: { name: string; version: number }
}
type SetupPr = NonNullable<Setup['setupPr']>
const runLabel = (state: string) =>
  state === 'COMPLETE'
    ? 'Completed'
    : state === 'PROCESSING'
      ? 'Running'
      : state === 'FAILED'
        ? 'Failed'
        : state === 'STALE'
          ? 'Stale'
          : 'Pending'

export function PipelineWorkflowSetup(props: {
  repositoryId: string
  policyId: string
  canManage: boolean
}) {
  return (
    <StandaloneWorkflowSetup
      key={`${props.repositoryId}:${props.policyId}`}
      {...props}
    />
  )
}
function StandaloneWorkflowSetup({
  repositoryId,
  policyId,
  canManage,
}: {
  repositoryId: string
  policyId: string
  canManage: boolean
}) {
  const session = useNavigationSession()
  const client = useQueryClient()
  const base = `/github/repositories/${repositoryId}/pipeline-setup`
  const key = [
    'pipeline-setup',
    session.data?.identityId,
    session.data?.organizationId,
    repositoryId,
    policyId,
  ]
  const refresh = useRef(false)
  const refreshSource = useRef(false)
  const [draft, setDraft] = useState<{
    workflow: string
    baseSha: string
  } | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [view, setView] = useState<'edit' | 'review'>('edit')
  const [instructions, setInstructions] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [pr, setPr] = useState<SetupPr | null>(null)
  const [editorSection, setEditorSection] = useState<HTMLDivElement | null>(
    null
  )
  // Refresh controls do not identify data; repository, policy and identity do.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useQuery({
    queryKey: key,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      const force = refresh.current
      refresh.current = false
      return governanceRequest<Setup>(
        `${base}?policy=${encodeURIComponent(policyId)}${force ? '&refresh=true' : ''}`,
        undefined,
        signal
      )
    },
  })
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const source = useQuery({
    queryKey: [...key, 'standalone'],
    enabled: !!query.data,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: ({ signal }) => {
      const force = refreshSource.current
      refreshSource.current = false
      return governanceRequest<Source>(
        `${base}/standalone?policy=${encodeURIComponent(policyId)}${force ? '&refresh=true' : ''}`,
        undefined,
        signal
      )
    },
  })
  const data = query.data
  const yaml = draft?.workflow ?? source.data?.workflow ?? ''
  const baseSha = draft?.baseSha ?? source.data?.baseSha ?? ''
  const changed = !!draft && draft.workflow !== source.data?.workflow
  const stale = !!draft && draft.baseSha !== source.data?.baseSha
  const body = () => ({ policyId, workflow: yaml, baseSha })
  const createPr = useMutation({
    mutationFn: () => {
      const id = requestId ?? crypto.randomUUID()
      setRequestId(id)
      return governanceRequest<SetupPr>(`${base}/standalone/pull-request`, {
        ...body(),
        requestId: id,
      })
    },
    meta: { successMessage: 'Setup PR created for review' },
    onSuccess: (result) => {
      setPr(result)
      void client.invalidateQueries({ queryKey: key, exact: true })
    },
  })
  const download = useMutation({
    mutationFn: async () => {
      const result = await governanceRequest<{
        archive: string
        filename: string
      }>(`${base}/standalone/package`, body())
      const bytes = Uint8Array.from(atob(result.archive), (value) =>
        value.charCodeAt(0)
      )
      const url = URL.createObjectURL(new Blob([bytes]))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = result.filename
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    meta: { successMessage: 'PR workflow downloaded' },
  })
  const rewrite = useMutation({
    mutationFn: () =>
      governanceRequest<Omit<Proposal, 'original'>>(
        `${base}/standalone/generate`,
        { ...body(), instructions, requestId: crypto.randomUUID() }
      ),
    meta: { successMessage: 'AI draft ready to review' },
    onSuccess: (result) => {
      setProposal({ ...result, original: yaml })
      setView('review')
      setReviewed(false)
    },
  })
  const busy = createPr.isPending || download.isPending || rewrite.isPending
  const changeYaml = (workflow: string) => {
    setDraft({ workflow, baseSha })
    setReviewed(false)
    setRequestId(null)
    setProposal(null)
    setPr(null)
    createPr.reset()
    download.reset()
    rewrite.reset()
  }
  const reload = () => {
    refresh.current = true
    refreshSource.current = true
    setReviewed(false)
    void query.refetch()
    void source.refetch()
  }
  if (query.isPending)
    return (
      <Card>
        <CardContent className='space-y-3 pt-4'>
          <Skeleton className='h-5 w-48' />
          <Skeleton className='h-80 w-full' />
        </CardContent>
      </Card>
    )
  if (query.isError || !data)
    return (
      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 pt-4'>
          <WorkflowRequestError
            error={query.error}
            retry={() => void query.refetch()}
          />
        </CardContent>
      </Card>
    )
  const setupPr = pr ?? data.setupPr
  const aiAllowed =
    canManage &&
    canPerform(session.data, 'ai.review.run', repositoryId) &&
    data.ai.available
  const hasSource = !!source.data && !source.isError
  const blocked = busy || !canManage || !hasSource || stale || !data.apiUrl
  return (
    <Card className='overflow-hidden'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={Workflow} tone='teal' />
            <div>
              <CardTitle>Pull request workflow</CardTitle>
              <CardDescription>
                Create a complete Preflyt workflow for PRs targeting the
                selected policy branch.
              </CardDescription>
            </div>
          </div>
          <Button
            size='icon'
            variant='ghost'
            aria-label='Refresh workflow setup'
            disabled={busy || query.isFetching || source.isFetching}
            onClick={reload}
          >
            <RefreshCw
              className={
                query.isFetching || source.isFetching ? 'animate-spin' : ''
              }
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid gap-3 rounded-lg border p-3 text-sm sm:grid-cols-2'>
          <div>
            <p className='font-medium'>Target branch</p>
            <p className='mt-1 font-mono text-xs break-all'>
              {data.branch.replace(/^refs\/heads\//, '')}
            </p>
          </div>
          <div>
            <p className='font-medium'>Workflow file</p>
            <p className='mt-1 font-mono text-xs break-all'>
              .github/workflows/preflyt.yml
            </p>
          </div>
        </div>
        <p className='text-xs text-muted-foreground'>
          Choose a different branch policy above to change the target branch.
          The setup PR adds this standalone workflow to that branch. It runs
          when PRs are opened, updated, reopened or marked ready for review.
          Draft PRs and PRs from forks are skipped.
        </p>
        {!data.apiUrl && (
          <p role='alert' className='text-sm text-destructive'>
            A deployment administrator must configure the public HTTPS Preflyt
            API URL in Settings → Configuration.
          </p>
        )}
        {!data.available && (
          <p role='alert' className='text-sm text-destructive'>
            Automatic PR check publication is disabled in this deployment.
            Enable it before installing this workflow.
          </p>
        )}
        {!canManage && (
          <p className='text-sm text-muted-foreground'>
            You can view the workflow. Creating a setup PR requires permission
            to draft and publish policies for this repository.
          </p>
        )}
        {setupPr && (
          <div className='space-y-2 rounded-lg border p-3 text-sm'>
            <a
              href={setupPr.url}
              target='_blank'
              rel='noreferrer'
              className='inline-flex items-center gap-1 font-medium underline'
            >
              Open setup PR #{setupPr.number}
              <ArrowUpRight className='size-3.5' />
            </a>
            <p className='text-xs text-muted-foreground'>
              A setup PR has been proposed. Merge it in GitHub, then open or
              update a PR targeting this branch. Installation is confirmed by a
              verified run below.
            </p>
          </div>
        )}
        {source.isPending ? (
          <Skeleton className='h-96 w-full' />
        ) : source.isError ? (
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
            <WorkflowRequestError
              error={source.error}
              label='Reload branch setup'
              retry={() => {
                refreshSource.current = true
                void source.refetch()
              }}
            />
          </div>
        ) : (
          source.data && (
            <>
              <WorkflowSnippet
                setup={{
                  snippet: yaml,
                  notes: [],
                  ready: !!data.apiUrl,
                  checkIds: data.checks.map((c) => c.id),
                  execution: 'policy',
                  complete: true,
                }}
                title='Preflyt pull request workflow'
              />
              {!!source.data.notes.length && (
                <section
                  className='space-y-2 rounded-lg border p-3'
                  aria-label='Setup to review'
                >
                  <h4 className='text-sm font-medium'>Review project setup</h4>
                  <ul className='list-disc space-y-1 pl-4 text-xs text-muted-foreground'>
                    {source.data.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              )}
              {stale && (
                <p role='alert' className='text-sm text-destructive'>
                  The target branch changed. Your draft is preserved. Copy any
                  edits you need, then load the current generated workflow
                  before creating a PR.
                </p>
              )}
              {(changed || stale) && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => {
                    setDraft(null)
                    setProposal(null)
                    setReviewed(false)
                    setRequestId(null)
                    createPr.reset()
                  }}
                >
                  Load generated workflow
                </Button>
              )}
              <div
                ref={setEditorSection}
                className='pipeline-workflow-editor overflow-hidden rounded-xl border'
              >
                <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2'>
                  <div className='flex min-w-0 items-center gap-2 text-xs'>
                    <FileCode2 className='size-4 shrink-0' />
                    <span className='truncate font-mono'>
                      {source.data.path}
                    </span>
                  </div>
                  <div className='flex flex-wrap gap-1'>
                    <Button
                      size='sm'
                      variant={view === 'edit' ? 'secondary' : 'ghost'}
                      onClick={() => setView('edit')}
                    >
                      Edit YAML
                    </Button>
                    <Button
                      size='sm'
                      variant={view === 'review' ? 'secondary' : 'ghost'}
                      onClick={() => setView('review')}
                    >
                      Review changes
                    </Button>
                  </div>
                </div>
                {proposal && (
                  <div className='space-y-2 border-b p-3 text-sm'>
                    <p className='font-medium'>AI proposal</p>
                    <p>{proposal.summary}</p>
                    {proposal.skill && (
                      <p className='text-xs text-muted-foreground'>
                        {proposal.skill.name} · version {proposal.skill.version}
                      </p>
                    )}
                    {!!proposal.setupSources?.length && (
                      <p className='text-xs'>
                        Setup from: {proposal.setupSources.join(', ')}
                      </p>
                    )}
                    {!!proposal.notes?.length && (
                      <ul className='list-disc pl-4 text-xs text-muted-foreground'>
                        {proposal.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    )}
                    <div className='flex gap-2'>
                      <Button
                        size='sm'
                        disabled={busy || yaml !== proposal.original}
                        onClick={() => {
                          const workflow = proposal.workflow
                          changeYaml(workflow)
                          setView('review')
                        }}
                      >
                        Use this draft
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setProposal(null)}
                      >
                        Discard proposal
                      </Button>
                    </div>
                  </div>
                )}
                {view === 'review' ? (
                  <div className='grid min-w-0 gap-px bg-border xl:grid-cols-2'>
                    <div className='min-w-0 bg-background'>
                      <p className='border-b px-3 py-2 text-xs font-medium'>
                        {proposal
                          ? 'Current draft'
                          : source.data.exists
                            ? 'Existing Preflyt workflow'
                            : 'New file — no existing workflow'}
                      </p>
                      <YamlWorkflowEditor
                        value={
                          proposal ? proposal.original : source.data.original
                        }
                        readOnly
                        label='Existing workflow'
                        fullscreenTarget={editorSection}
                      />
                    </div>
                    <div className='min-w-0 bg-background'>
                      <p className='border-b px-3 py-2 text-xs font-medium'>
                        Proposed workflow
                      </p>
                      <YamlWorkflowEditor
                        value={proposal?.workflow ?? yaml}
                        readOnly
                        label='Proposed standalone workflow'
                        fullscreenTarget={editorSection}
                      />
                    </div>
                  </div>
                ) : (
                  <YamlWorkflowEditor
                    value={yaml}
                    onChange={changeYaml}
                    readOnly={!canManage || busy}
                    label='Standalone PR workflow YAML'
                    fullscreenTarget={editorSection}
                  />
                )}
              </div>
              {canManage &&
                canPerform(session.data, 'ai.review.run', repositoryId) && (
                  <section
                    className='space-y-3 rounded-lg border p-3'
                    aria-label='AI workflow generation'
                  >
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <div>
                        <h4 className='text-sm font-medium'>
                          Generate workflow with AI
                        </h4>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Preflyt CI setup uses detected packages and existing
                          CI setup at this commit. Review the draft before using
                          it.
                        </p>
                      </div>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={blocked || !aiAllowed}
                        onClick={() => rewrite.mutate()}
                      >
                        {rewrite.isPending ? (
                          <Loader2 className='animate-spin' />
                        ) : (
                          <Sparkles />
                        )}
                        {rewrite.isPending
                          ? 'Generating workflow…'
                          : 'Generate workflow with AI'}
                      </Button>
                    </div>
                    {!data.ai.available && (
                      <p
                        role='status'
                        className='text-xs text-muted-foreground'
                      >
                        {data.ai.reason} Configure the Repository model and
                        source sharing in Model Router. You can still edit the
                        YAML manually.
                      </p>
                    )}
                    {data.ai.available && (
                      <p className='text-xs text-muted-foreground'>
                        Model: {data.ai.model}. Repository setup is shared with
                        this model under your source-sharing settings.
                      </p>
                    )}
                    <details>
                      <summary className='cursor-pointer text-xs font-medium'>
                        Optional setup instructions
                      </summary>
                      <label
                        htmlFor='standalone-workflow-instructions'
                        className='mt-2 block text-xs'
                      >
                        What should the setup consider?
                      </label>
                      <Textarea
                        id='standalone-workflow-instructions'
                        value={instructions}
                        maxLength={2000}
                        disabled={busy}
                        onChange={(event) =>
                          setInstructions(event.target.value)
                        }
                        placeholder='For example, use the API test setup rather than the frontend setup.'
                      />
                    </details>
                  </section>
                )}
              {(createPr.isError || download.isError || rewrite.isError) && (
                <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                  <WorkflowRequestError
                    error={createPr.error ?? download.error ?? rewrite.error}
                    retry={() => {
                      if (createPr.isError) createPr.mutate()
                      else if (download.isError) download.mutate()
                      else rewrite.mutate()
                    }}
                  />
                </div>
              )}
              <section className='space-y-3 rounded-lg border p-3'>
                <h4 className='text-sm font-medium'>Review setup PR</h4>
                <p className='text-xs text-muted-foreground'>
                  Includes the workflow above with project setup, policy checks
                  and a final gate. Each run reads the published policy. Missing
                  setup or evidence cannot pass. Merge protection requires
                  separate activation.
                </p>
                <div className='flex items-start gap-2'>
                  <Checkbox
                    id='review-standalone-workflow'
                    checked={reviewed}
                    disabled={blocked || !!proposal}
                    onCheckedChange={(value) => setReviewed(value === true)}
                  />
                  <label
                    htmlFor='review-standalone-workflow'
                    className='text-sm leading-5'
                  >
                    I reviewed the YAML, project setup and target branch.
                    Creating this PR enables Preflyt PR check publication for
                    this repository.
                  </label>
                </div>
                {!data.write.available && (
                  <p className='text-xs text-muted-foreground'>
                    {data.write.reason} You can download the workflow and open a
                    PR manually.
                  </p>
                )}
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={blocked || !reviewed || !!proposal}
                    onClick={() => download.mutate()}
                  >
                    <Download />
                    Download workflow
                  </Button>
                  <Button
                    size='sm'
                    disabled={
                      blocked ||
                      !reviewed ||
                      !data.write.available ||
                      !data.available ||
                      !!proposal
                    }
                    onClick={() => createPr.mutate()}
                  >
                    {createPr.isPending ? (
                      <Loader2 className='animate-spin' />
                    ) : (
                      <GitPullRequest />
                    )}
                    {source.data.exists
                      ? 'Create update PR'
                      : 'Create setup PR'}
                  </Button>
                </div>
              </section>
            </>
          )
        )}
        <Link
          to='/organization-settings'
          search={{ tab: 'pr-checks' }}
          className='inline-block text-xs underline'
        >
          PR feedback settings
        </Link>
        {!!data.submissions.length && (
          <section className='space-y-2 border-t pt-3'>
            <h4 className='text-sm font-medium'>Recent policy runs</h4>
            {data.submissions.map((row) => (
              <div
                key={row.id}
                className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs'
              >
                <div className='flex flex-wrap items-center gap-2'>
                  <StatusBadge
                    tone={statusTones[runLabel(row.state).toLowerCase()]!}
                  >
                    {runLabel(row.state)}
                  </StatusBadge>
                  <ResultTimestamp value={row.createdAt} />
                  {row.failureCode && (
                    <span className='break-all text-muted-foreground'>
                      {row.failureCode}
                    </span>
                  )}
                </div>
                {row.assessmentId && (
                  <Link
                    to='/assessments'
                    search={{
                      repository: repositoryId,
                      assessment: row.assessmentId,
                    }}
                    className='underline'
                  >
                    View assessment
                  </Link>
                )}
                {row.commentUrl && (
                  <a
                    href={row.commentUrl}
                    target='_blank'
                    rel='noreferrer'
                    className='underline'
                  >
                    View PR summary
                  </a>
                )}
              </div>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
