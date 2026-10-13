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
  Search,
  Sparkles,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { governanceRequest } from './governance-api'
import { WorkflowSnippet, type WorkflowSnippetData } from './workflow-snippet'
import { YamlWorkflowEditor } from './yaml-workflow-editor'

type CheckRule = {
  id: string
  title: string
  required: boolean
  format: 'sarif' | 'junit' | null
}
type Inspection = {
  jobs: { id: string; name: string }[]
  checkIds: string[]
  policyRunner?: boolean
  warnings: string[]
}
type Setup = {
  apiUrl: string | null
  workflowSetup: WorkflowSnippetData
  workflows: { id: string; name: string; path: string }[]
  truncated: boolean
  branch: string
  selectionId: string
  bindingId: string | null
  connectedWorkflowIds: string[]
  enabled: boolean
  comments: boolean
  automationRevision: number
  available: boolean
  proofConfigured: boolean
  ai: {
    available: boolean
    model: string | null
    reason: string | null
    skill?: { id: string; name: string; version: number }
  }
  write: { available: boolean; reason: string | null }
  setupPr: { url: string; number: number; workflowId: string } | null
  checks: CheckRule[]
  submissions: {
    id: string
    state: string
    assessmentId: string | null
    failureCode: string | null
    commentUrl: string | null
    createdAt: string
  }[]
}
type Source = Inspection & {
  workflow: string
  path: string
  baseSha: string
  branch: string
}
type Draft = Inspection & {
  workflow: string
  baseSha?: string
  original?: string
}
type Proposal = Draft & { summary: string; model: string; original: string }
function downloadArchive(result: { archive: string; filename: string }) {
  const bytes = Uint8Array.from(atob(result.archive), (value) =>
    value.charCodeAt(0)
  )
  const url = URL.createObjectURL(new Blob([bytes]))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = result.filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function PipelineWorkflowSetup({
  repositoryId,
  policyId,
  canManage,
}: {
  repositoryId: string
  policyId: string
  canManage: boolean
}) {
  const session = useNavigationSession(),
    client = useQueryClient()
  const base = `/github/repositories/${repositoryId}/pipeline-setup`
  const key = [
    'pipeline-setup',
    session.data?.identityId,
    session.data?.organizationId,
    repositoryId,
    policyId,
  ]
  const refreshSetup = useRef(false)
  const refreshSource = useRef(false)
  const [workflowId, setWorkflowId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [jobId, setJobId] = useState('')
  const [search, setSearch] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [instructions, setInstructions] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [view, setView] = useState<'edit' | 'review'>('edit')
  const [editorSection, setEditorSection] = useState<HTMLDivElement | null>(
    null
  )
  const [prRequest, setPrRequest] = useState<string | null>(null)
  const [pr, setPr] = useState<{
    url: string
    number: number
    connectionSaved: boolean
    connectionError: string | null
  } | null>(null)
  // Forced-refresh refs do not identify data; the key already scopes repository and policy.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) => {
      const refresh = refreshSetup.current
      refreshSetup.current = false
      return governanceRequest<Setup>(
        `${base}?policy=${encodeURIComponent(policyId)}${refresh ? '&refresh=true' : ''}`,
        undefined,
        signal
      )
    },
  })
  const data = query.data
  const apiUrl = data?.apiUrl ?? ''
  const selected = workflowId ?? data?.connectedWorkflowIds[0] ?? ''
  // Keep forced-refresh state out of the repository/workflow cache key.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const source = useQuery({
    queryKey: [...key, 'workflow', selected],
    enabled: !!selected && editorOpen,
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      const refresh = refreshSource.current
      refreshSource.current = false
      return governanceRequest<Source>(
        `${base}/workflow?policy=${encodeURIComponent(policyId)}&workflow=${encodeURIComponent(selected)}${refresh ? '&refresh=true' : ''}`,
        undefined,
        signal
      )
    },
  })
  const draft = drafts[selected],
    yaml = draft?.workflow ?? source.data?.workflow ?? ''
  const inspection = draft ?? source.data
  const targetJob = inspection?.jobs.some((job) => job.id === jobId)
    ? jobId
    : (inspection?.jobs[0]?.id ?? '')
  const connectionBody = () => ({
    policyId,
    workflowId: selected,
    selectionId: data!.selectionId,
    bindingId: data!.bindingId,
    automationRevision: data!.automationRevision,
    comments: data!.comments,
    enable: data!.enabled,
  })
  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: key, exact: true })
    await client.invalidateQueries({ queryKey: ['ci-bindings'] })
  }
  const connect = useMutation({
    mutationFn: () => governanceRequest(base, connectionBody()),
    meta: { successMessage: 'Workflow connection saved' },
    onSuccess: invalidate,
  })
  const add = useMutation({
    mutationFn: () =>
      governanceRequest<Draft>(`${base}/draft`, {
        policyId,
        workflowId: selected,
        workflow: yaml,
        jobId: targetJob,
        apiUrl,
      }),
    meta: { successMessage: 'Policy runner installed in the YAML draft' },
    onSuccess: (result) => {
      setDrafts((previous) => ({
        ...previous,
        [selected]: {
          ...result,
          baseSha: draft?.baseSha ?? source.data?.baseSha,
          original: draft?.original ?? source.data?.workflow,
        },
      }))
      setPrRequest(null)
      setView('edit')
      setProposal(null)
    },
  })
  const rewrite = useMutation({
    mutationFn: () =>
      governanceRequest<Omit<Proposal, 'original'>>(`${base}/rewrite`, {
        policyId,
        workflowId: selected,
        workflow: yaml,
        instructions,
        apiUrl,
        requestId: crypto.randomUUID(),
      }),
    meta: { successMessage: 'AI draft ready to review' },
    onSuccess: (result) => {
      setProposal({
        ...result,
        original: yaml,
        baseSha: draft?.baseSha ?? source.data?.baseSha,
      })
      setView('review')
    },
  })
  const createPr = useMutation({
    mutationFn: async () => {
      const requestId = prRequest ?? crypto.randomUUID()
      setPrRequest(requestId)
      return governanceRequest<NonNullable<typeof pr>>(`${base}/pull-request`, {
        ...connectionBody(),
        workflow: yaml,
        baseSha: draft?.baseSha ?? source.data!.baseSha,
        requestId,
      })
    },
    meta: { successMessage: 'Setup PR created for review' },
    onSuccess: async (result) => {
      setPr(result)
      await invalidate()
    },
  })
  const files = useMutation({
    mutationFn: async () => {
      downloadArchive(
        await governanceRequest<{ archive: string; filename: string }>(
          `${base}/package`,
          { policyId, workflowId: selected, workflow: yaml }
        )
      )
    },
    meta: { successMessage: 'Workflow files downloaded' },
  })
  const installFiles = useMutation({
    mutationFn: async () =>
      downloadArchive(
        await governanceRequest<{ archive: string; filename: string }>(
          `${base}/files?policy=${encodeURIComponent(policyId)}&workflow=${encodeURIComponent(selected)}`
        )
      ),
    meta: { successMessage: 'Chained workflow downloaded' },
  })
  const busy =
    installFiles.isPending ||
    add.isPending ||
    rewrite.isPending ||
    createPr.isPending ||
    files.isPending ||
    connect.isPending
  const changeYaml = (workflow: string) => {
    setDrafts((previous) => ({
      ...previous,
      [selected]: {
        workflow,
        baseSha: draft?.baseSha ?? source.data?.baseSha,
        original: draft?.original ?? source.data?.workflow,
        jobs: inspection?.jobs ?? [],
        checkIds: [],
        warnings: [],
      },
    }))
    setPrRequest(null)
    createPr.reset()
    add.reset()
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
        <CardContent className='flex items-center justify-between gap-3 pt-4'>
          <p role='alert' className='text-sm'>
            {query.error?.message ?? 'Workflow setup is unavailable'}
          </p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void query.refetch()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  const checks = data.checks.filter(
    (check) =>
      check.format && check.title.toLowerCase().includes(search.toLowerCase())
  )
  const aiAllowed =
    canManage &&
    canPerform(session.data, 'ai.review.run', repositoryId) &&
    data.ai.available
  const reviewOriginal =
    proposal?.original ?? draft?.original ?? source.data?.workflow ?? ''
  const reviewYaml = proposal?.workflow ?? yaml
  return (
    <Card className='overflow-hidden'>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={Workflow} tone='teal' />
            <div>
              <CardTitle>GitHub workflow</CardTitle>
              <CardDescription>
                Install the policy runner once. Publish policy changes in
                Preflyt; your next workflow run uses them automatically.
              </CardDescription>
            </div>
          </div>
          <Button
            variant='ghost'
            size='icon'
            aria-label='Refresh workflow connection'
            disabled={busy || query.isFetching || source.isFetching}
            onClick={() => {
              refreshSetup.current = true
              refreshSource.current = true
              void query.refetch()
              if (selected && editorOpen) void source.refetch()
            }}
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
        <WorkflowSnippet
          setup={data.workflowSetup}
          title='Policy workflow snippet'
        />
        {data.workflowSetup.checkIds.length > 0 && (
          <>
            <p className='max-w-2xl text-xs text-muted-foreground'>
              Add the checks and final gate to the same PR workflow. Install
              dependencies before the policy step. The gate waits for completed
              checks, configured AI reviews and PR publication. Create setup PR
              keeps your existing jobs and adds the final dependency chain.
            </p>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                disabled={busy || !canManage || !selected}
                onClick={() => installFiles.mutate()}
              >
                <Download />
                Download chained workflow
              </Button>
              <Link
                to='/organization-settings'
                search={{ tab: 'pr-checks' }}
                className='text-xs underline'
              >
                PR feedback settings
              </Link>
            </div>
          </>
        )}
        {installFiles.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {installFiles.error?.message}
          </p>
        )}
        {!data.workflows.length ? (
          <p className='text-sm text-muted-foreground'>
            No workflows found. Add the snippet to a GitHub Actions workflow in
            this repository and commit it. Preflyt connects it after the first
            verified run.
          </p>
        ) : (
          <>
            <div className='flex flex-wrap items-end gap-3'>
              <div className='min-w-0 flex-1 space-y-1.5'>
                <label
                  className='text-sm font-medium'
                  htmlFor='policy-workflow'
                >
                  Workflow
                </label>
                <Select
                  value={selected}
                  disabled={busy}
                  onValueChange={(value) => {
                    setWorkflowId(value)
                    setJobId('')
                    setProposal(null)
                    setView('edit')
                    setPr(null)
                    setPrRequest(null)
                    createPr.reset()
                    rewrite.reset()
                    add.reset()
                  }}
                >
                  <SelectTrigger id='policy-workflow' className='w-full'>
                    <SelectValue placeholder='Choose workflow' />
                  </SelectTrigger>
                  <SelectContent>
                    {data.workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='pb-2 text-xs text-muted-foreground'>
                Branch: <span className='font-mono'>{data.branch}</span>
              </div>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <p className='text-xs text-muted-foreground'>
                {data.connectedWorkflowIds.includes(selected)
                  ? 'Workflow connected. Completed runs appear in Assessments.'
                  : 'Commit the snippet and run the workflow. Preflyt connects its checks after verifying the completed run.'}
              </p>
              <div className='flex flex-wrap gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  aria-expanded={editorOpen}
                  onClick={() => setEditorOpen(!editorOpen)}
                >
                  {editorOpen ? 'Close editor' : 'Edit workflow (optional)'}
                </Button>
              </div>
            </div>
            {editorOpen &&
              (source.isPending ? (
                <Skeleton className='h-96 w-full' />
              ) : source.isError ? (
                <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'>
                  <p role='alert' className='text-sm'>
                    {source.error.message}
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      refreshSource.current = true
                      void source.refetch()
                    }}
                  >
                    Reload workflow
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    ref={setEditorSection}
                    className='pipeline-workflow-editor overflow-hidden rounded-xl border'
                  >
                    <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2'>
                      <div className='flex min-w-0 items-center gap-2 text-xs'>
                        <FileCode2 className='size-4 shrink-0 text-muted-foreground' />
                        <span className='truncate font-mono'>
                          {source.data?.path}
                        </span>
                        {yaml !== source.data?.workflow && (
                          <span
                            className='text-muted-foreground'
                            aria-label='Unsaved draft'
                          >
                            •
                          </span>
                        )}
                      </div>
                      <div className='flex items-center gap-1'>
                        <Button
                          variant={view === 'edit' ? 'secondary' : 'ghost'}
                          size='sm'
                          onClick={() => setView('edit')}
                        >
                          Edit YAML
                        </Button>
                        <Button
                          variant={view === 'review' ? 'secondary' : 'ghost'}
                          size='sm'
                          onClick={() => setView('review')}
                        >
                          Review changes
                        </Button>
                      </div>
                    </div>
                    {view === 'review' ? (
                      <>
                        {proposal && (
                          <div className='shrink-0 space-y-2 border-b bg-muted/20 p-3'>
                            <p className='text-sm font-medium'>AI proposal</p>
                            <p className='text-sm text-muted-foreground'>
                              {proposal.summary}
                            </p>
                            <div className='flex items-center gap-2'>
                              <Button
                                size='sm'
                                disabled={busy || yaml !== proposal.original}
                                onClick={() => {
                                  setDrafts((previous) => ({
                                    ...previous,
                                    [selected]: {
                                      ...proposal,
                                      original:
                                        draft?.original ??
                                        source.data?.workflow,
                                    },
                                  }))
                                  setProposal(null)
                                  setView('edit')
                                  setPrRequest(null)
                                }}
                              >
                                Use this draft
                              </Button>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setProposal(null)}
                              >
                                Discard proposal
                              </Button>
                            </div>
                            {yaml !== proposal.original && (
                              <p className='text-sm'>
                                The editor has changed since this proposal.
                                Generate a new rewrite.
                              </p>
                            )}
                          </div>
                        )}
                        <div className='workflow-editor-layout grid min-w-0 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0'>
                          <div className='workflow-editor-review-column min-w-0'>
                            <p className='shrink-0 border-b px-3 py-2 text-xs font-medium'>
                              Existing workflow
                            </p>
                            <YamlWorkflowEditor
                              value={reviewOriginal}
                              readOnly
                              label='Existing workflow YAML'
                              fullscreenTarget={editorSection}
                            />
                          </div>
                          <div className='workflow-editor-review-column min-w-0'>
                            <p className='shrink-0 border-b px-3 py-2 text-xs font-medium'>
                              {proposal ? 'AI proposal' : 'Your draft'}
                            </p>
                            <YamlWorkflowEditor
                              value={reviewYaml}
                              readOnly
                              label='Proposed workflow YAML'
                              fullscreenTarget={editorSection}
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className='workflow-editor-layout grid min-w-0 lg:grid-cols-[minmax(0,1fr)_18rem]'>
                        <YamlWorkflowEditor
                          value={yaml}
                          onChange={changeYaml}
                          readOnly={!canManage || busy}
                          label='GitHub workflow YAML editor'
                          fullscreenTarget={editorSection}
                        />
                        <aside
                          className='space-y-3 border-t bg-card p-3 lg:border-t-0 lg:border-l'
                          aria-label='Policy checks'
                        >
                          <h3 className='text-sm font-semibold'>
                            Published policy
                          </h3>
                          <p className='text-xs text-muted-foreground'>
                            This runner fetches the published policy on every
                            run. Manage checks and project commands in
                            Standards.
                          </p>
                          <Button
                            size='sm'
                            className='w-full'
                            disabled={!canManage || busy || !targetJob}
                            onClick={() => add.mutate()}
                          >
                            {inspection?.policyRunner
                              ? 'Update policy runner'
                              : 'Install policy runner'}
                          </Button>
                          {inspection && inspection.jobs.length > 1 && (
                            <Select
                              value={targetJob}
                              disabled={busy || !canManage}
                              onValueChange={setJobId}
                            >
                              <SelectTrigger
                                aria-label='Job for policy checks'
                                className='w-full'
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent portalContainer={editorSection}>
                                {inspection.jobs.map((job) => (
                                  <SelectItem key={job.id} value={job.id}>
                                    {job.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          <div className='relative'>
                            <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
                            <Input
                              aria-label='Search policy checks'
                              placeholder='Find a check'
                              className='pl-8'
                              value={search}
                              onChange={(event) =>
                                setSearch(event.target.value)
                              }
                            />
                          </div>
                          <div className='max-h-72 space-y-1 overflow-auto'>
                            {checks.map((check) => (
                              <div
                                key={check.id}
                                className='rounded-lg border p-2.5'
                              >
                                <p className='text-sm font-medium'>
                                  {check.title}
                                </p>
                                <p className='text-xs text-muted-foreground'>
                                  {check.required ? 'Required' : 'Optional'} ·{' '}
                                  {check.format?.toUpperCase()}
                                </p>
                              </div>
                            ))}
                            {!checks.length && (
                              <p className='py-2 text-sm text-muted-foreground'>
                                No matching pipeline checks.
                              </p>
                            )}
                          </div>
                          <div className='space-y-2 border-t pt-3'>
                            <div className='flex items-center gap-2 text-sm font-semibold'>
                              <Sparkles className='size-4' />
                              Rewrite with AI
                            </div>
                            <Textarea
                              aria-label='Workflow rewrite instructions'
                              placeholder='Add policy checks while keeping my existing build and deployment steps.'
                              value={instructions}
                              maxLength={2000}
                              disabled={!aiAllowed || busy}
                              onChange={(event) =>
                                setInstructions(event.target.value)
                              }
                              className='min-h-20'
                            />
                            <Button
                              variant='outline'
                              size='sm'
                              className='w-full'
                              disabled={!aiAllowed || busy}
                              onClick={() => rewrite.mutate()}
                            >
                              {rewrite.isPending ? (
                                <Loader2 className='animate-spin' />
                              ) : (
                                <Sparkles />
                              )}
                              Rewrite workflow
                            </Button>
                            {data.ai.skill && (
                              <p className='text-xs text-muted-foreground'>
                                {data.ai.skill.name} · v{data.ai.skill.version}.{' '}
                                <Link to='/skills' className='underline'>
                                  Open Skills
                                </Link>
                              </p>
                            )}
                            {data.ai.available ? (
                              <p className='text-xs text-muted-foreground'>
                                {data.ai.model}
                              </p>
                            ) : (
                              <p className='text-xs text-muted-foreground'>
                                {(
                                  data.ai.reason ??
                                  'AI workflow rewriting is unavailable'
                                )
                                  .replace(/ in Model Router/g, '')
                                  .replace(/[.\s]+$/, '')}
                                .{' '}
                                <Link
                                  to='/intelligence'
                                  search={{ tab: 'routing' }}
                                  className='underline'
                                >
                                  Open Model Router
                                </Link>
                              </p>
                            )}
                          </div>
                        </aside>
                      </div>
                    )}
                  </div>
                  {(add.isPending || rewrite.isPending) && (
                    <p role='status' className='text-sm text-muted-foreground'>
                      {rewrite.isPending
                        ? 'Creating an AI proposal. Your current workflow stays in the editor.'
                        : 'Adding checks to your YAML draft…'}
                    </p>
                  )}
                  {inspection?.warnings.length ? (
                    <ul className='space-y-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground'>
                      {inspection.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                  {!data.write.available && (
                    <p className='text-xs text-muted-foreground'>
                      {data.write.reason} Download the files if repository write
                      access is unavailable.
                    </p>
                  )}
                  {view === 'review' && (
                    <section className='rounded-lg border bg-muted/20 p-4'>
                      <h4 className='text-sm font-semibold'>
                        Review repository setup
                      </h4>
                      <p className='mt-1 text-sm'>
                        Target branch: <code>{data.branch}</code>
                      </p>
                      <ul className='mt-3 space-y-1 text-sm'>
                        {data.checks.map((check) => (
                          <li key={check.id}>
                            {check.title} ·{' '}
                            {check.required ? 'Required' : 'Optional'}
                          </li>
                        ))}
                      </ul>
                      <p className='mt-3 text-xs text-muted-foreground'>
                        Review the workflow changes above before creating the
                        PR. Existing policies and model routing are preserved.
                        Merge protection requires separate activation.
                      </p>
                    </section>
                  )}
                  <div className='flex flex-wrap items-center justify-between gap-3 border-t pt-3'>
                    <p className='max-w-lg text-xs text-muted-foreground'>
                      The setup PR includes one workflow with checks and the
                      final gate using the published Action. Review and merge it
                      in GitHub.
                    </p>
                    {canManage && (
                      <div className='flex flex-wrap gap-2'>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={busy || !yaml}
                          onClick={() => files.mutate()}
                        >
                          <Download />
                          Download files
                        </Button>
                        {pr && !pr.connectionSaved && (
                          <Button
                            variant='outline'
                            size='sm'
                            disabled={busy || !selected}
                            onClick={() => connect.mutate()}
                          >
                            Repair connection
                          </Button>
                        )}
                        <Button
                          size='sm'
                          disabled={
                            busy ||
                            !yaml ||
                            !data.write.available ||
                            !!proposal ||
                            !!pr
                          }
                          onClick={() =>
                            view === 'review'
                              ? createPr.mutate()
                              : setView('review')
                          }
                        >
                          {createPr.isPending ? (
                            <Loader2 className='animate-spin' />
                          ) : (
                            <GitPullRequest />
                          )}
                          {view === 'review'
                            ? 'Create setup PR'
                            : 'Review setup'}
                        </Button>
                      </div>
                    )}
                  </div>
                  {pr && (
                    <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'>
                      <div>
                        <p className='text-sm font-medium'>
                          Setup PR #{pr.number} created
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {pr.connectionSaved
                            ? 'Workflow connected. Merge the PR to install the changes.'
                            : pr.connectionError}
                        </p>
                      </div>
                      <Button asChild size='sm' variant='outline'>
                        <a href={pr.url} target='_blank' rel='noreferrer'>
                          Review in GitHub
                          <ArrowUpRight />
                        </a>
                      </Button>
                    </div>
                  )}
                </>
              ))}
          </>
        )}
        {!pr && data.setupPr && (
          <p className='text-xs text-muted-foreground'>
            Latest setup PR:{' '}
            <a
              href={data.setupPr.url}
              target='_blank'
              rel='noreferrer'
              className='underline'
            >
              #{data.setupPr.number}
            </a>
          </p>
        )}
        {!!data.submissions.length && (
          <div className='space-y-2 border-t pt-3'>
            <p className='text-sm font-medium'>Recent policy runs</p>
            {data.submissions.map((run) => (
              <div
                key={run.id}
                className='flex flex-wrap items-center justify-between gap-2 text-xs'
              >
                <span className='text-muted-foreground'>
                  <ResultTimestamp value={run.createdAt} />
                </span>
                <div className='flex items-center gap-3'>
                  <StatusBadge tone='neutral'>
                    {['COMPLETE', 'PROCESSED'].includes(run.state)
                      ? 'Completed'
                      : run.state === 'FAILED'
                        ? 'Failed'
                        : run.state === 'STALE'
                          ? 'Stale'
                          : 'Pending'}
                  </StatusBadge>
                  {run.assessmentId && (
                    <Link
                      to='/assessments'
                      search={{
                        repository: repositoryId,
                        assessment: run.assessmentId,
                      }}
                      className='underline'
                    >
                      Assessment
                    </Link>
                  )}
                  {run.commentUrl && (
                    <a
                      href={run.commentUrl}
                      target='_blank'
                      rel='noreferrer'
                      className='underline'
                    >
                      PR summary
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
