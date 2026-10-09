import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import {
  useNavigationSession,
  canAdminister,
} from '../workspace/navigation-session'

export type ReviewSkill = {
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
>
export function SkillsCatalogue() {
  const session = useNavigationSession(),
    manage = canAdminister(session.data?.role),
    approve =
      manage ||
      ['POLICY_MANAGER', 'SECURITY_ENGINEER'].includes(session.data?.role ?? '')
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
    [reviewed, setReviewed] = useState(false),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const data = query.isError ? undefined : query.data,
    filtered =
      data?.skills.filter((s) =>
        `${s.name} ${s.status}`.toLowerCase().includes(filter.toLowerCase())
      ) ?? [],
    pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages)
  async function action(path: string, body: unknown) {
    setBusy(true)
    setError('')
    try {
      await governanceRequest('/ai/skills' + path, body)
      setEditing(undefined)
      setSelected(undefined)
      await client.invalidateQueries({ queryKey: key })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save skill')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='flex items-center gap-2 font-semibold'>
          <BookOpen className='size-4' />
          Review skills
        </h2>
        {manage && (
          <Button
            size='sm'
            onClick={() => {
              setError('')
              setEditing(null)
            }}
          >
            <Plus className='size-4' />
            Create skill
          </Button>
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
          {manage && (
            <div className='grid gap-3 sm:grid-cols-2'>
              {data.templates.map((t) => (
                <div
                  key={t.name}
                  className='flex items-center justify-between gap-4 rounded-lg border p-4'
                >
                  <div>
                    <h3 className='text-sm font-medium'>{t.name}</h3>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {t.description}
                    </p>
                  </div>
                  <Button
                    size='sm'
                    variant='outline'
                    className='shrink-0'
                    disabled={busy}
                    onClick={() => {
                      setError('')
                      setEditing(t)
                    }}
                  >
                    Use template
                  </Button>
                </div>
              ))}
            </div>
          )}
          <Input
            className='max-w-xs'
            aria-label='Filter skills'
            placeholder='Filter skills…'
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setPage(1)
            }}
          />
          <div className='overflow-x-auto rounded-xl border'>
            <table className='w-full text-left text-sm'>
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
                {filtered.slice((current - 1) * 10, current * 10).map((s) => (
                  <tr key={s.id} className='border-t'>
                    <td className='px-4 py-3'>
                      <p className='font-medium'>{s.name}</p>
                      <p className='mt-1 max-w-sm text-xs text-muted-foreground'>
                        {s.description}
                      </p>
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
                      colSpan={5}
                      className='p-8 text-center text-muted-foreground'
                    >
                      No review skills yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav
              aria-label='Skill pages'
              className='flex items-center justify-end gap-3 text-sm'
            >
              <span>
                Page {current} of {pages}
              </span>
              <Button
                size='sm'
                variant='outline'
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                Previous
              </Button>
              <Button
                size='sm'
                variant='outline'
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy) setSelected(undefined)
        }}
      >
        <SheetContent className='flex w-full flex-col sm:max-w-xl'>
          <SheetHeader>
            <SheetTitle>
              {selected?.name} · v{selected?.version}
            </SheetTitle>
            <SheetDescription>
              Read-only assessment evidence review
            </SheetDescription>
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
                  <dt className='text-muted-foreground'>Content digest</dt>
                  <dd className='font-mono text-xs break-all'>
                    {selected.contentDigest}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className='mb-2 text-sm font-semibold'>Instructions</h3>
                <p className='rounded-lg border p-4 text-sm whitespace-pre-wrap'>
                  {selected.instructions}
                </p>
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
              <div className='flex flex-wrap justify-end gap-2'>
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
                      size='sm'
                      variant='outline'
                      disabled={busy}
                      onClick={() =>
                        void action(`/${selected.id}/retire`, {
                          expectedDigest: selected.contentDigest,
                          reviewed: false,
                        })
                      }
                    >
                      Retire
                    </Button>
                    <Button
                      size='sm'
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
      </Sheet>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(undefined)
        }}
      >
        <DialogContent className='max-h-[90svh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
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
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
function SkillForm({
  skill,
  repositories,
  busy,
  error,
  save,
}: {
  skill: Template | ReviewSkill | null
  repositories: { githubId: string; fullName: string }[]
  busy: boolean
  error: string
  save: (body: unknown) => void
}) {
  const [stages] = useState(skill?.stages ?? ['repository', 'pull_request']),
    [ids, setIds] = useState(skill?.repositories ?? []),
    [filter, setFilter] = useState('')
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    save({
      name: f.get('name'),
      description: f.get('description'),
      instructions: f.get('instructions'),
      source: f.get('source'),
      license: f.get('license'),
      stages,
      repositories: ids,
      expectedVersion: skill && 'version' in skill ? skill.version : 0,
      ...(skill && 'skillKey' in skill ? { skillKey: skill.skillKey } : {}),
    })
  }
  return (
    <form onSubmit={submit} className='space-y-4'>
      <label className='block space-y-2 text-sm'>
        <span>Name</span>
        <Input
          name='name'
          placeholder='Security evidence review'
          required
          maxLength={100}
          defaultValue={skill?.name}
        />
      </label>
      <label className='block space-y-2 text-sm'>
        <span>Description</span>
        <Input
          name='description'
          placeholder='Explain failed security checks and missing evidence'
          required
          maxLength={400}
          defaultValue={skill?.description}
        />
      </label>
      <label className='block space-y-2 text-sm'>
        <span>Instructions</span>
        <Textarea
          name='instructions'
          placeholder='Review the supplied evidence and cite each relevant check…'
          className='min-h-32'
          required
          maxLength={6000}
          defaultValue={skill?.instructions}
        />
      </label>
      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='block space-y-2 text-sm'>
          <span>Source</span>
          <Input
            name='source'
            placeholder='Organization-authored instructions'
            required
            maxLength={300}
            defaultValue={skill?.source ?? 'Organization-authored instructions'}
          />
        </label>
        <label className='block space-y-2 text-sm'>
          <span>License</span>
          <Input
            name='license'
            placeholder='Organization-owned or MIT'
            required
            maxLength={100}
            defaultValue={skill?.license ?? 'Organization-owned'}
          />
        </label>
      </div>

      <fieldset className='space-y-2 text-sm'>
        <legend className='mb-2 font-medium'>Repository scope</legend>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={!ids.length}
            onChange={() => setIds([])}
          />
          All authorized repositories
        </label>
        <Input
          aria-label='Filter assigned repositories'
          placeholder='Filter repositories…'
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className='max-h-32 space-y-2 overflow-y-auto'>
          {repositories
            .filter((r) =>
              r.fullName.toLowerCase().includes(filter.toLowerCase())
            )
            .map((r) => (
              <label key={r.githubId} className='flex items-center gap-2'>
                <input
                  type='checkbox'
                  checked={ids.includes(r.githubId)}
                  onChange={(e) =>
                    setIds(
                      e.target.checked
                        ? [...ids, r.githubId]
                        : ids.filter((id) => id !== r.githubId)
                    )
                  }
                />
                {r.fullName}
              </label>
            ))}
        </div>
      </fieldset>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      <div className='flex justify-end'>
        <Button disabled={busy || !stages.length}>Save draft</Button>
      </div>
    </form>
  )
}
