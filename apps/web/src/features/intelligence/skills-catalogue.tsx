import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Plus, Save, Pencil, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Table } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { AiIndicator } from '@/components/ai-indicator'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { governanceRequest } from '../repositories/governance-api'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { SkillUpload, MarkdownInstructions } from './skill-markdown'
import {
  downloadSkillMarkdown,
  skillLimits,
  type SkillDocument,
} from './skill-markdown-file'
import { UpstreamSkill } from './upstream-skill'

export type ReviewSkill = {
  languages?: string[]
  frameworks?: string[]
  id: string
  skillKey: string
  version: number
  name: string
  description: string
  instructions: string
  stages: string[]
  repositories: string[]
  source: string
  license: string
  contentDigest: string
  status: string
  enabled: boolean
}
type Template = Omit<
  ReviewSkill,
  'id' | 'skillKey' | 'version' | 'contentDigest' | 'status' | 'enabled'
> & {
  id?: string
  category?: string
  checks?: string[]
  checkIds?: string[]
  purpose?: 'workflow_edit'
  version?: number
}

export function SkillsCatalogue() {
  const retireTrigger = useRef<HTMLButtonElement>(null)
  const session = useNavigationSession(),
    manage = canPerform(session.data, 'ai.skills.manage'),
    approve = canPerform(session.data, 'ai.skills.approve')
  const key = [
      'review-skills',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    client = useQueryClient()
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      governanceRequest<{ skills: ReviewSkill[]; templates: Template[] }>(
        '/ai/skills',
        undefined,
        signal
      ),
    retry: false,
  })
  const repositories = useQuery({
    queryKey: [
      'skill-repositories',
      session.data?.identityId,
      session.data?.organizationId,
    ],
    queryFn: ({ signal }) =>
      governanceRequest<{
        repositories: {
          githubId: string
          fullName: string
          selected: boolean
        }[]
      }>('/github/repositories', undefined, signal),
    enabled: manage,
    retry: false,
  })
  const [editing, setEditing] = useState<
      Template | ReviewSkill | null | undefined
    >(),
    [selected, setSelected] = useState<ReviewSkill>(),
    [retireOpen, setRetireOpen] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [downloading, setDownloading] = useState(false),
    [library, setLibrary] = useState<string>(),
    [preview, setPreview] = useState<Template>()
  const data = query.isError ? undefined : query.data,
    filtered =
      data?.skills.filter((s) =>
        `${s.name} ${s.status}`.toLowerCase().includes(filter.toLowerCase())
      ) ?? [],
    activeLibrary =
      library ?? (data?.skills.length ? 'organization' : 'builtin'),
    builtin =
      data?.templates.filter((t) =>
        `${t.name} ${t.description} ${t.category ?? ''} ${t.checks?.join(' ') ?? ''}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      ) ?? [],
    builtinPages = Math.max(1, Math.ceil(builtin.length / 6)),
    builtinPage = Math.min(page, builtinPages)
  async function action(path: string, body: unknown) {
    setBusy(true)
    setError('')
    try {
      await governanceRequest('/ai/skills' + path, body)
      if (path.endsWith('/retire')) toast.success('Skill version retired')
      setRetireOpen(false)
      setEditing(undefined)
      setSelected(undefined)
      await client.invalidateQueries({ queryKey: key })
      setLibrary('organization')
      setFilter('')
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save skill')
      if (path.endsWith('/retire'))
        toast.error(
          e instanceof Error ? e.message : 'Could not retire skill version'
        )
    } finally {
      setBusy(false)
    }
  }
  async function adoptBuiltin(template: Template) {
    if (!template.id || template.purpose === 'workflow_edit') return
    setBusy(true)
    setError('')
    try {
      const skill = await governanceRequest<ReviewSkill>(
        `/ai/skills/builtins/${encodeURIComponent(template.id)}/use`,
        {}
      )
      await client.invalidateQueries({ queryKey: key })
      setPreview(undefined)
      setSelected(skill)
      setLibrary('organization')
      setFilter('')
      setPage(1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use skill')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <SurfaceIcon icon={Sparkles} tone='violet' size='sm' />
          <h2 className='text-base font-semibold'>Skills</h2>
        </div>
        {manage && (
          <div className='flex flex-wrap items-center gap-2'>
            <UpstreamSkill
              disabled={busy || editing !== undefined}
              onDocument={setEditing}
            />
            <SkillUpload
              disabled={busy || editing !== undefined}
              onDocument={setEditing}
              onError={setError}
            />
            <Button
              size='sm'
              disabled={busy}
              onClick={() => {
                setError('')
                setEditing(null)
              }}
            >
              <Plus className='size-4' />
              Create skill
            </Button>
          </div>
        )}
      </div>
      {query.isPending && <p role='status'>Loading skills…</p>}
      {query.isError && (
        <p role='alert' className='text-sm text-destructive'>
          Skills unavailable. Refresh and try again.
        </p>
      )}
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {data && (
        <>
          <Tabs
            value={activeLibrary}
            onValueChange={(value) => {
              setLibrary(value)
              setFilter('')
              setPage(1)
            }}
          >
            <TabsList aria-label='Skill libraries'>
              <TabsTrigger value='organization'>
                Organization skills
              </TabsTrigger>
              <TabsTrigger value='builtin'>Built-in skills</TabsTrigger>
            </TabsList>
            <Input
              className='max-w-xs'
              aria-label='Filter skills'
              placeholder={
                activeLibrary === 'builtin'
                  ? 'Filter by skill or check…'
                  : 'Filter skills…'
              }
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value)
                setPage(1)
              }}
            />
            {activeLibrary === 'builtin' ? (
              <TabsContent value='builtin'>
                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {builtin
                    .slice((builtinPage - 1) * 6, builtinPage * 6)
                    .map((t) => (
                      <Card key={t.id ?? t.name} className='min-w-0 gap-3'>
                        <CardHeader className='flex flex-row items-start gap-3'>
                          <SurfaceIcon icon={Sparkles} tone='violet' />
                          <div className='min-w-0 flex-1 space-y-1'>
                            <h3 className='text-sm leading-snug font-semibold'>
                              {t.name}
                            </h3>
                            {t.category && (
                              <p className='text-xs text-muted-foreground'>
                                {t.category}
                              </p>
                            )}
                          </div>
                          <StatusBadge tone='neutral'>Built-in</StatusBadge>
                        </CardHeader>
                        <CardContent className='flex-1 space-y-3'>
                          <p className='text-sm leading-5 text-muted-foreground'>
                            {t.description}
                          </p>
                          {t.purpose === 'workflow_edit' && (
                            <p className='border-t pt-3 text-xs text-muted-foreground'>
                              v{t.version} ·{' '}
                              {
                                'Used automatically when creating or updating workflows in Policies.'
                              }
                            </p>
                          )}
                          {t.checks?.length ? (
                            <div className='border-t pt-3'>
                              <p className='mb-2 text-xs font-medium text-muted-foreground'>
                                Checks reviewed
                              </p>
                              <ul className='space-y-1.5 text-xs leading-5'>
                                {t.checks.map((check) => (
                                  <li key={check}>{check}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </CardContent>
                        <CardFooter className='flex-wrap justify-end gap-2 border-t'>
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={busy}
                            onClick={() => {
                              setError('')
                              setPreview(t)
                            }}
                            aria-label={`View ${t.name}`}
                          >
                            View
                          </Button>
                          {manage && t.purpose !== 'workflow_edit' && (
                            <Button
                              size='sm'
                              onClick={() => void adoptBuiltin(t)}
                              aria-label={`Use ${t.name}`}
                              disabled={busy || !t.id}
                            >
                              <Plus className='size-3.5' />
                              Use skill
                            </Button>
                          )}
                        </CardFooter>
                      </Card>
                    ))}
                </div>
                {!builtin.length && (
                  <p className='rounded-xl border p-8 text-center text-sm text-muted-foreground'>
                    No built-in skills match this filter.
                  </p>
                )}
                <nav
                  aria-label='Built-in skill pages'
                  className='flex items-center justify-end gap-3 text-sm'
                >
                  <span>
                    Page {builtinPage} of {builtinPages}
                  </span>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={builtinPage === 1}
                    onClick={() => setPage(builtinPage - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={builtinPage === builtinPages}
                    onClick={() => setPage(builtinPage + 1)}
                  >
                    Next
                  </Button>
                </nav>
              </TabsContent>
            ) : (
              <TabsContent value='organization'>
                <div className='overflow-x-auto rounded-xl border'>
                  <Table className='w-full text-left text-sm'>
                    <thead className='bg-muted/40 text-muted-foreground'>
                      <tr>
                        {['Skill', 'Version', 'Status', 'Actions'].map((t) => (
                          <th key={t} className='px-4 py-3 font-medium'>
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr
                          key={s.id}
                          className='border-t transition-colors hover:bg-muted/20'
                        >
                          <td className='px-4 py-3'>
                            <div className='flex items-center gap-3'>
                              <SurfaceIcon
                                icon={Sparkles}
                                tone='violet'
                                size='sm'
                              />
                              <div className='min-w-0'>
                                <p className='font-semibold'>{s.name}</p>
                                <p className='mt-1 max-w-sm text-xs leading-5 text-muted-foreground'>
                                  {s.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className='px-4 py-3'>v{s.version}</td>

                          <td className='px-4 py-3'>
                            <StatusBadge
                              tone={
                                s.enabled
                                  ? 'success'
                                  : s.status === 'DRAFT'
                                    ? 'warning'
                                    : 'neutral'
                              }
                            >
                              {s.enabled
                                ? 'Enabled'
                                : s.status === 'DRAFT'
                                  ? 'Draft'
                                  : s.status === 'RETIRED'
                                    ? 'Retired'
                                    : 'Approved'}
                            </StatusBadge>
                          </td>
                          <td className='px-4 py-3'>
                            <Button
                              size='sm'
                              variant='outline'
                              onClick={() => {
                                setError('')
                                setReviewed(false)
                                setSelected(s)
                              }}
                            >
                              Review
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!filtered.length && (
                        <tr>
                          <td
                            colSpan={4}
                            className='p-8 text-center text-muted-foreground'
                          >
                            No review skills yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined)
        }}
      >
        <DialogContent className='flex max-h-[85svh] flex-col sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AiIndicator decorative />
              {preview?.name}
            </DialogTitle>
          </DialogHeader>
          {preview?.purpose === 'workflow_edit' && (
            <p className='text-xs text-muted-foreground'>
              v{preview.version} ·{' '}
              {
                'Used automatically when creating or updating workflows in Policies.'
              }
            </p>
          )}
          {preview && (
            <div className='min-h-0 overflow-y-auto'>
              <MarkdownInstructions>
                {preview.instructions}
              </MarkdownInstructions>
            </div>
          )}
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          {preview && (
            <div className='flex justify-end gap-2'>
              {preview.id && (
                <Button
                  variant='outline'
                  disabled={downloading}
                  onClick={async () => {
                    setError('')
                    setDownloading(true)
                    try {
                      await downloadSkillMarkdown(preview.id!, 'builtin')
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Could not download SKILL.md'
                      )
                    } finally {
                      setDownloading(false)
                    }
                  }}
                >
                  <Download className='size-4' />
                  Download SKILL.md
                </Button>
              )}
              {manage && preview.purpose !== 'workflow_edit' && (
                <Button
                  variant='outline'
                  onClick={() => {
                    setEditing(preview)
                    setPreview(undefined)
                  }}
                >
                  <Pencil className='size-4' />
                  Create separate copy
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(undefined)
        }}
      >
        {selected && (
          <SheetContent
            className='flex w-full flex-col sm:max-w-xl'
            onCloseAutoFocus={(event) => {
              if (editing !== undefined) event.preventDefault()
            }}
          >
            <SheetHeader>
              <SheetTitle className='flex items-center gap-2'>
                <AiIndicator decorative />
                {selected?.name} · v{selected?.version}
              </SheetTitle>
              <SheetDescription>Read-only review instructions</SheetDescription>
            </SheetHeader>
            {selected && (
              <div className='flex-1 space-y-5 overflow-y-auto px-6 pb-6'>
                <p className='text-sm'>{selected.description}</p>
                <dl className='space-y-2 text-sm'>
                  <div>
                    <dt className='text-muted-foreground'>Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>License</dt>
                    <dd>{selected.license}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Repositories</dt>
                    <dd>
                      {selected.repositories.length
                        ? selected.repositories
                            .map(
                              (id) =>
                                repositories.data?.repositories.find(
                                  (r) => r.githubId === id
                                )?.fullName ?? id
                            )
                            .join(', ')
                        : 'All authorized repositories'}
                    </dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>File fingerprint</dt>
                    <dd className='font-mono text-xs break-all'>
                      {selected.contentDigest}
                    </dd>
                  </div>
                </dl>
                <div>
                  <h3 className='mb-2 text-sm font-semibold'>Instructions</h3>
                  <Tabs defaultValue='preview'>
                    <TabsList>
                      <TabsTrigger value='preview'>Preview</TabsTrigger>
                      <TabsTrigger value='markdown'>Markdown</TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value='preview'
                      className='rounded-lg border p-4'
                    >
                      <MarkdownInstructions>
                        {selected.instructions}
                      </MarkdownInstructions>
                    </TabsContent>
                    <TabsContent value='markdown'>
                      <pre className='rounded-lg border p-4 font-mono text-xs break-words whitespace-pre-wrap'>
                        {selected.instructions}
                      </pre>
                    </TabsContent>
                  </Tabs>
                </div>
                {approve && selected.status === 'DRAFT' && (
                  <label className='flex items-start gap-2 text-sm'>
                    <input
                      type='checkbox'
                      className='mt-1'
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I reviewed the instructions, source and license for this
                    version.
                  </label>
                )}
                {error && (
                  <p role='alert' className='text-sm text-destructive'>
                    {error}
                  </p>
                )}
                <div className='flex flex-wrap justify-end gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={busy || downloading}
                    aria-busy={downloading}
                    onClick={async () => {
                      setDownloading(true)
                      setError('')
                      try {
                        await downloadSkillMarkdown(selected.id)
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : 'Could not download SKILL.md'
                        )
                      } finally {
                        setDownloading(false)
                      }
                    }}
                  >
                    {downloading ? (
                      <Loader2
                        aria-hidden='true'
                        className='size-4 animate-spin motion-reduce:animate-none'
                      />
                    ) : (
                      <Download aria-hidden='true' className='size-4' />
                    )}
                    Download SKILL.md
                  </Button>
                  {manage && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={busy}
                      onClick={() => {
                        setSelected(undefined)
                        setEditing(selected)
                      }}
                    >
                      Create new version
                    </Button>
                  )}
                  {approve && selected.status === 'DRAFT' && (
                    <Button
                      size='sm'
                      disabled={busy || !reviewed}
                      onClick={() =>
                        void action(`/${selected.id}/approve`, {
                          expectedDigest: selected.contentDigest,
                          reviewed,
                        })
                      }
                    >
                      Approve version
                    </Button>
                  )}
                  {manage && selected.status === 'APPROVED' && (
                    <>
                      <Button
                        ref={retireTrigger}
                        size='sm'
                        variant='destructive'
                        disabled={busy}
                        onClick={() => {
                          setError('')
                          setRetireOpen(true)
                        }}
                      >
                        Retire this version
                      </Button>
                      <Button
                        size='sm'
                        variant={selected.enabled ? 'outline' : 'default'}
                        disabled={busy}
                        onClick={() =>
                          void action(
                            `/${selected.id}/${selected.enabled ? 'disable' : 'enable'}`,
                            {
                              expectedDigest: selected.contentDigest,
                              reviewed: false,
                            }
                          )
                        }
                      >
                        {selected.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        )}
      </Sheet>
      <AlertDialog
        open={retireOpen && !!selected}
        onOpenChange={(open) => {
          if (!busy) setRetireOpen(open)
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            if (selected) {
              event.preventDefault()
              retireTrigger.current?.focus()
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Retire this skill version?</AlertDialogTitle>
            <AlertDialogDescription>
              Retiring {selected?.name} v{selected?.version} disables it and
              makes it unavailable for new AI reviews. This cannot be undone. To
              use these instructions again, create, approve and enable a new
              version. Existing saved reviews stay unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role='alert' className='text-sm text-destructive'>
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={busy}
              onClick={(event) => {
                event.preventDefault()
                if (selected)
                  void action(`/${selected.id}/retire`, {
                    expectedDigest: selected.contentDigest,
                    reviewed: false,
                  })
              }}
            >
              {busy ? 'Retiring…' : 'Retire version permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(undefined)
        }}
      >
        <DialogContent className='flex max-h-[90svh] flex-col overflow-hidden sm:max-w-5xl'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AiIndicator decorative />
              {editing && 'version' in editing
                ? 'Create new skill version'
                : 'Create review skill'}
            </DialogTitle>
          </DialogHeader>
          {editing !== undefined && (
            <SkillForm
              key={editing?.name ?? 'new'}
              skill={editing}
              busy={busy}
              error={error}
              repositories={
                repositories.isError
                  ? []
                  : (repositories.data?.repositories.filter(
                      (r) => r.selected
                    ) ?? [])
              }
              save={(body) => void action('', body)}
              cancel={() => setEditing(undefined)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
function skillDocument(skill: Template | ReviewSkill): SkillDocument {
  return {
    ...(skill.languages?.length ? { languages: [...skill.languages] } : {}),
    ...(skill.frameworks?.length ? { frameworks: [...skill.frameworks] } : {}),
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    stages: [...skill.stages],
    repositories: [...skill.repositories],
    source: skill.source,
    license: skill.license,
  }
}
function SkillForm({
  skill,
  repositories,
  busy,
  error,
  save,
  cancel,
}: {
  skill: Template | ReviewSkill | null
  repositories: { githubId: string; fullName: string }[]
  busy: boolean
  error: string
  save: (body: unknown) => void
  cancel: () => void
}) {
  const [draft, setDraft] = useState<SkillDocument>(
      skill
        ? skillDocument(skill)
        : {
            name: '',
            description: '',
            instructions: '',
            stages: ['repository', 'pull_request'],
            repositories: [],
            source: 'Organization-authored instructions',
            license: 'Organization-owned',
          }
    ),
    [selectors, setSelectors] = useState({
      languages: skill?.languages?.join(', ') ?? '',
      frameworks: skill?.frameworks?.join(', ') ?? '',
    }),
    [filter, setFilter] = useState(''),
    [tab, setTab] = useState('write'),
    [importError, setImportError] = useState('')
  function field(
    key: 'name' | 'description' | 'source' | 'license' | 'instructions',
    value: string
  ) {
    setDraft((d) => ({ ...d, [key]: value }))
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    save({
      ...draft,
      expectedVersion: skill && 'version' in skill ? skill.version : 0,
      ...(skill && 'skillKey' in skill ? { skillKey: skill.skillKey } : {}),
    })
  }
  const ready =
    [
      draft.name,
      draft.description,
      draft.instructions,
      draft.source,
      draft.license,
    ].every((v) => v.trim()) && draft.stages.length > 0
  return (
    <form onSubmit={submit} className='flex min-h-0 flex-1 flex-col gap-5'>
      <div className='grid min-h-0 gap-6 overflow-y-auto md:grid-cols-[280px_minmax(0,1fr)]'>
        <div className='space-y-4'>
          {(
            [
              ['name', 'Name', 'Security evidence review', 100],
              [
                'description',
                'Description',
                'Explain failed checks and missing evidence',
                skillLimits.description,
              ],
              ['source', 'Source', 'Organization-authored instructions', 300],
              ['license', 'License', 'Organization-owned or MIT', 100],
            ] as const
          ).map(([key, label, placeholder, maxLength]) => (
            <div key={key} className='space-y-2 text-sm'>
              <label htmlFor={`skill-${key}`}>{label}</label>
              <Input
                id={`skill-${key}`}
                name={key}
                aria-describedby={
                  key === 'description' ? 'skill-description-count' : undefined
                }
                placeholder={placeholder}
                required
                maxLength={maxLength}
                value={draft[key]}
                disabled={busy}
                onChange={(e) => field(key, e.target.value)}
              />
              {key === 'description' && (
                <span
                  id='skill-description-count'
                  className='block text-xs text-muted-foreground'
                >
                  {draft.description.length.toLocaleString()}/
                  {skillLimits.description.toLocaleString()} characters
                </span>
              )}
            </div>
          ))}
          {(['languages', 'frameworks'] as const).map((key) => (
            <label key={key} className='block space-y-2 text-sm'>
              <span>
                {key === 'languages'
                  ? 'Languages (optional)'
                  : 'Frameworks (optional)'}
              </span>
              <Input
                disabled={busy}
                placeholder={
                  key === 'languages' ? 'TypeScript, Python' : 'React, NestJS'
                }
                value={selectors[key]}
                onChange={(e) => {
                  setSelectors((old) => ({ ...old, [key]: e.target.value }))
                  setDraft((d) => ({
                    ...d,
                    [key]: e.target.value
                      .split(',')
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }))
                }}
              />
            </label>
          ))}
          <fieldset className='space-y-2 text-sm' disabled={busy}>
            <legend className='mb-2 font-medium'>
              Repositories this skill applies to
            </legend>
            <label className='flex items-center gap-2'>
              <input
                type='checkbox'
                checked={!draft.repositories.length}
                onChange={() => setDraft((d) => ({ ...d, repositories: [] }))}
              />
              All authorized repositories
            </label>
            <Input
              aria-label='Filter assigned repositories'
              placeholder='Filter repositories…'
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className='max-h-28 space-y-2 overflow-y-auto'>
              {repositories
                .filter((r) =>
                  r.fullName.toLowerCase().includes(filter.toLowerCase())
                )
                .map((r) => (
                  <label key={r.githubId} className='flex items-center gap-2'>
                    <input
                      type='checkbox'
                      checked={draft.repositories.includes(r.githubId)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          repositories: e.target.checked
                            ? [...d.repositories, r.githubId]
                            : d.repositories.filter((id) => id !== r.githubId),
                        }))
                      }
                    />
                    {r.fullName}
                  </label>
                ))}
            </div>
          </fieldset>
        </div>
        <div className='flex min-w-0 flex-col gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <h3 className='text-sm font-semibold'>Instructions</h3>
            <SkillUpload
              disabled={busy}
              label='Replace from SKILL.md'
              onError={setImportError}
              onDocument={(d) => {
                setDraft(d)
                setSelectors({
                  languages: d.languages?.join(', ') ?? '',
                  frameworks: d.frameworks?.join(', ') ?? '',
                })
                setTab('write')
              }}
            />
          </div>
          <Tabs
            value={tab}
            onValueChange={setTab}
            className='flex min-h-72 flex-1 flex-col'
          >
            <TabsList className='self-start'>
              <TabsTrigger value='write'>Write</TabsTrigger>
              <TabsTrigger value='preview'>Preview</TabsTrigger>
            </TabsList>
            <TabsContent value='write' className='flex flex-1 flex-col'>
              <Textarea
                aria-label='Instructions'
                name='instructions'
                placeholder={
                  '# Review instructions\n\n- Review the supplied evidence.\n- Cite the check behind each finding.'
                }
                className='min-h-72 flex-1 resize-none font-mono text-sm'
                maxLength={skillLimits.instructions}
                value={draft.instructions}
                disabled={busy}
                onChange={(e) => field('instructions', e.target.value)}
              />
            </TabsContent>
            <TabsContent
              value='preview'
              className='max-h-[420px] min-h-72 flex-1 overflow-y-auto rounded-lg border p-4'
            >
              {draft.instructions ? (
                <MarkdownInstructions>
                  {draft.instructions}
                </MarkdownInstructions>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Write instructions to preview them here.
                </p>
              )}
            </TabsContent>
          </Tabs>
          <p className='text-right text-xs text-muted-foreground'>
            {draft.instructions.length.toLocaleString()}/
            {skillLimits.instructions.toLocaleString()} characters
          </p>
        </div>
      </div>
      {(error || importError) && (
        <p role='alert' className='text-sm text-destructive'>
          {error || importError}
        </p>
      )}
      <div className='flex shrink-0 justify-end gap-2 border-t pt-4'>
        <Button
          type='button'
          variant='outline'
          disabled={busy}
          onClick={cancel}
        >
          Cancel
        </Button>
        <Button disabled={busy || !ready} aria-busy={busy}>
          {busy ? (
            <Loader2
              aria-hidden='true'
              className='size-4 animate-spin motion-reduce:animate-none'
            />
          ) : (
            <Save aria-hidden='true' className='size-4' />
          )}
          Save draft
        </Button>
      </div>
    </form>
  )
}
