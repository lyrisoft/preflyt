import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  GitBranch,
  Link2,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import { StatusBadge } from '@/components/status-badge'
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

function BindingEditor({
  repositoryId,
  standards,
  saved,
  onSaved,
}: {
  repositoryId: string
  standards: Standards
  saved: BindingResult
  onSaved: () => void
}) {
  const client = useQueryClient()
  const [bindings, setBindings] = useState<Binding[]>(
    saved.binding?.bindings ?? []
  )
  const evidence = useCiEvidence(repositoryId)
  const rules = standards.controls.filter((r) => r.capability === 'import_only')
  const observed = Array.from(
    new Map(
      (evidence.data?.observations ?? []).flatMap((row) => {
        const identity = (
          row as typeof row & { sourceIdentity?: SourceIdentity }
        ).sourceIdentity
        return identity
          ? [
              [
                JSON.stringify({
                  kind: identity.kind,
                  appId: identity.appId,
                  checkName: identity.checkName,
                  workflowId: identity.workflowId,
                }),
                identity,
              ] as const,
            ]
          : []
      })
    ).values()
  )
  function update(ruleId: string, binding: Binding | null) {
    setBindings((old) => [
      ...old.filter((b) => b.ruleId !== ruleId),
      ...(binding ? [binding] : []),
    ])
  }
  const valid = bindings.every((b) => {
    const id = b.kind === 'check_run' ? b.appId : b.workflowId
    return (
      !!id &&
      /^[1-9]\d{0,15}$/.test(id) &&
      Number.isSafeInteger(Number(id)) &&
      (b.kind !== 'check_run' ||
        (!!b.checkName &&
          b.checkName.length <= 256 &&
          !Array.from(b.checkName).some(
            (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
          )))
    )
  })
  const mutation = useMutation({
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
            bindings: bindings.filter((b) =>
              rules.some((r) => r.id === b.ruleId)
            ),
          }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Standards or bindings changed. Close this editor, reload and review again.'
            : response.status === 403
              ? 'Your permission or repository access changed.'
              : 'Approval failed. Check exact source identities and try again.'
        )
    },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['ci-bindings', repositoryId] }),
        client.invalidateQueries({ queryKey: ['pull-request', repositoryId] }),
      ])
      onSaved()
    },
  })
  return (
    <form
      className='flex min-h-0 flex-1 flex-col'
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <div className='flex-1 space-y-5 overflow-y-auto px-4 pb-4'>
        <p className='text-sm text-muted-foreground'>
          Choose an observed signed source or enter its exact identifiers.
          Approval identifies the source; it does not prove that a rule
          executed.
        </p>
        {rules.map((rule) => {
          const b = bindings.find((item) => item.ruleId === rule.id)
          return (
            <fieldset
              key={rule.id}
              disabled={mutation.isPending}
              className='space-y-3 rounded-md border p-3'
            >
              <legend className='px-1 text-sm font-medium'>{rule.title}</legend>
              <Select
                value={b?.kind ?? 'none'}
                onValueChange={(kind) =>
                  update(
                    rule.id,
                    kind === 'none'
                      ? null
                      : kind === 'check_run'
                        ? { ruleId: rule.id, kind, appId: '', checkName: '' }
                        : {
                            ruleId: rule.id,
                            kind: 'workflow_run',
                            workflowId: '',
                          }
                  )
                }
              >
                <SelectTrigger
                  aria-label={`Source type for ${rule.title}`}
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>No automatic association</SelectItem>
                  <SelectItem value='check_run'>GitHub check</SelectItem>
                  <SelectItem value='workflow_run'>GitHub workflow</SelectItem>
                </SelectContent>
              </Select>
              {observed.length > 0 && (
                <Select
                  value=''
                  onValueChange={(key) => {
                    const source = observed[Number(key)]
                    if (source)
                      update(rule.id, {
                        ruleId: rule.id,
                        kind: source.kind,
                        ...(source.kind === 'check_run'
                          ? { appId: source.appId, checkName: source.checkName }
                          : { workflowId: source.workflowId }),
                      })
                  }}
                >
                  <SelectTrigger
                    aria-label={`Observed source for ${rule.title}`}
                    className='w-full'
                  >
                    <SelectValue placeholder='Use an observed CI source' />
                  </SelectTrigger>
                  <SelectContent>
                    {observed.map((source, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {identityLabel(source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {b?.kind === 'check_run' ? (
                <>
                  <label className='block space-y-1 text-sm'>
                    GitHub App ID
                    <Input
                      inputMode='numeric'
                      maxLength={16}
                      value={b.appId ?? ''}
                      onChange={(e) =>
                        update(rule.id, { ...b, appId: e.target.value })
                      }
                    />
                  </label>
                  <label className='block space-y-1 text-sm'>
                    Exact check name
                    <Input
                      maxLength={256}
                      value={b.checkName ?? ''}
                      onChange={(e) =>
                        update(rule.id, { ...b, checkName: e.target.value })
                      }
                    />
                  </label>
                </>
              ) : b?.kind === 'workflow_run' ? (
                <label className='block space-y-1 text-sm'>
                  Workflow ID
                  <Input
                    inputMode='numeric'
                    maxLength={16}
                    value={b.workflowId ?? ''}
                    onChange={(e) =>
                      update(rule.id, { ...b, workflowId: e.target.value })
                    }
                  />
                </label>
              ) : null}
            </fieldset>
          )
        })}
        {evidence.isError && (
          <p className='text-xs text-muted-foreground'>
            Observed sources could not load. You can enter known identifiers
            directly.
          </p>
        )}
        {mutation.error && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
      <SheetFooter className='border-t'>
        <p className='text-xs text-muted-foreground'>
          {bindings.filter((b) => rules.some((r) => r.id === b.ruleId)).length}{' '}
          associations will be approved in a new revision. No associations
          clears the saved mappings.
        </p>
        <Button type='submit' disabled={!valid || mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Approve source bindings'}
        </Button>
      </SheetFooter>
    </form>
  )
}
export function RepositoryBindings({
  repositoryId,
  canManage,
}: {
  repositoryId: string
  canManage: boolean
}) {
  const query = useBindings(repositoryId),
    standards = useStandards(repositoryId)
  const [editing, setEditing] = useState(false)
  const saved = query.data
  const mappings = saved?.binding?.bindings ?? []
  const importRules =
    standards.data?.controls.filter(
      (rule) => rule.capability === 'import_only'
    ) ?? []
  const mappedRules = mappings.filter((mapping) =>
    importRules.some((rule) => rule.id === mapping.ruleId)
  ).length
  const workflowCount = mappings.filter(
    (mapping) => mapping.kind === 'workflow_run'
  ).length
  const checkCount = mappings.length - workflowCount
  return (
    <Card className='gap-4'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Link2 className='size-4 text-chart-2' />
          CI source bindings
        </CardTitle>
        <CardDescription>
          Approved sources associated with imported-evidence rules.
        </CardDescription>
        <CardAction>
          <Button
            size='icon'
            variant='outline'
            className='size-8'
            aria-label='Reload CI bindings'
            disabled={query.isFetching}
            onClick={() => {
              setEditing(false)
              void query.refetch()
              void standards.refetch()
            }}
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading bindings…
          </p>
        ) : query.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <StatusBadge tone={saved?.active ? 'success' : 'warning'}>
                {saved?.active
                  ? `Active · revision ${saved.binding?.revision}`
                  : saved?.binding
                    ? 'Reapproval required'
                    : 'No approved sources'}
              </StatusBadge>
              {canManage && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    !standards.data?.selection ||
                    !standards.data.selectionIntegrity ||
                    standards.isError
                  }
                  onClick={() => setEditing(true)}
                >
                  <ShieldCheck className='size-3.5' />
                  {saved?.binding ? 'Review bindings' : 'Configure bindings'}
                </Button>
              )}
            </div>
            <div className='grid overflow-hidden rounded-lg border bg-muted/10 sm:grid-cols-3'>
              <div className='flex items-center gap-3 p-4'>
                <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-2/10 text-chart-2'>
                  <Link2 className='size-4' />
                </span>
                <div>
                  <p className='text-xl leading-none font-semibold tabular-nums'>
                    {mappings.length}
                  </p>
                  <p className='mt-1.5 text-xs text-muted-foreground'>
                    Source mappings
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3 border-t p-4 sm:border-s sm:border-t-0'>
                <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-1/10 text-chart-1'>
                  <ListChecks className='size-4' />
                </span>
                <div>
                  <p className='text-xl leading-none font-semibold tabular-nums'>
                    {standards.isPending ||
                    standards.isError ||
                    standards.data?.selectionIntegrity === false
                      ? '—'
                      : `${saved?.active ? mappedRules : 0} / ${importRules.length}`}
                  </p>
                  <p className='mt-1.5 text-xs text-muted-foreground'>
                    Current rules associated
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3 border-t p-4 sm:border-s sm:border-t-0'>
                <span className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-4/10 text-chart-4'>
                  <Workflow className='size-4' />
                </span>
                <div>
                  <p className='text-xl leading-none font-semibold tabular-nums'>
                    {workflowCount}
                    <span className='mx-1 text-sm text-muted-foreground'>
                      /
                    </span>
                    {checkCount}
                  </p>
                  <p className='mt-1.5 text-xs text-muted-foreground'>
                    Workflows / checks
                  </p>
                </div>
              </div>
            </div>
            {standards.data?.selectionIntegrity === false && (
              <p
                role='alert'
                className='rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs text-warning-text'
              >
                Saved standards need review before current rule associations can
                be interpreted.
              </p>
            )}
            {standards.isError ? (
              <p
                role='alert'
                className='rounded-lg border border-danger/20 bg-danger/5 p-3 text-xs text-danger-text'
              >
                {standards.error.message}
              </p>
            ) : (
              !standards.isPending &&
              !standards.data?.selection && (
                <p className='rounded-lg border border-info/20 bg-info/5 px-3 py-2.5 text-xs text-info-text'>
                  Adopt standards to configure and approve source mappings.
                </p>
              )
            )}
            {saved?.binding && !saved.active && (
              <p
                role='status'
                className='rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5 text-xs text-warning-text'
              >
                Standards changed. Review and approve these historical mappings
                for the current selection.
              </p>
            )}
            {mappings.length ? (
              <ul className='divide-y rounded-lg border'>
                {mappings.map((mapping) => {
                  const Icon =
                    mapping.kind === 'workflow_run' ? Workflow : GitBranch
                  return (
                    <li
                      key={mapping.ruleId}
                      className='flex items-start gap-3 px-4 py-3'
                    >
                      <span className='flex size-7 shrink-0 items-center justify-center rounded-md bg-chart-2/10 text-chart-2'>
                        <Icon className='size-3.5' />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <p className='text-sm font-medium'>
                          {standards.data?.controls.find(
                            (rule) => rule.id === mapping.ruleId
                          )?.title ?? mapping.ruleId}
                        </p>
                        <p className='mt-0.5 text-xs break-all text-muted-foreground'>
                          {identityLabel(mapping)}
                        </p>
                      </div>
                      <span className='rounded-md border px-2 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground'>
                        {mapping.kind === 'workflow_run' ? 'Workflow' : 'Check'}
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className='flex items-center gap-3 rounded-lg border border-dashed px-4 py-5'>
                <Link2 className='size-5 shrink-0 text-muted-foreground' />
                <div>
                  <p className='text-sm font-medium'>No rule associations</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    CI results remain available without an automatic
                    source-to-rule mapping.
                  </p>
                </div>
              </div>
            )}
            <details className='group border-t pt-3'>
              <summary className='inline-flex cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden'>
                Approval scope and history
                <ChevronDown className='size-3 transition-transform group-open:rotate-180' />
              </summary>
              <div className='mt-3 space-y-3 text-xs text-muted-foreground'>
                {saved?.binding && (
                  <dl className='grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]'>
                    <dt>Binding revision</dt>
                    <dd className='font-medium text-foreground'>
                      {saved.binding.revision}
                    </dd>
                    <dt>Approved</dt>
                    <dd className='text-foreground'>
                      <RelativeTime value={saved.binding.createdAt} />
                    </dd>
                    <dt>Selection ID</dt>
                    <dd className='font-mono break-all'>
                      {saved.binding.selectionId}
                    </dd>
                  </dl>
                )}
                <p>
                  Matching sources identify where evidence originated; execution
                  remains unverified. New revisions preserve existing assessment
                  snapshots.
                </p>
              </div>
            </details>
          </>
        )}
      </CardContent>
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className='gap-0 sm:max-w-lg'>
          <SheetHeader>
            <SheetTitle>Approve CI sources</SheetTitle>
            <SheetDescription>
              Review mappings for the current standards selection.
            </SheetDescription>
          </SheetHeader>
          {saved && standards.data?.selection && (
            <BindingEditor
              key={`${standards.data.selection.id}:${saved.binding?.id ?? 'none'}`}
              repositoryId={repositoryId}
              standards={standards.data}
              saved={saved}
              onSaved={() => setEditing(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </Card>
  )
}
