import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  useBindings,
  engineeringPath,
  identityLabel,
  type Binding,
  type BindingResult,
  type SourceIdentity,
} from './engineering-queries'
import { RelativeTime } from './relative-time'
import {
  useStandards,
  useCiEvidence,
  type Standards,
} from './repository-queries'

function sourceKey(source: SourceIdentity) {
  return JSON.stringify(
    source.kind === 'check_run'
      ? { kind: source.kind, appId: source.appId, checkName: source.checkName }
      : { kind: source.kind, workflowId: source.workflowId }
  )
}
function jobName(source: SourceIdentity) {
  return source.kind === 'check_run'
    ? source.checkName || 'Unnamed check'
    : `GitHub workflow #${source.workflowId}`
}
function validSource(source: SourceIdentity) {
  const id = source.kind === 'check_run' ? source.appId : source.workflowId
  return (
    (source.kind === 'check_run' || source.kind === 'workflow_run') &&
    !!id &&
    /^[1-9]\d{0,15}$/.test(id) &&
    Number.isSafeInteger(Number(id)) &&
    (source.kind !== 'check_run' ||
      (!!source.checkName &&
        source.checkName.trim().length > 0 &&
        source.checkName.length <= 256 &&
        !Array.from(source.checkName).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
        )))
  )
}
function BindingEditor({
  repositoryId,
  standards,
  saved,
  onClose,
}: {
  repositoryId: string
  standards: Standards
  saved: BindingResult
  onClose: () => void
}) {
  const client = useQueryClient()
  const [bindings, setBindings] = useState<Binding[]>(
    saved.binding?.bindings ?? []
  )
  const [manualRules, setManualRules] = useState<string[]>([])
  const evidence = useCiEvidence(repositoryId)
  const rules = standards.controls.filter(
    (rule) =>
      saved.supportedRuleIds?.includes(rule.id) ??
      rule.capability === 'import_only'
  )
  const observed = Array.from(
    new Map(
      (evidence.isError ? [] : (evidence.data?.observations ?? [])).flatMap(
        (row) => {
          const source = (
            row as typeof row & { sourceIdentity?: SourceIdentity }
          ).sourceIdentity
          return source && validSource(source)
            ? [[sourceKey(source), source] as const]
            : []
        }
      )
    ).values()
  )
  const currentBindings = bindings.filter((binding) =>
    rules.some((rule) => rule.id === binding.ruleId)
  )
  const original = saved.binding?.bindings ?? []
  const signature = (items: Binding[]) =>
    JSON.stringify(
      items
        .map((item) => [item.ruleId, sourceKey(item)])
        .sort((a, b) => a[0].localeCompare(b[0]))
    )
  const changed =
    signature(currentBindings) !== signature(original) ||
    (!saved.active && currentBindings.length > 0)
  const removed = original.filter(
    (item) => !currentBindings.some((binding) => binding.ruleId === item.ruleId)
  )
  const valid = currentBindings.every(validSource)
  function update(ruleId: string, binding: Binding | null) {
    setBindings((old) => [
      ...old.filter((item) => item.ruleId !== ruleId),
      ...(binding ? [binding] : []),
    ])
  }
  const mutation = useMutation({
    meta: { successMessage: 'CI jobs saved' },
    mutationFn: async () => {
      const response = await fetch(
        engineeringPath(repositoryId, '/ci-bindings'),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedSelectionId: standards.selection!.id,
            expectedBindingId: saved.binding?.id ?? null,
            bindings: currentBindings,
          }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Standards or CI jobs changed. Close this editor, reload and review again.'
            : response.status === 403
              ? 'Your permission or repository access changed.'
              : 'Could not save CI jobs. Check the job details and try again.'
        )
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['ci-bindings', repositoryId] }),
        client.invalidateQueries({ queryKey: ['pull-request', repositoryId] }),
      ])
      onClose()
    },
  })
  return (
    <form
      className='flex min-h-0 flex-col gap-5'
      onSubmit={(event) => {
        event.preventDefault()
        if (valid && changed && !mutation.isPending) mutation.mutate()
      }}
    >
      <div className='min-h-0 space-y-5 overflow-y-auto'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <p className='text-xs text-muted-foreground'>
            Example: Required test execution → Run tests
          </p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={evidence.isFetching || mutation.isPending}
            onClick={() => void evidence.refetch()}
          >
            <RefreshCw className={evidence.isFetching ? 'animate-spin' : ''} />
            Refresh jobs
          </Button>
        </div>
        {evidence.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading CI jobs…
          </p>
        ) : evidence.isError ? (
          <p
            role='alert'
            className='rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger-text'
          >
            CI jobs could not load. Refresh to try again. Saved connections are
            still shown.
          </p>
        ) : evidence.data?.enabled === false ? (
          <p
            role='status'
            className='rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning-text'
          >
            CI job updates are off. Ask a system administrator to enable GitHub
            event collection and configure its webhook secret in Settings →
            Configuration.
          </p>
        ) : !observed.length ? (
          <div className='space-y-2 rounded-lg border bg-muted/20 p-4'>
            <p className='text-sm font-medium'>No CI jobs received yet</p>
            <p className='text-sm text-muted-foreground'>
              Run your tests or scans in GitHub, then refresh jobs here.
            </p>
            <details className='text-xs text-muted-foreground'>
              <summary className='cursor-pointer font-medium hover:text-foreground'>
                Jobs still missing?
              </summary>
              <p className='mt-2'>
                Check that your GitHub App sends check_run and workflow_run
                webhooks to Preflyt. Use manual job details only if you already
                know the exact identifiers.
              </p>
            </details>
          </div>
        ) : null}
        <div className='divide-y rounded-lg border'>
          {rules.map((rule) => {
            const binding = bindings.find((item) => item.ruleId === rule.id)
            const manual = manualRules.includes(rule.id)
            const recorded =
              binding &&
              observed.some(
                (source) => sourceKey(source) === sourceKey(binding)
              )
            return (
              <div key={rule.id} className='space-y-3 p-4'>
                <label
                  id={`ci-job-${rule.id}`}
                  className='block text-sm font-medium'
                >
                  {rule.title}
                </label>
                <Select
                  disabled={mutation.isPending}
                  value={
                    manual ? 'manual' : binding ? sourceKey(binding) : 'none'
                  }
                  onValueChange={(value) => {
                    setManualRules((old) => [
                      ...old.filter((id) => id !== rule.id),
                      ...(value === 'manual' ? [rule.id] : []),
                    ])
                    if (value === 'none') update(rule.id, null)
                    else if (value === 'manual')
                      update(
                        rule.id,
                        binding ?? {
                          ruleId: rule.id,
                          kind: 'check_run',
                          appId: '',
                          checkName: '',
                        }
                      )
                    else {
                      const source = observed.find(
                        (item) => sourceKey(item) === value
                      )
                      if (source)
                        update(
                          rule.id,
                          source.kind === 'check_run'
                            ? {
                                ruleId: rule.id,
                                kind: source.kind,
                                appId: source.appId,
                                checkName: source.checkName,
                              }
                            : {
                                ruleId: rule.id,
                                kind: source.kind,
                                workflowId: source.workflowId,
                              }
                        )
                    }
                  }}
                >
                  <SelectTrigger
                    aria-labelledby={`ci-job-${rule.id}`}
                    className='w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='none'>Not connected</SelectItem>
                    {observed.map((source) => (
                      <SelectItem
                        key={sourceKey(source)}
                        value={sourceKey(source)}
                      >
                        {jobName(source)}
                        {source.kind === 'check_run' &&
                        observed.filter(
                          (item) => jobName(item) === jobName(source)
                        ).length > 1
                          ? ` · App ${source.appId}`
                          : ''}
                      </SelectItem>
                    ))}
                    {binding && !recorded && (
                      <SelectItem value={sourceKey(binding)}>
                        {jobName(binding)} · saved
                      </SelectItem>
                    )}
                    <SelectItem value='manual'>
                      Enter job details manually…
                    </SelectItem>
                  </SelectContent>
                </Select>
                {manual && binding && (
                  <fieldset
                    disabled={mutation.isPending}
                    className='space-y-3 rounded-lg bg-muted/20 p-3'
                  >
                    <legend className='sr-only'>
                      Manual details for {rule.title}
                    </legend>
                    <label className='block space-y-2 text-xs text-muted-foreground'>
                      Job type
                      <Select
                        value={binding.kind}
                        onValueChange={(kind) =>
                          update(
                            rule.id,
                            kind === 'check_run'
                              ? {
                                  ruleId: rule.id,
                                  kind,
                                  appId: '',
                                  checkName: '',
                                }
                              : {
                                  ruleId: rule.id,
                                  kind: 'workflow_run',
                                  workflowId: '',
                                }
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label={`Job type for ${rule.title}`}
                          className='w-full'
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='check_run'>
                            GitHub check
                          </SelectItem>
                          <SelectItem value='workflow_run'>
                            GitHub workflow
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    {binding.kind === 'check_run' ? (
                      <div className='grid gap-3 sm:grid-cols-[9rem_1fr]'>
                        <label className='block space-y-2 text-xs text-muted-foreground'>
                          GitHub App ID
                          <Input
                            aria-label={`GitHub App ID for ${rule.title}`}
                            inputMode='numeric'
                            maxLength={16}
                            placeholder='15368'
                            value={binding.appId ?? ''}
                            onChange={(event) =>
                              update(rule.id, {
                                ...binding,
                                appId: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className='block space-y-2 text-xs text-muted-foreground'>
                          Exact check name
                          <Input
                            aria-label={`Exact check name for ${rule.title}`}
                            maxLength={256}
                            placeholder='Run tests'
                            value={binding.checkName ?? ''}
                            onChange={(event) =>
                              update(rule.id, {
                                ...binding,
                                checkName: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : (
                      <label className='block space-y-2 text-xs text-muted-foreground'>
                        Workflow ID
                        <Input
                          aria-label={`Workflow ID for ${rule.title}`}
                          inputMode='numeric'
                          maxLength={16}
                          placeholder='12345678'
                          value={binding.workflowId ?? ''}
                          onChange={(event) =>
                            update(rule.id, {
                              ...binding,
                              workflowId: event.target.value,
                            })
                          }
                        />
                      </label>
                    )}
                    <p className='text-xs text-muted-foreground'>
                      Use the identifiers from GitHub. A similar job name is not
                      a match.
                    </p>
                  </fieldset>
                )}
              </div>
            )
          })}
        </div>
        {!!removed.length && (
          <p
            role='status'
            className='rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning-text'
          >
            Saving will remove {removed.length} existing{' '}
            {removed.length === 1 ? 'connection' : 'connections'}. Checks
            without a connected job will need other evidence.
          </p>
        )}
        <p className='text-xs text-muted-foreground'>
          Saving approves these jobs for the selected standards. It does not run
          a job or mark a check as passed.
        </p>
        {mutation.error && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
      <DialogFooter className='shrink-0 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={mutation.isPending}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type='submit'
          disabled={!valid || !changed || mutation.isPending}
        >
          {mutation.isPending ? 'Saving…' : 'Save connections'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function RepositoryBindings({
  repositoryId,
  canManage,
  policyId,
}: {
  repositoryId: string
  canManage: boolean
  policyId?: string
}) {
  const query = useBindings(repositoryId, policyId)
  const standards = useStandards(repositoryId, policyId)
  const [editing, setEditing] = useState(false)
  const saved = query.isError ? undefined : query.data
  const data = standards.isError ? undefined : standards.data
  const rules =
    data?.controls.filter(
      (rule) =>
        saved?.supportedRuleIds?.includes(rule.id) ??
        rule.capability === 'import_only'
    ) ?? []
  const mappings = saved?.binding?.bindings ?? []
  const ready =
    !!data?.selection &&
    data.selectionIntegrity &&
    !standards.isError &&
    !!saved
  const connected = saved?.active
    ? rules.filter((rule) =>
        mappings.some((mapping) => mapping.ruleId === rule.id)
      ).length
    : 0
  return (
    <Card className='gap-4'>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 flex-[1_1_16rem] items-center gap-3'>
          <SurfaceIcon icon={Link2} tone='teal' />
          <div className='min-w-0 space-y-1'>
            <CardTitle asChild>
              <h2>CI jobs</h2>
            </CardTitle>
            <CardDescription>
              Connect the jobs that run your tests and scans to your standards.
            </CardDescription>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            size='icon'
            variant='outline'
            aria-label='Refresh CI jobs'
            disabled={query.isFetching || standards.isFetching}
            onClick={() => {
              setEditing(false)
              void query.refetch()
              void standards.refetch()
            }}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
          </Button>
          {canManage && (
            <Button
              size='sm'
              variant={mappings.length ? 'outline' : 'default'}
              disabled={!ready || (!rules.length && !mappings.length)}
              onClick={() => setEditing(true)}
            >
              <Link2 />
              {mappings.length ? 'Edit CI jobs' : 'Connect CI jobs'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending || standards.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading CI connections…
          </p>
        ) : query.isError || standards.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.isError ? query.error.message : standards.error?.message}
          </p>
        ) : !data?.selection ? (
          <p className='text-sm text-muted-foreground'>
            Choose standards above first. Then connect the CI jobs that provide
            their results.
          </p>
        ) : !data.selectionIntegrity ? (
          <p role='alert' className='text-sm text-warning-text'>
            Saved standards could not be verified. Review them before connecting
            CI jobs.
          </p>
        ) : (
          <>
            {!!rules.length && (
              <p className='text-sm text-muted-foreground'>
                {connected} of {rules.length} checks connected
                {!canManage && connected < rules.length
                  ? '. Ask an administrator to connect the missing jobs.'
                  : '.'}
              </p>
            )}
            {saved?.binding && !saved.active && (
              <div className='flex flex-wrap items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm'>
                <StatusBadge tone='warning'>Needs review</StatusBadge>
                <p>Standards changed. Review and save the CI jobs again.</p>
              </div>
            )}
            {rules.length ? (
              <ul className='divide-y rounded-lg border'>
                {rules.map((rule) => {
                  const mapping = mappings.find(
                    (item) => item.ruleId === rule.id
                  )
                  return (
                    <li
                      key={rule.id}
                      className='flex flex-wrap items-center justify-between gap-3 px-4 py-3'
                    >
                      <div className='min-w-0 flex-[1_1_14rem] space-y-1'>
                        <p className='text-sm font-medium'>{rule.title}</p>
                        <p className='text-xs break-words text-muted-foreground'>
                          {mapping
                            ? jobName(mapping)
                            : 'Choose the CI job that runs this check.'}
                        </p>
                      </div>
                      <StatusBadge
                        tone={mapping && saved?.active ? 'success' : 'warning'}
                      >
                        {mapping
                          ? saved?.active
                            ? 'Connected'
                            : 'Needs review'
                          : 'Not connected'}
                      </StatusBadge>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>
                These standards do not need CI job connections.
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              Preflyt uses results from the jobs you select. Connecting a job
              does not run it or prove that a check passed.
            </p>
            {!!saved?.binding && (
              <details className='group border-t pt-3'>
                <summary className='inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
                  Connection details
                  <ChevronDown className='size-3 transition-transform group-open:rotate-180' />
                </summary>
                <div className='mt-3 space-y-3 text-xs text-muted-foreground'>
                  <p>
                    Version {saved.binding.revision} · Saved{' '}
                    <RelativeTime value={saved.binding.createdAt} />
                  </p>
                  <ul className='space-y-2'>
                    {mappings.map((mapping) => (
                      <li key={mapping.ruleId}>
                        {data.controls.find(
                          (rule) => rule.id === mapping.ruleId
                        )?.title ?? mapping.ruleId}
                        : {identityLabel(mapping)}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Existing assessments keep their saved connections and
                    evidence.
                  </p>
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
      <Dialog open={editing && ready && canManage} onOpenChange={setEditing}>
        <DialogContent className='flex max-h-[85svh] flex-col sm:max-w-2xl'>
          <DialogHeader className='shrink-0 text-start'>
            <DialogTitle>Connect CI jobs</DialogTitle>
            <DialogDescription>
              For each check, choose the job that provides its result.
            </DialogDescription>
          </DialogHeader>
          {saved && data?.selection && (
            <BindingEditor
              key={`${data.selection.id}:${saved.binding?.id ?? 'none'}`}
              repositoryId={repositoryId}
              standards={data}
              saved={saved}
              onClose={() => setEditing(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
