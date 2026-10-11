import { useRef, useState } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/status-badge'
import { governanceRequest } from '../repositories/governance-api'
import { Paging, PickList } from './team-controls'
import type { Detail, Options, Impact } from './teams-page'

export function TeamPolicyAssignment({
  team,
  options,
  onApplied,
}: {
  team: Detail
  options: Options
  onApplied: () => Promise<void>
}) {
  const [branch, setBranch] = useState(
    options.repositories.find((r) =>
      team.repositories.some(
        (scope) => scope.id === r.id && scope.policyScopeEnabled
      )
    )?.defaultBranch ?? 'main'
  )
  const [profile, setProfile] = useState('RECOMMENDED')
  const [packs, setPacks] = useState<string[]>(() => {
    const baseline =
      options.standards.find((p) => p.id === 'baseline-engineering') ??
      options.standards[0]
    return baseline ? [`${baseline.id}@${baseline.version}`] : []
  })
  const [replacement, setReplacement] = useState('new')
  const [impact, setImpact] = useState<Impact | null>(null)
  const [page, setPage] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const input = {
    branchRef: branch.trim().startsWith('refs/heads/')
      ? branch.trim()
      : `refs/heads/${branch.trim()}`,
    ...(replacement !== 'new' ? { replacesAssignmentId: replacement } : {}),
    profile,
    packs: packs.map((value) => {
      const [id, version] = value.split('@')
      return { id, version }
    }),
  }
  const inputRevision = useRef(0)
  function invalidatePreview() {
    inputRevision.current += 1
    setImpact(null)
  }
  async function run(apply = false) {
    if (apply && (!impact || impact.conflicts || !impact.repositories.length))
      return
    const requestedRevision = inputRevision.current
    setBusy(true)
    setError('')
    try {
      if (apply) {
        await governanceRequest(`/teams/${team.id}/assign`, {
          ...input,
          expectedPreviewHash: impact?.previewHash,
        })
        setImpact(null)
        setReplacement('new')
        toast.success('Policy drafts created')
        await onApplied()
      } else {
        const result = await governanceRequest<Impact>(
          `/teams/${team.id}/preview`,
          input
        )
        if (inputRevision.current === requestedRevision) {
          setImpact(result)
          setPage(1)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className='space-y-5'>
      <div className='flex items-center gap-2'>
        <ShieldCheck className='size-4 text-muted-foreground' />
        <h3 className='font-semibold'>Assign standards</h3>
      </div>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      )}
      {!!team.assignments.filter((a) => !a.supersededAt).length && (
        <label className='block space-y-2 text-sm font-medium'>
          Assignment
          <Select
            value={replacement}
            disabled={busy}
            onValueChange={(value) => {
              setReplacement(value)
              invalidatePreview()
              const previous = team.assignments.find((a) => a.id === value)
              if (previous) {
                setBranch(previous.branchRef.replace('refs/heads/', ''))
                setProfile(previous.profile)
                setPacks(
                  previous.packs.map((ref) => {
                    const latest =
                      options.standards.find((p) => p.id === ref.id) ?? ref
                    return `${latest.id}@${latest.version}`
                  })
                )
              }
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='new'>New assignment</SelectItem>
              {team.assignments
                .filter((a) => !a.supersededAt)
                .map((a) => (
                  <SelectItem value={a.id} key={a.id}>
                    Upgrade {a.branchRef.replace('refs/heads/', '')} ·{' '}
                    {new Date(a.createdAt).toLocaleString()}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </label>
      )}
      <fieldset disabled={busy} className='grid gap-4 sm:grid-cols-2'>
        <label className='space-y-2 text-sm font-medium'>
          Branch
          <Input
            value={branch}
            placeholder='main'
            onChange={(e) => {
              setBranch(e.target.value)
              invalidatePreview()
            }}
          />
        </label>
        <label className='space-y-2 text-sm font-medium'>
          Requirement level
          <Select
            value={profile}
            onValueChange={(value) => {
              setProfile(value)
              invalidatePreview()
            }}
          >
            <SelectTrigger className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['DEFAULT', 'RECOMMENDED', 'STRICT'].map((p) => (
                <SelectItem key={p} value={p}>
                  {p === 'DEFAULT' ? 'Core' : p[0] + p.slice(1).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </fieldset>
      <p className='text-sm text-muted-foreground'>
        {team.repositories.filter((r) => r.policyScopeEnabled).length} approved{' '}
        {team.repositories.filter((r) => r.policyScopeEnabled).length === 1
          ? 'repository'
          : 'repositories'}{' '}
        in {team.name}. Repository scope changes stay in Teams.
      </p>
      <PickList
        label='Standards'
        items={options.standards.map((p) => ({
          id: `${p.id}@${p.version}`,
          name: `${p.title} · v${p.version}`,
        }))}
        selected={packs}
        disabled={busy}
        onChange={(values) => {
          setPacks(values)
          invalidatePreview()
        }}
      />
      <div className='flex justify-end'>
        <Button
          size='sm'
          variant='outline'
          disabled={busy || !branch.trim() || !packs.length || packs.length > 5}
          onClick={() => void run()}
        >
          {busy ? 'Working…' : 'Preview impact'}
          <ArrowRight className='size-4' />
        </Button>
      </div>
      {impact && (
        <div className='space-y-3 border-t pt-4'>
          <h4 className='text-sm font-semibold'>
            Impact · {impact.repositories.length}{' '}
            {impact.repositories.length === 1 ? 'repository' : 'repositories'}
          </h4>
          <p className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'>
            Applying saves new repository standards and creates policy drafts.
            Review check sources, run fresh assessments, then approve and
            publish in Policies.
          </p>
          {!impact.repositories.length && (
            <p role='alert' className='text-sm text-warning'>
              No repositories are included. Review the approved scope in Teams,
              then preview again.
            </p>
          )}
          {impact.repositories.slice((page - 1) * 10, page * 10).map((r) => (
            <div
              className='space-y-2 rounded-lg border p-3 text-sm'
              key={r.githubId}
            >
              <div className='flex flex-wrap justify-between gap-2'>
                <span className='font-medium'>{r.name}</span>
                <StatusBadge tone={r.conflicts.length ? 'error' : 'warning'}>
                  {r.conflicts.length ? 'Conflict' : 'Draft ready'}
                </StatusBadge>
              </div>
              <p className='text-xs text-muted-foreground'>
                {r.addedChecks.length
                  ? [...new Set(r.addedChecks)].join(', ')
                  : 'No additional checks'}{' '}
                · {r.profile.toLowerCase()} requirements
              </p>
              {r.conflicts.map((c) => (
                <p key={c} className='text-xs text-destructive'>
                  {c}
                </p>
              ))}
            </div>
          ))}
          <Paging
            page={page}
            total={impact.repositories.length}
            onChange={setPage}
          />
          <div className='flex justify-end'>
            <Button
              size='sm'
              disabled={busy || impact.conflicts || !impact.repositories.length}
              onClick={() => void run(true)}
            >
              Apply and create drafts
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
