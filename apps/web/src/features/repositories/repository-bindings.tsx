import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>CI source bindings</CardTitle>
        <CardDescription>
          Map approved GitHub sources to adopted imported-evidence rules.
        </CardDescription>
        <CardAction>
          <Button
            size='icon'
            variant='outline'
            aria-label='Reload CI bindings'
            disabled={query.isFetching}
            onClick={() => {
              setEditing(false)
              void query.refetch()
              void standards.refetch()
            }}
          >
            <RefreshCw />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        {query.isPending ? (
          <p role='status'>Loading bindings…</p>
        ) : query.isError ? (
          <p role='alert' className='text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <StatusBadge tone={saved?.active ? 'info' : 'warning'}>
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
                  {saved?.binding ? 'Review bindings' : 'Configure bindings'}
                </Button>
              )}
            </div>
            {!standards.data?.selection && (
              <p className='text-sm text-muted-foreground'>
                Adopt standards before approving CI sources.
              </p>
            )}
            {saved?.binding && !saved.active && (
              <p role='status' className='text-sm text-muted-foreground'>
                The adopted standards changed. These mappings remain historical
                until you review and approve them for the current selection.
              </p>
            )}
            {saved?.binding?.bindings.length ? (
              <ul className='divide-y rounded-md border'>
                {saved.binding.bindings.map((b) => (
                  <li
                    key={b.ruleId}
                    className='flex flex-wrap justify-between gap-2 p-3 text-sm'
                  >
                    <span className='font-medium'>
                      {standards.data?.controls.find((r) => r.id === b.ruleId)
                        ?.title ?? b.ruleId}
                    </span>
                    <span className='break-all text-muted-foreground'>
                      {identityLabel(b)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='text-sm text-muted-foreground'>
                CI observations have no automatic rule associations.
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              Matching sources remain unverified execution evidence. Changing
              mappings does not rewrite existing assessments.
            </p>
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
