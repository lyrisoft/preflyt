import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/status-badge'
import { BranchPicker } from './branch-picker'
import {
  draftRequest,
  DraftRequestError,
  reviewedSaveBody,
  type DraftOptions,
  type DraftPage,
  type RulesetDraft,
  type RulesetPreview,
  type StandardsSelection,
} from './ruleset-draft-api'

const profiles = [
  {
    id: 'STANDARD',
    name: 'Standard',
    description:
      'One approval, a pull request, and protection from force pushes and branch deletion.',
  },
  {
    id: 'STRICT',
    name: 'Strict',
    description:
      'Two approvals, code owner review, approval after the latest push, resolved conversations, and up-to-date checks.',
  },
  {
    id: 'CUSTOM',
    name: 'Custom',
    description:
      'Choose review requirements and branch protections for this repository.',
  },
] as const
const friendlyRule: Record<string, string> = {
  pull_request: 'Require a pull request',
  non_fast_forward: 'Prevent force pushes',
  deletion: 'Prevent branch deletion',
  required_status_checks: 'Require Preflyt engineering readiness',
}
function PreviewDetails({
  definition,
  packs,
  selectionId,
}: {
  definition: RulesetPreview['definition']
  packs: StandardsSelection['packs']
  selectionId: string | null
}) {
  const pr = definition.rules.find(
    (rule) => rule.type === 'pull_request'
  )?.parameters
  return (
    <div className='space-y-5'>
      <p className='text-lg font-semibold break-words'>{definition.name}</p>
      <div className='flex flex-wrap gap-2'>
        <StatusBadge tone='info'>Local draft</StatusBadge>
        <StatusBadge tone='neutral'>Activation unavailable</StatusBadge>
      </div>
      <section className='space-y-2'>
        <h3 className='text-sm font-semibold'>Target branches</h3>
        <div className='flex flex-wrap gap-2'>
          {definition.conditions.ref_name.include.map((branch) => (
            <code
              key={branch}
              className='rounded-md border bg-muted/30 px-2 py-1 text-xs break-all'
            >
              {branch.replace(/^refs\/heads\//, '')}
            </code>
          ))}
        </div>
      </section>
      <section>
        <h3 className='mb-2 text-sm font-semibold'>Branch protections</h3>
        <ul className='divide-y rounded-lg border'>
          {definition.rules.map((rule) => (
            <li key={rule.type} className='flex items-start gap-2 p-3 text-sm'>
              <ShieldCheck className='mt-0.5 size-4 shrink-0 text-info' />
              <div>
                {friendlyRule[rule.type] ?? rule.type}
                {rule.type === 'pull_request' && (
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {Number(pr?.required_approving_review_count)} approvals
                    {pr?.required_review_thread_resolution
                      ? ' · Resolve conversations'
                      : ''}
                    {pr?.require_code_owner_review
                      ? ' · Code owner review'
                      : ''}
                    {pr?.require_last_push_approval
                      ? ' · Approval after latest push'
                      : ''}
                  </p>
                )}
                {rule.type === 'required_status_checks' && (
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {Array.isArray(rule.parameters?.required_status_checks) &&
                      (
                        rule.parameters.required_status_checks as {
                          context: string
                        }[]
                      ).map((check) => (
                        <span
                          key={check.context}
                          className='mb-1 block font-medium text-foreground'
                        >
                          {check.context}
                        </span>
                      ))}
                    Check publisher has not been verified.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className='space-y-2'>
        <h3 className='text-sm font-semibold'>Saved engineering standards</h3>
        {selectionId ? (
          <ul className='space-y-1 text-sm'>
            {packs.map((pack) => (
              <li
                key={pack.id}
                className='flex justify-between gap-4 rounded-md bg-muted/30 px-3 py-2'
              >
                <span className='break-all'>{pack.id}</span>
                <span className='shrink-0 text-muted-foreground'>
                  v{pack.version}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            No saved standards selection.
          </p>
        )}
        {selectionId && !packs.length && (
          <p className='text-sm text-muted-foreground'>
            No packs in this selection.
          </p>
        )}
      </section>
      <details className='rounded-lg border p-3'>
        <summary className='cursor-pointer text-sm font-medium'>
          Generated configuration
        </summary>
        <pre className='mt-3 max-h-72 overflow-auto rounded-md bg-muted/30 p-3 text-xs'>
          {JSON.stringify(definition, null, 2)}
        </pre>
      </details>
    </div>
  )
}
function DraftWizard({
  repositoryId,
  repositoryName,
  actorId,
  draft,
  selection,
  onClose,
  onSaved,
  reload,
}: {
  repositoryId: string
  repositoryName: string
  actorId?: string
  draft?: RulesetDraft
  selection: StandardsSelection | null
  onClose: () => void
  onSaved: () => void
  reload: (
    id?: string
  ) => Promise<{ selection: StandardsSelection | null; draft?: RulesetDraft }>
}) {
  const [options, setOptions] = useState<DraftOptions>(
    draft
      ? { ...draft.options, expectedSelectionId: selection?.id ?? null }
      : {
          name: `${repositoryName.split('/').pop()} branch protection`,
          profile: 'STANDARD',
          branches: [],
          approvals: 1,
          requirePullRequest: true,
          resolveConversations: false,
          preventForcePush: true,
          preventDeletion: true,
          expectedSelectionId: selection?.id ?? null,
        }
  )
  const [step, setStep] = useState(0)
  const [preview, setPreview] = useState<{
    result: RulesetPreview
    inputs: DraftOptions
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [version, setVersion] = useState(draft)
  const update = (value: Partial<DraftOptions>) => {
    setOptions((current) => ({ ...current, ...value }))
    setPreview(null)
    if (!conflict) setError('')
  }
  const review = async () => {
    setBusy(true)
    setError('')
    setConflict(false)
    try {
      const result = await draftRequest<RulesetPreview>(
        repositoryId,
        '/preview',
        options
      )
      setPreview({
        result,
        inputs: { ...options, branches: [...options.branches] },
      })
      setStep(2)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Preview failed. Try again.'
      )
      setConflict(err instanceof DraftRequestError && err.status === 409)
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!preview) return
    setBusy(true)
    setError('')
    setConflict(false)
    try {
      await draftRequest(
        repositoryId,
        version ? `/${encodeURIComponent(version.id)}/edit` : '',
        reviewedSaveBody(preview.inputs, version)
      )
      onSaved()
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Draft could not be saved.')
      setConflict(err instanceof DraftRequestError && err.status === 409)
      setStep(1)
    } finally {
      setBusy(false)
    }
  }
  const reloadData = async () => {
    setBusy(true)
    try {
      const fresh = await reload(version?.id)
      if (!fresh) throw new Error('Could not reload saved data. Try again.')
      if (version) {
        const latest = fresh.draft
        if (!latest)
          throw new Error(
            'Draft is unavailable. Close the editor and reload the list.'
          )
        setVersion(latest)
        setOptions({
          ...latest.options,
          expectedSelectionId: fresh.selection?.id ?? null,
        })
      } else
        setOptions((current) => ({
          ...current,
          expectedSelectionId: fresh.selection?.id ?? null,
        }))
      setPreview(null)
      setConflict(false)
      setError('')
      setStep(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reload failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <SheetContent className='w-full gap-0 sm:max-w-2xl'>
        <SheetHeader className='border-b p-6 pr-12'>
          <SheetTitle>
            {version ? 'Edit ruleset draft' : 'New ruleset draft'}
          </SheetTitle>
          <SheetDescription>
            {repositoryName} · Changes stay in Preflyt until deployment is
            available.
          </SheetDescription>
        </SheetHeader>
        <ol className='grid grid-cols-3 gap-2 border-b px-6 py-4'>
          {['Targets', 'Profile', 'Review'].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={`flex items-center gap-2 text-sm ${step === index ? 'font-medium text-info' : 'text-muted-foreground'}`}
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs ${step === index ? 'bg-info/15' : 'bg-muted'}`}
              >
                {index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto p-6'>
          {error && (
            <div
              role='alert'
              className='space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'
            >
              <p>{error}</p>
              {conflict && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy}
                  onClick={() => void reloadData()}
                >
                  {version
                    ? 'Discard changes and reload draft'
                    : 'Reload current standards'}
                </Button>
              )}
            </div>
          )}
          {version && version.selectionId !== options.expectedSelectionId && (
            <p
              role='status'
              className='rounded-lg border border-info/20 bg-info/5 p-3 text-sm'
            >
              This edit will use the current saved standards. Review the updated
              packs before saving.
            </p>
          )}
          {step === 0 && (
            <div className='space-y-6'>
              <div className='space-y-2'>
                <Label htmlFor='ruleset-name'>Ruleset name</Label>
                <Input
                  id='ruleset-name'
                  maxLength={100}
                  value={options.name}
                  disabled={busy}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <p className='text-sm font-medium'>Target branches</p>
                  <span className='text-xs text-muted-foreground'>
                    {options.branches.length}/20 selected
                  </span>
                </div>
                <BranchPicker
                  repositoryId={repositoryId}
                  actorId={actorId}
                  value=''
                  label='Add target branch'
                  disabled={busy || options.branches.length >= 20}
                  onValueChange={(branch) => {
                    if (!options.branches.includes(branch))
                      update({ branches: [...options.branches, branch] })
                  }}
                />
                <div className='space-y-2'>
                  {options.branches.map((branch) => (
                    <div
                      key={branch}
                      className='flex items-center gap-2 rounded-lg border p-3 text-sm'
                    >
                      <GitBranch className='size-4 shrink-0 text-info' />
                      <span className='min-w-0 flex-1 break-all'>{branch}</span>
                      <Button
                        variant='ghost'
                        size='icon'
                        disabled={busy}
                        aria-label={`Remove ${branch}`}
                        onClick={() =>
                          update({
                            branches: options.branches.filter(
                              (item) => item !== branch
                            ),
                          })
                        }
                      >
                        <X className='size-4' />
                      </Button>
                    </div>
                  ))}
                </div>
                {!options.branches.length && (
                  <p className='text-sm text-muted-foreground'>
                    Choose at least one branch from GitHub.
                  </p>
                )}
              </div>
            </div>
          )}
          {step === 1 && (
            <div className='space-y-5'>
              <fieldset className='space-y-3'>
                <legend className='mb-3 text-sm font-medium'>
                  Protection profile
                </legend>
                {profiles.map((profile) => (
                  <label
                    key={profile.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${options.profile === profile.id ? 'border-info/40 bg-info/5' : 'hover:bg-muted/30'}`}
                  >
                    <input
                      type='radio'
                      name='ruleset-profile'
                      value={profile.id}
                      checked={options.profile === profile.id}
                      disabled={busy}
                      onChange={() =>
                        update({
                          profile: profile.id,
                          ...(profile.id === 'CUSTOM'
                            ? {}
                            : {
                                approvals: profile.id === 'STRICT' ? 2 : 1,
                                requirePullRequest: true,
                                resolveConversations: profile.id === 'STRICT',
                                preventForcePush: true,
                                preventDeletion: true,
                              }),
                        })
                      }
                      className='mt-1 accent-[var(--info)]'
                    />
                    <span>
                      <span className='text-sm font-semibold'>
                        {profile.name}
                      </span>
                      <span className='mt-1 block text-sm text-muted-foreground'>
                        {profile.description}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {options.profile === 'CUSTOM' && (
                <fieldset
                  disabled={busy}
                  className='space-y-4 rounded-xl border p-4'
                >
                  <legend className='px-1 text-sm font-medium'>
                    Custom protections
                  </legend>
                  {(
                    [
                      ['requirePullRequest', 'Require pull requests'],
                      ['resolveConversations', 'Resolve review conversations'],
                      ['preventForcePush', 'Prevent force pushes'],
                      ['preventDeletion', 'Prevent branch deletion'],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className='flex items-center gap-3 text-sm'
                    >
                      <input
                        type='checkbox'
                        checked={options[key]}
                        disabled={
                          key === 'resolveConversations' &&
                          !options.requirePullRequest
                        }
                        onChange={(e) => update({ [key]: e.target.checked })}
                        className='size-4 accent-[var(--info)]'
                      />
                      {label}
                    </label>
                  ))}
                  <div className='flex items-center justify-between gap-4'>
                    <Label htmlFor='ruleset-approvals'>
                      Required approvals
                    </Label>
                    <select
                      id='ruleset-approvals'
                      className='h-9 rounded-md border bg-background px-3 text-sm'
                      value={options.approvals}
                      disabled={!options.requirePullRequest}
                      onChange={(e) =>
                        update({ approvals: Number(e.target.value) })
                      }
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </fieldset>
              )}
            </div>
          )}
          {step === 2 && preview && (
            <PreviewDetails
              definition={preview.result.definition}
              packs={preview.result.selection?.packs ?? []}
              selectionId={preview.result.selection?.id ?? null}
            />
          )}
        </div>
        <div className='flex items-center justify-between gap-3 border-t p-6'>
          <Button
            variant='outline'
            disabled={busy}
            onClick={() => {
              if (step === 0) onClose()
              else {
                setStep(step - 1)
                setPreview(null)
              }
            }}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          {step === 0 ? (
            <Button
              disabled={
                busy || !options.name.trim() || !options.branches.length
              }
              onClick={() => setStep(1)}
            >
              Choose profile
              <ChevronRight className='size-4' />
            </Button>
          ) : step === 1 ? (
            <Button disabled={busy || conflict} onClick={() => void review()}>
              {busy ? 'Loading preview…' : 'Preview configuration'}
              <ChevronRight className='size-4' />
            </Button>
          ) : (
            <Button disabled={busy || !preview} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save local draft'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
export function RulesetDrafts({
  repositoryId,
  repositoryName,
  actorId,
  canDraft,
}: {
  repositoryId: string
  repositoryName: string
  actorId?: string
  canDraft: boolean
}) {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<RulesetDraft | 'new' | null>(null)
  const [viewing, setViewing] = useState<RulesetDraft | null>(null)
  const [saved, setSaved] = useState(false)
  const query = useQuery({
    queryKey: ['ruleset-drafts', actorId, repositoryId, page],
    queryFn: ({ signal }) =>
      draftRequest<DraftPage>(repositoryId, `?page=${page}`, undefined, signal),
    retry: false,
  })
  return (
    <>
      <Card className='gap-4'>
        <CardHeader className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle>Ruleset drafts</CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>
              Review branch protections before they are deployed.
            </p>
          </div>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className='size-4' />
              Refresh
            </Button>
            {canDraft && (
              <Button
                size='sm'
                disabled={!query.data || query.isFetching || query.isError}
                onClick={() => {
                  setSaved(false)
                  setEditing('new')
                }}
              >
                <Plus className='size-4' />
                New draft
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {saved && (
            <p role='status' className='text-sm text-success'>
              Draft saved. GitHub protections were not changed.
            </p>
          )}
          {query.isPending && <Skeleton className='h-48' />}
          {query.isError && (
            <p
              role='alert'
              className='rounded-lg border border-destructive/20 p-4 text-sm'
            >
              {query.error.message}
            </p>
          )}
          {query.data && !query.isError && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Branches</TableHead>
                    <TableHead>Profile</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {query.data.drafts.map((draft) => (
                    <TableRow key={draft.id}>
                      <TableCell>
                        <button
                          type='button'
                          className='max-w-64 text-left font-medium break-words text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring'
                          onClick={() => setViewing(draft)}
                        >
                          {draft.name}
                        </button>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Revision {draft.revision}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p
                          className='max-w-56 truncate'
                          title={draft.options.branches.join(', ')}
                        >
                          {draft.options.branches.join(', ')}
                        </p>
                      </TableCell>
                      <TableCell>
                        {
                          profiles.find(
                            (profile) => profile.id === draft.profile
                          )?.name
                        }
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone='info'>Draft</StatusBadge>
                        {draft.selectionId !==
                          (query.data!.selection?.id ?? null) && (
                          <p className='mt-1 text-xs text-warning'>
                            Standards changed
                          </p>
                        )}
                      </TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        {new Date(draft.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => setViewing(draft)}
                        >
                          View
                        </Button>
                        {canDraft && (
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => {
                              setSaved(false)
                              setEditing(draft)
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!query.data.drafts.length && (
                <div className='rounded-xl border border-dashed p-8 text-center'>
                  <ShieldCheck className='mx-auto mb-3 size-8 text-info' />
                  <p className='text-sm font-medium'>No ruleset drafts yet</p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {canDraft
                      ? 'Choose branches and a protection profile to create one.'
                      : 'A policy manager can create a draft for this repository.'}
                  </p>
                </div>
              )}
              <div className='flex items-center justify-between gap-3 border-t pt-4'>
                <p className='text-xs text-muted-foreground'>
                  Page {page} · {query.data.drafts.length} drafts
                </p>
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={page === 1 || query.isFetching}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className='size-4' />
                    Previous
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={
                      !query.data.hasMore || query.isFetching || page >= 1000
                    }
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ChevronRight className='size-4' />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      {editing && canDraft && query.data && (
        <DraftWizard
          key={editing === 'new' ? 'new' : editing.id}
          repositoryId={repositoryId}
          repositoryName={repositoryName}
          actorId={actorId}
          draft={editing === 'new' ? undefined : editing}
          selection={query.data.selection}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setSaved(true)
            setPage(1)
            void query.refetch()
          }}
          reload={async (id) => {
            if (id)
              return draftRequest<{
                draft: RulesetDraft
                selection: StandardsSelection | null
              }>(repositoryId, `/${encodeURIComponent(id)}`)
            const result = await query.refetch()
            if (result.isError) throw result.error
            return { selection: result.data!.selection }
          }}
        />
      )}
      <Sheet
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
      >
        <SheetContent className='w-full gap-0 sm:max-w-xl'>
          <SheetHeader className='border-b p-6 pr-12'>
            <SheetTitle>{viewing?.name ?? 'Ruleset draft'}</SheetTitle>
            <SheetDescription>
              Revision {viewing?.revision} · {repositoryName}
            </SheetDescription>
          </SheetHeader>
          <div className='min-h-0 flex-1 overflow-y-auto p-6'>
            {viewing && (
              <PreviewDetails
                definition={viewing.definition}
                packs={viewing.packs}
                selectionId={viewing.selectionId}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
