import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CheckCheck,
  GitBranch,
  Info,
  Layers,
  Plus,
  Pencil,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { SurfaceIcon } from '@/components/surface-icon'
import { engineeringPath, engineeringRead } from './engineering-queries'
import { policyActions } from './policy-actions'
import { PolicyExceptions } from './policy-exceptions'
import { useStandards, type Pack, type Standards } from './repository-queries'

export type Revision = {
  id: string
  branchRef: string
  revision: number
  selectionId: string
  state: string
  definitionHash: string
  draftedById: string
  approvedById: string | null
  definition: {
    standardsSource?: string
    adoptionProfile?: string
    overrides?: string[]
    teamContext?: { teamId: string; teamName?: string; assignmentId: string }[]
    aiChecks?: {
      id: string
      title: string
      skillId: string
      skillVersion: number
      skillDigest: string
      stages: string[]
    }[]
    mode: string
    packs: { id: string; version: string; digest: string }[]
    rules: {
      id: string
      title: string
      required: boolean
      capability: string
    }[]
  }
}
export type Policies = {
  currentSelectionId: string | null
  truncated: boolean
  revisions: Revision[]
}
const branchName = (ref: string) => ref.replace(/^refs\/heads\//, '')
const stateLabel: Record<string, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  SUPERSEDED: 'Replaced',
}
function PolicyState({ policy, stale }: { policy: Revision; stale: boolean }) {
  return (
    <StatusBadge tone={stale ? 'warning' : 'neutral'}>
      {stale ? 'Standards changed' : (stateLabel[policy.state] ?? policy.state)}
    </StatusBadge>
  )
}
export function GatePolicyPanel({
  repositoryId,
  canDraft,
  canPublish,
  actorId,
  platformAdmin = false,
  initialPolicyId,
  initialBranch = '',
  canRequestExceptions,
  canApproveExceptions,
}: {
  repositoryId: string
  canDraft: boolean
  canPublish: boolean
  actorId?: string
  platformAdmin?: boolean
  initialPolicyId?: string
  initialBranch?: string
  canRequestExceptions?: boolean
  canApproveExceptions?: boolean
}) {
  const [draftOpen, setDraftOpen] = useState(false)
  const [editing, setEditing] = useState<Revision | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialPolicyId ?? null
  )
  const [draftPacks, setDraftPacks] = useState<Pack[]>([])
  const [profile, setProfile] = useState('RECOMMENDED')
  const [draftCatalogue, setDraftCatalogue] = useState<Pack[] | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [branch, setBranch] = useState('')
  const [required, setRequired] = useState<string[]>([])
  const client = useQueryClient(),
    standards = useStandards(repositoryId)
  const key = ['gate-policies', repositoryId]
  const query = useQuery({
    queryKey: key,
    retry: false,
    queryFn: ({ signal }) =>
      engineeringRead<Policies>(repositoryId, '/gate-policies', signal),
  })
  const mutation = useMutation({
    mutationFn: async ({ path, body }: { path: string; body: object }) => {
      const response = await fetch(
        engineeringPath(repositoryId, `/gate-policies${path}`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))) as {
          message?: string | string[]
        }
        throw new Error(
          Array.isArray(error.message)
            ? error.message.join(' · ')
            : (error.message ?? 'Policy update failed. Reload and try again.')
        )
      }
      return response.json() as Promise<Revision>
    },
    onSuccess: async (result, { path }) => {
      await client.invalidateQueries({ queryKey: key })
      if (!path || path.endsWith('/edit')) {
        setDraftOpen(false)
        setBranch('')
        setRequired([])
        setSelectedId(result.id)
      }
      toast.success(
        !path
          ? 'Policy draft created'
          : path.endsWith('/approve')
            ? 'Policy approved'
            : path.endsWith('/edit')
              ? 'Policy draft updated'
              : 'Policy published'
      )
    },
  })
  const selected = query.isError
    ? undefined
    : query.data?.revisions.find((policy) => policy.id === selectedId)
  const stale =
    !!selected &&
    selected.definition.standardsSource !== 'POLICY' &&
    selected.selectionId !== query.data?.currentSelectionId
  const actions = selected
    ? policyActions({
        state: selected.state,
        stale,
        canPublish,
        platformAdmin,
        actorId,
        draftedById: selected.draftedById,
        truncated: !!query.data?.truncated,
      })
    : null
  const current = query.data?.revisions.find(
    (policy) =>
      policy.branchRef === selected?.branchRef && policy.state === 'PUBLISHED'
  )
  const workspaceCatalogue = standards.data?.workspaceCatalogue ?? []
  const catalogue = draftCatalogue ?? workspaceCatalogue
  const groups = [
    ...new Map(
      catalogue.map((pack) => [
        pack.id,
        catalogue.filter((v) => v.id === pack.id),
      ])
    ).values(),
  ]
  const draftRules = [
    ...new Map(
      draftPacks
        .flatMap((pack) => pack.rules)
        .map((rule) => [
          rule.id,
          { ...rule, required: rule.requiredIn.includes(profile) },
        ])
    ).values(),
  ]
  const optionalRules = draftRules.filter((rule) => !rule.required)
  const validDraft =
    !!branch.trim() &&
    draftPacks.length > 0 &&
    draftPacks.length <= 5 &&
    (draftCatalogue !== null || (!standards.isPending && !standards.isError))
  const togglePack = (pack: Pack, checked: boolean) => {
    setRequired([])
    setDraftPacks((previous) =>
      checked
        ? [...previous.filter((p) => p.id !== pack.id), pack]
        : previous.filter((p) => p.id !== pack.id)
    )
  }
  const openEdit = async (policy: Revision) => {
    mutation.reset()
    setLoadingEdit(true)
    try {
      const data = await client.fetchQuery({
        queryKey: ['repository-standards', repositoryId, policy.id],
        staleTime: 0,
        queryFn: ({ signal }) =>
          engineeringRead<Standards>(
            repositoryId,
            `/standards?policy=${encodeURIComponent(policy.id)}`,
            signal
          ),
      })
      if (!data.selectionIntegrity)
        throw new Error(
          'Saved standards could not be verified. Create a new policy.'
        )
      setDraftCatalogue([
        ...(data.workspaceCatalogue ?? []),
        ...data.catalogue.filter(
          (pack) =>
            policy.definition.packs.some(
              (ref) => ref.id === pack.id && ref.version === pack.version
            ) &&
            !(data.workspaceCatalogue ?? []).some(
              (available) =>
                available.id === pack.id && available.version === pack.version
            )
        ),
      ])
      setDraftPacks(
        policy.definition.packs.flatMap((ref) =>
          data.catalogue.filter(
            (pack) => pack.id === ref.id && pack.version === ref.version
          )
        )
      )
      setProfile(policy.definition.adoptionProfile ?? 'RECOMMENDED')
      setBranch(branchName(policy.branchRef))
      setRequired(policy.definition.overrides ?? [])
      setEditing(policy)
      setSelectedId(null)
      setDraftOpen(true)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not load policy standards'
      )
    } finally {
      setLoadingEdit(false)
    }
  }
  const openDraft = () => {
    mutation.reset()
    setEditing(null)
    setDraftCatalogue(null)
    setBranch(initialBranch)
    setRequired([])
    setProfile(standards.data?.selection?.profile ?? 'RECOMMENDED')
    const suggested = standards.data?.selection?.packs ?? []
    setDraftPacks(
      suggested
        .flatMap((ref) =>
          workspaceCatalogue.filter(
            (p) => p.id === ref.id && p.version === ref.version
          )
        )
        .slice(0, 5)
    )
    setDraftOpen(true)
  }
  const openReview = (id: string) => {
    mutation.reset()
    setSelectedId(id)
  }
  const failure = mutation.isError ? (
    <p
      role='alert'
      className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
    >
      {mutation.error.message}
    </p>
  ) : null
  return (
    <>
      <Card className='overflow-hidden'>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-4'>
          <div className='flex min-w-0 flex-[1_1_20rem] items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} />
            <div className='min-w-0 space-y-1'>
              <CardTitle asChild>
                <h2>Branch policies</h2>
              </CardTitle>
              <CardDescription>
                Create a draft, review it, then approve and publish.
              </CardDescription>
            </div>
          </div>
          {canDraft && (
            <Button
              size='sm'
              onClick={openDraft}
              disabled={
                query.isPending ||
                query.isError ||
                standards.isPending ||
                standards.isError
              }
            >
              <Plus className='size-4' aria-hidden='true' />
              New policy
            </Button>
          )}
        </CardHeader>
        <CardContent className='space-y-4'>
          {query.isPending ? (
            <p role='status' className='py-6 text-sm text-muted-foreground'>
              Loading policy revisions…
            </p>
          ) : query.isError ? (
            <div
              role='alert'
              className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'
            >
              <p className='text-sm'>{query.error.message}</p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
              {query.data.truncated && (
                <p role='status' className='text-sm text-warning'>
                  Only the latest 50 versions are shown. Publishing is
                  unavailable while the policy history is incomplete.
                </p>
              )}
              {!query.data.revisions.length ? (
                <div className='flex flex-col items-center gap-2 rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center'>
                  <Layers
                    className='mb-1 size-8 text-info'
                    aria-hidden='true'
                  />
                  <p className='text-sm font-medium'>No branch policies yet</p>
                  <p className='max-w-sm text-sm text-muted-foreground'>
                    Choose a branch and the standards it should follow.
                  </p>
                </div>
              ) : (
                <div className='overflow-hidden rounded-xl border'>
                  <Table className='min-w-[600px]'>
                    <TableHeader>
                      <TableRow className='bg-muted/30'>
                        <TableHead className='pl-4'>Branch</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Requirements</TableHead>
                        <TableHead>Standards</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='pr-4 text-right'>
                          <span className='sr-only'>Review</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data.revisions.map((policy) => (
                        <TableRow key={policy.id}>
                          <TableCell className='pl-4'>
                            <span className='flex items-center gap-2 font-medium'>
                              <GitBranch
                                className='size-4 shrink-0 text-info'
                                aria-hidden='true'
                              />
                              <span
                                className='max-w-64 truncate'
                                title={branchName(policy.branchRef)}
                              >
                                {branchName(policy.branchRef)}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className='text-muted-foreground tabular-nums'>
                            v{policy.revision}
                          </TableCell>
                          <TableCell>
                            <span className='font-medium tabular-nums'>
                              {
                                policy.definition.rules.filter(
                                  (rule) => rule.required
                                ).length
                              }
                            </span>
                            <span className='ml-1 text-xs text-muted-foreground'>
                              required
                            </span>
                          </TableCell>
                          <TableCell className='text-muted-foreground tabular-nums'>
                            {policy.definition.packs.length}
                          </TableCell>
                          <TableCell>
                            <PolicyState
                              policy={policy}
                              stale={
                                policy.definition.standardsSource !==
                                  'POLICY' &&
                                policy.selectionId !==
                                  query.data.currentSelectionId
                              }
                            />
                          </TableCell>
                          <TableCell className='pr-4 text-right'>
                            <Button
                              variant='ghost'
                              size='sm'
                              onClick={() => openReview(policy.id)}
                              aria-label={`Review ${branchName(policy.branchRef)} version ${policy.revision}`}
                            >
                              Review
                              <ArrowRight
                                className='size-4'
                                aria-hidden='true'
                              />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className='flex items-start gap-2 text-xs text-muted-foreground'>
                <Info
                  className='mt-0.5 size-3.5 shrink-0 text-info'
                  aria-hidden='true'
                />
                <p>
                  Publishing lets Preflyt evaluate PRs against the approved
                  policy. GitHub blocks merging only after merge protection is
                  explicitly activated.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={draftOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setDraftOpen(open)
        }}
      >
        <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit policy draft' : 'New branch policy'}
            </DialogTitle>
            <DialogDescription>
              Choose a branch and its standards. You can review the policy
              before publishing.
            </DialogDescription>
          </DialogHeader>
          <form
            className='space-y-6'
            onSubmit={(event) => {
              event.preventDefault()
              if (!validDraft || mutation.isPending) return
              const name = branch.trim()
              mutation.mutate({
                path: editing ? `/${encodeURIComponent(editing.id)}/edit` : '',
                body: {
                  ...(editing ? { expectedHash: editing.definitionHash } : {}),
                  branchRef: name.startsWith('refs/heads/')
                    ? name
                    : `refs/heads/${name}`,
                  standards: {
                    profile,
                    packs: draftPacks.map(({ id, version, digest }) => ({
                      id,
                      version,
                      digest,
                    })),
                  },
                  requiredRules: required,
                },
              })
            }}
          >
            <div className='space-y-2'>
              <label
                htmlFor={`policy-branch-${repositoryId}`}
                className='text-sm font-medium'
              >
                Branch name
              </label>
              <Input
                id={`policy-branch-${repositoryId}`}
                disabled={!!editing}
                placeholder='development'
                value={branch}
                maxLength={255}
                onChange={(event) => setBranch(event.target.value)}
                required
              />
            </div>
            <fieldset className='space-y-3'>
              <legend className='text-sm font-medium'>
                Standards{' '}
                <span className='ml-2 text-xs text-muted-foreground'>
                  {draftPacks.length} of 5 selected
                </span>
              </legend>
              <div className='max-h-72 divide-y overflow-y-auto rounded-xl border'>
                {groups.map((versions) => {
                  const selectedPack = draftPacks.find(
                    (p) => p.id === versions[0].id
                  )
                  const pack = selectedPack ?? versions[0]
                  return (
                    <div
                      key={pack.id}
                      className='flex flex-wrap items-center gap-3 p-4'
                    >
                      <label className='flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm'>
                        <Checkbox
                          checked={!!selectedPack}
                          disabled={!selectedPack && draftPacks.length >= 5}
                          onCheckedChange={(checked) =>
                            togglePack(pack, checked === true)
                          }
                        />
                        <span className='min-w-0'>
                          <span className='block font-medium'>
                            {pack.title}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {pack.rules.length} checks
                            {pack.aiChecks?.length
                              ? ` · ${pack.aiChecks.length} AI reviews`
                              : ''}
                          </span>
                        </span>
                      </label>
                      {versions.length > 1 ? (
                        <Select
                          value={pack.version}
                          onValueChange={(version) =>
                            togglePack(
                              versions.find((p) => p.version === version)!,
                              true
                            )
                          }
                          disabled={!selectedPack && draftPacks.length >= 5}
                        >
                          <SelectTrigger
                            aria-label={`${pack.title} version`}
                            className='w-28'
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {versions.map((v) => (
                              <SelectItem key={v.version} value={v.version}>
                                v{v.version}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className='text-xs text-muted-foreground'>
                          v{pack.version}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
              {!groups.length && (
                <p role='status' className='text-sm text-muted-foreground'>
                  No workspace standards yet. Create a standard or copy a
                  built-in template on the Standards page.
                </p>
              )}
              <p className='text-xs text-muted-foreground'>
                Organization and team requirements are included automatically.
                Existing policies keep their saved versions.
              </p>
            </fieldset>
            <details className='rounded-xl border p-4'>
              <summary className='cursor-pointer text-sm font-medium'>
                Check requirements
              </summary>
              <div className='mt-4 space-y-4'>
                <label className='block space-y-2 text-sm'>
                  Requirement level
                  <Select
                    value={profile}
                    onValueChange={(value) => {
                      setProfile(value)
                      setRequired([])
                    }}
                  >
                    <SelectTrigger
                      className='mt-2 w-full'
                      aria-label='Requirement level'
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['DEFAULT', 'RECOMMENDED', 'STRICT'].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value === 'DEFAULT'
                            ? 'Default'
                            : value === 'STRICT'
                              ? 'Strict'
                              : 'Recommended'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                {!!optionalRules.length && (
                  <fieldset className='space-y-3'>
                    <legend className='mb-2 text-sm'>
                      Make additional checks required
                    </legend>
                    {optionalRules.map((rule) => (
                      <label
                        key={rule.id}
                        className='flex items-center gap-3 text-sm'
                      >
                        <Checkbox
                          checked={required.includes(rule.id)}
                          onCheckedChange={(checked) =>
                            setRequired((previous) =>
                              checked === true
                                ? [...new Set([...previous, rule.id])]
                                : previous.filter((id) => id !== rule.id)
                            )
                          }
                        />
                        {rule.title}
                      </label>
                    ))}
                  </fieldset>
                )}
              </div>
            </details>
            {failure}
            <DialogFooter className='gap-3 border-t pt-4'>
              <Button
                type='button'
                variant='outline'
                disabled={mutation.isPending}
                onClick={() => setDraftOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={mutation.isPending || !validDraft}
              >
                {mutation.isPending
                  ? 'Saving…'
                  : editing
                    ? 'Save draft'
                    : 'Create policy'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setSelectedId(null)
        }}
      >
        <SheetContent className='w-full gap-0 sm:max-w-2xl'>
          <SheetHeader className='border-b p-6'>
            <SheetTitle>
              Policy review
              {selected && (
                <span className='ml-2 text-muted-foreground'>
                  · v{selected.revision}
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              {selected
                ? branchName(selected.branchRef)
                : 'This revision is unavailable. Reload policy history.'}
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <div className='flex-1 space-y-5 overflow-y-auto p-6'>
                <div className='flex items-center justify-between gap-3'>
                  <PolicyState policy={selected} stale={stale} />
                  <span className='text-xs text-muted-foreground'>
                    Non-blocking policy
                  </span>
                </div>
                <div className='grid grid-cols-3 divide-x rounded-xl border bg-muted/20'>
                  {[
                    [
                      selected.definition.rules.filter((rule) => rule.required)
                        .length,
                      'Required',
                    ],
                    [
                      selected.definition.rules.filter((rule) => !rule.required)
                        .length,
                      'Optional',
                    ],
                    [selected.definition.packs.length, 'Standards'],
                  ].map(([value, label]) => (
                    <div key={label} className='px-4 py-3'>
                      <p className='text-xl font-semibold tabular-nums'>
                        {value}
                      </p>
                      <p className='text-xs text-muted-foreground'>{label}</p>
                    </div>
                  ))}
                </div>
                <section className='space-y-3'>
                  {selected.definition.teamContext?.length ? (
                    <div className='mb-4 space-y-2 rounded-lg border p-3'>
                      <h3 className='text-sm font-semibold'>
                        Inherited team standards
                      </h3>
                      {selected.definition.teamContext.map((source) => (
                        <p
                          key={source.assignmentId}
                          className='text-sm text-muted-foreground'
                        >
                          {source.teamName ?? 'Team'} · saved assignment
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <h3 className='text-sm font-semibold'>Requirements</h3>
                  <div className='overflow-hidden rounded-xl border'>
                    <Table>
                      <TableHeader>
                        <TableRow className='bg-muted/30'>
                          <TableHead>Check</TableHead>
                          <TableHead>Requirement</TableHead>
                          <TableHead>Support</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.definition.rules.map((rule) => (
                          <TableRow key={rule.id}>
                            <TableCell className='text-sm font-medium whitespace-normal'>
                              {rule.title}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={rule.required ? 'info' : 'neutral'}
                              >
                                {rule.required ? 'Required' : 'Optional'}
                              </StatusBadge>
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {rule.capability === 'available'
                                ? 'Configuration'
                                : rule.capability === 'import_only'
                                  ? 'CI import'
                                  : 'Planned'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
                {!!selected.definition.aiChecks?.length && (
                  <section className='space-y-3'>
                    <h3 className='text-sm font-semibold'>
                      AI Reviews · suggestions only
                    </h3>
                    {selected.definition.aiChecks.map((check) => (
                      <div
                        key={check.id}
                        className='rounded-lg border p-3 text-sm'
                      >
                        <div className='flex items-center justify-between gap-3'>
                          <span className='font-medium'>{check.title}</span>
                          <StatusBadge tone='info'>
                            Suggestions only
                          </StatusBadge>
                        </div>
                        <p className='mt-1 text-xs text-muted-foreground'>
                          Skill v{check.skillVersion} ·{' '}
                          {check.stages
                            .map((s) => s.replace(/_/g, ' '))
                            .join(', ')}
                        </p>
                        <p className='mt-1 font-mono text-xs break-all text-muted-foreground'>
                          {check.skillDigest}
                        </p>
                      </div>
                    ))}
                  </section>
                )}
                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>
                    Saved standard versions
                  </h3>
                  <div className='flex flex-wrap gap-2'>
                    {selected.definition.packs.map((pack) => (
                      <span
                        key={pack.id}
                        className='rounded-md border bg-muted/30 px-2 py-1 text-xs'
                      >
                        <span>{pack.id.replace(/-/g, ' ')}</span>
                        <span className='ml-2 text-muted-foreground'>
                          v{pack.version}
                        </span>
                      </span>
                    ))}
                  </div>
                </section>
                {selected.state === 'PUBLISHED' &&
                  canRequestExceptions !== undefined && (
                    <PolicyExceptions
                      key={selected.id}
                      repositoryId={repositoryId}
                      policy={selected}
                      actorId={actorId}
                      canRequest={canRequestExceptions}
                      canApprove={!!canApproveExceptions}
                    />
                  )}
                <details className='rounded-lg border p-3'>
                  <summary className='cursor-pointer text-xs font-medium text-muted-foreground'>
                    Technical details
                  </summary>
                  <p className='mt-3 text-xs text-muted-foreground'>
                    Definition SHA-256
                  </p>
                  <code className='mt-1 block text-xs break-all'>
                    {selected.definitionHash}
                  </code>
                  <p className='mt-3 text-xs text-muted-foreground'>
                    Branch ref
                  </p>
                  <code className='text-xs'>{selected.branchRef}</code>
                </details>
                {stale && (
                  <p className='rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning'>
                    {selected.state === 'DRAFT'
                      ? 'Standards changed. Edit this draft to use the latest saved standards before approval.'
                      : 'Standards changed. Create a new version before approval or publication.'}
                  </p>
                )}
                {failure}
              </div>
              <SheetFooter className='border-t bg-muted/10 p-6'>
                {selected.state === 'DRAFT' &&
                  actorId === selected.draftedById &&
                  platformAdmin && (
                    <p className='text-xs text-muted-foreground'>
                      Super Admin can approve this revision. This exception is
                      recorded in the audit history.
                    </p>
                  )}
                {['DRAFT', 'APPROVED'].includes(selected.state) && (
                  <p
                    id='policy-action-reason'
                    className='flex items-start gap-2 text-xs text-muted-foreground'
                  >
                    <Info
                      className='size-4 shrink-0 text-info'
                      aria-hidden='true'
                    />
                    {selected.state === 'DRAFT'
                      ? actions?.approvalReason ||
                        'Approve this policy, then publish it. Publishing updates branch requirements for future PR evaluations. Existing GitHub rules may require a passing Preflyt result. Publishing does not create or activate GitHub rules.'
                      : actions?.publicationReason ||
                        'This policy is approved and ready to publish. Publishing updates branch requirements for future PR evaluations. Existing GitHub rules may require a passing Preflyt result. Publishing does not create or activate GitHub rules.'}
                  </p>
                )}
                {selected.state === 'PUBLISHED' && (
                  <div className='space-y-3'>
                    <p className='flex items-center gap-2 text-sm text-success'>
                      <CheckCheck className='size-4' aria-hidden='true' />
                      Policy published
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      Review check sources and a fresh assessment before
                      requesting merge protection. GitHub ruleset activation has
                      its own impact review and approval.
                    </p>
                    <Button size='sm' variant='outline' asChild>
                      <Link
                        to='/quality-gates'
                        search={{
                          repository: repositoryId,
                          gate: 'rulesets',
                          rulesetView: 'drafts',
                        }}
                      >
                        Review merge protection
                        <ArrowRight className='size-4' />
                      </Link>
                    </Button>
                  </div>
                )}
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    variant='outline'
                    disabled={mutation.isPending}
                    onClick={() => setSelectedId(null)}
                  >
                    Close
                  </Button>
                  {canDraft && selected.state === 'DRAFT' && (
                    <Button
                      variant='outline'
                      disabled={mutation.isPending || loadingEdit}
                      onClick={() => void openEdit(selected)}
                    >
                      <Pencil className='size-4' aria-hidden='true' />
                      Edit draft
                    </Button>
                  )}
                  {selected.state === 'DRAFT' && (
                    <Button
                      variant='outline'
                      aria-describedby='policy-action-reason'
                      disabled={mutation.isPending || !actions?.canApprove}
                      onClick={() =>
                        mutation.mutate({
                          path: `/${encodeURIComponent(selected.id)}/approve`,
                          body: { expectedHash: selected.definitionHash },
                        })
                      }
                    >
                      {mutation.isPending ? 'Approving…' : 'Approve policy'}
                    </Button>
                  )}
                  {['DRAFT', 'APPROVED'].includes(selected.state) && (
                    <Button
                      disabled={mutation.isPending || !actions?.canPublish}
                      title={actions?.publicationReason || undefined}
                      onClick={() =>
                        mutation.mutate({
                          path: `/${encodeURIComponent(selected.id)}/publish`,
                          body: {
                            expectedHash: selected.definitionHash,
                            expectedPublishedId: current?.id ?? null,
                          },
                        })
                      }
                    >
                      {mutation.isPending ? 'Publishing…' : 'Publish policy'}
                    </Button>
                  )}
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
