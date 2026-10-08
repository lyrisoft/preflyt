import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ListChecks,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
  SheetTrigger,
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
import { RelativeTime } from './relative-time'
import {
  useStandards,
  type Pack,
  type Selection,
  type Standards,
} from './repository-queries'
import { sentence } from './repository-vocabulary'

const profileHints: Record<string, string> = {
  DEFAULT: 'Core requirements only.',
  RECOMMENDED: 'Core requirements plus broader evidence.',
  STRICT: 'Adds resilience requirements.',
}

function SelectionEditor({
  data,
  repositoryId,
  onSaved,
}: {
  data: Standards
  repositoryId: string
  onSaved: () => void
}) {
  const client = useQueryClient()
  const [profile, setProfile] = useState(
    data.selection?.profile ?? 'RECOMMENDED'
  )
  const [selected, setSelected] = useState(
    data.selection?.packs ??
      data.recommendations.map(({ id, version }) => ({ id, version }))
  )
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/standards`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile,
            packs: selected,
            expectedSelectionId: data.selection?.id ?? null,
          }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Selection changed. Reload before saving.'
            : 'Could not save standards. Check your session and repository access.'
        )
      return response.json() as Promise<Selection>
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ['repository-standards', repositoryId],
      })
      onSaved()
    },
  })
  return (
    <>
      <div className='flex-1 space-y-5 overflow-y-auto px-4'>
        <label className='block space-y-2 text-sm'>
          <span className='font-medium'>Adoption profile</span>
          <Select
            value={profile}
            onValueChange={setProfile}
            disabled={mutation.isPending}
          >
            <SelectTrigger aria-label='Adoption profile' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.adoptionProfiles.map((value) => (
                <SelectItem key={value} value={value}>
                  {sentence(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className='block text-xs text-muted-foreground'>
            {profileHints[profile] ?? ''} All profiles stay in observe mode.
          </span>
        </label>
        <fieldset className='space-y-2'>
          <legend className='mb-2 text-sm font-medium'>Packs</legend>
          <ul className='divide-y rounded-md border'>
            {data.catalogue.map((pack) => {
              const recommendation = data.recommendations.find(
                (ref) => ref.id === pack.id
              )
              return (
                <li key={pack.id}>
                  <label className='flex cursor-pointer items-start gap-3 p-3 hover:bg-muted/50'>
                    <Checkbox
                      className='mt-0.5'
                      disabled={mutation.isPending}
                      checked={selected.some(
                        (ref) =>
                          ref.id === pack.id && ref.version === pack.version
                      )}
                      onCheckedChange={(checked) =>
                        setSelected((refs) =>
                          checked
                            ? [
                                ...refs.filter((ref) => ref.id !== pack.id),
                                { id: pack.id, version: pack.version },
                              ]
                            : refs.filter((ref) => ref.id !== pack.id)
                        )
                      }
                    />
                    <span className='min-w-0 flex-1 text-sm'>
                      <span className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>{pack.title}</span>
                        <span className='text-xs text-muted-foreground'>
                          v{pack.version}
                        </span>
                        {recommendation && (
                          <StatusBadge tone='info'>Recommended</StatusBadge>
                        )}
                      </span>
                      <span className='mt-0.5 block text-xs text-muted-foreground'>
                        {recommendation?.reason ?? pack.description}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
        {mutation.error && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
      <SheetFooter className='border-t'>
        <Button
          disabled={mutation.isPending || selected.length === 0}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Saving…' : 'Save selection'}
        </Button>
      </SheetFooter>
    </>
  )
}

function RulesDialog({ pack }: { pack: Pack }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='touch-target h-7 px-2 text-xs'
          aria-label={`View ${pack.title} rules`}
        >
          <ListChecks aria-hidden='true' />
          {pack.rules.length} rules
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {pack.title} v{pack.version}
          </DialogTitle>
          <DialogDescription>
            {pack.description} Stages: {pack.stages.map(sentence).join(', ')}.
          </DialogDescription>
        </DialogHeader>
        <ul className='-mx-6 max-h-[60vh] divide-y overflow-y-auto border-y'>
          {pack.rules.map((rule) => (
            <li key={rule.id} className='space-y-1 px-6 py-3 text-sm'>
              <div className='flex flex-wrap items-center gap-2'>
                <span className='font-medium'>{rule.title}</span>
                <Badge variant='neutral'>{sentence(rule.capability)}</Badge>
              </div>
              <p className='text-muted-foreground'>{rule.guidance}</p>
              <p className='text-xs text-muted-foreground'>
                <code>{rule.id}</code> · required in{' '}
                {rule.requiredIn.map((value) => sentence(value)).join(', ')}
              </p>
            </li>
          ))}
        </ul>
        <p className='font-mono text-xs break-all text-muted-foreground'>
          SHA-256 {pack.digest}
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function RepositoryStandards({
  repositoryId,
  canManage,
}: {
  repositoryId: string
  canManage: boolean
}) {
  const query = useStandards(repositoryId)
  const [editing, setEditing] = useState(false)
  const data = query.data
  const selectedIds = new Set(
    data?.selection?.packs.map((ref) => `${ref.id}@${ref.version}`)
  )
  const recommendedIds = new Set(data?.recommendations.map((ref) => ref.id))
  return (
    <div className='space-y-5'>
      {data && !data.selectionIntegrity && (
        <div
          role='alert'
          className='flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm'
        >
          <AlertTriangle
            aria-hidden='true'
            className='mt-0.5 size-4 shrink-0 text-destructive'
          />
          Saved pack definitions do not match their recorded digests. Controls
          are not evaluated until supported versions are saved again.
        </div>
      )}
      <Card className='gap-4'>
        <CardHeader>
          <CardTitle asChild>
            <h2>Standards selection</h2>
          </CardTitle>
          <CardDescription>
            Packs that define this repository&apos;s controls.
          </CardDescription>
          <CardAction className='flex gap-2'>
            <Button
              variant='outline'
              size='icon'
              className='touch-target size-8'
              aria-label='Reload standards'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
            </Button>
            {canManage && data && (
              <Sheet open={editing} onOpenChange={setEditing}>
                <SheetTrigger asChild>
                  <Button size='sm'>
                    <SlidersHorizontal aria-hidden='true' />
                    {data.selection ? 'Edit selection' : 'Choose packs'}
                  </Button>
                </SheetTrigger>
                <SheetContent className='gap-0 sm:max-w-md'>
                  <SheetHeader>
                    <SheetTitle>Standards selection</SheetTitle>
                    <SheetDescription>
                      Choose a profile and the packs that apply to this
                      repository.
                    </SheetDescription>
                  </SheetHeader>
                  <SelectionEditor
                    key={data.selection?.id ?? 'unsaved'}
                    data={data}
                    repositoryId={repositoryId}
                    onSaved={() => setEditing(false)}
                  />
                </SheetContent>
              </Sheet>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {query.isPending ? (
            <p role='status' className='text-sm text-muted-foreground'>
              Loading standards…
            </p>
          ) : query.isError ? (
            <p role='alert' className='text-sm text-destructive'>
              {query.error.message}
            </p>
          ) : (
            data && (
              <dl className='grid gap-px overflow-hidden rounded-md border bg-border text-sm sm:grid-cols-4'>
                {[
                  [
                    'Profile',
                    data.selection
                      ? sentence(data.selection.profile)
                      : 'Not saved',
                  ],
                  [
                    'Packs selected',
                    `${data.selection?.packs.length ?? 0} of ${data.catalogue.length}`,
                  ],
                  ['Mode', 'Observe'],
                  [
                    'Saved',
                    data.selection ? (
                      <>
                        <RelativeTime value={data.selection.createdAt} /> ·
                        revision {data.selection.revision}
                      </>
                    ) : (
                      'Never'
                    ),
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className='bg-card px-4 py-3'>
                    <dt className='text-xs text-muted-foreground'>{label}</dt>
                    <dd className='mt-1 font-medium'>{value}</dd>
                  </div>
                ))}
              </dl>
            )
          )}
        </CardContent>
      </Card>
      {data && (
        <Card className='gap-4'>
          <CardHeader>
            <CardTitle asChild>
              <h2>Pack catalogue</h2>
            </CardTitle>
            <CardDescription>
              First-party packs available in this deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className='px-0'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='ps-6'>Pack</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Stages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className='pe-6 text-end'>Rules</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.catalogue.map((pack) => (
                  <TableRow key={pack.id}>
                    <TableCell className='max-w-[26rem] min-w-56 ps-6 whitespace-normal'>
                      <p className='font-medium'>{pack.title}</p>
                      <p className='mt-0.5 text-xs text-muted-foreground'>
                        {pack.description}
                      </p>
                    </TableCell>
                    <TableCell className='text-muted-foreground tabular-nums'>
                      v{pack.version}
                    </TableCell>
                    <TableCell className='text-xs text-muted-foreground'>
                      {pack.stages.map(sentence).join(', ')}
                    </TableCell>
                    <TableCell>
                      {selectedIds.has(`${pack.id}@${pack.version}`) ? (
                        <StatusBadge tone='success'>Selected</StatusBadge>
                      ) : recommendedIds.has(pack.id) ? (
                        <StatusBadge tone='info'>Recommended</StatusBadge>
                      ) : (
                        <StatusBadge tone='neutral'>Available</StatusBadge>
                      )}
                    </TableCell>
                    <TableCell className='pe-6 text-end'>
                      <RulesDialog pack={pack} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
