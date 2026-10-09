import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronDown,
  Eye,
  Layers,
  ListChecks,
  Network,
  PanelsTopLeft,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { cn } from '@/lib/utils'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { RelativeTime } from './relative-time'
import {
  useStandards,
  type Pack,
  type Selection,
  type Standards,
} from './repository-queries'
import { sentence } from './repository-vocabulary'
import { Legend, StackedBar, type Segment } from './status-charts'

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

const packIcons: Record<string, typeof Layers> = {
  'baseline-engineering': Layers,
  'application-security': ShieldCheck,
  'backend-service': Server,
  'frontend-application': PanelsTopLeft,
  'infrastructure-as-code': Network,
}

function capabilitySegments(rules: Pack['rules']): Segment[] {
  return [
    {
      key: 'available',
      label: 'Configuration',
      value: rules.filter((rule) => rule.capability === 'available').length,
      tone: 'info',
    },
    {
      key: 'import_only',
      label: 'CI import',
      value: rules.filter((rule) => rule.capability === 'import_only').length,
      tone: 'warning',
    },
    {
      key: 'planned',
      label: 'Planned',
      value: rules.filter(
        (rule) => !['available', 'import_only'].includes(rule.capability)
      ).length,
      tone: 'neutral',
    },
  ]
}

function PackAdoption({
  selected,
  total,
}: {
  selected: number
  total: number
}) {
  const ratio = total ? Math.min(selected / total, 1) : 0
  return (
    <div
      role='img'
      aria-label={`${selected} of ${total} catalogue packs saved`}
      className='relative size-28 shrink-0'
    >
      <svg viewBox='0 0 100 100' className='size-full' aria-hidden='true'>
        <circle
          cx='50'
          cy='50'
          r='40'
          fill='none'
          stroke='currentColor'
          strokeWidth='8'
          className='text-muted'
        />
        <circle
          cx='50'
          cy='50'
          r='40'
          fill='none'
          stroke='currentColor'
          strokeWidth='8'
          pathLength='100'
          strokeDasharray='100 100'
          strokeDashoffset={100 * (1 - ratio)}
          transform='rotate(-90 50 50)'
          className='chart-ring-motion text-chart-1'
        />
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center'>
        <span className='text-2xl font-semibold tracking-tight tabular-nums'>
          {selected}
          <span className='text-sm text-muted-foreground'>/{total}</span>
        </span>
        <span className='text-[10px] text-muted-foreground'>Packs saved</span>
      </div>
    </div>
  )
}

function PackCard({
  pack,
  selected,
  recommended,
}: {
  pack: Pack
  selected: boolean
  recommended: boolean
}) {
  const Icon = packIcons[pack.id] ?? Layers
  const accent = ['application-security', 'backend-service'].includes(pack.id)
    ? 'border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400'
    : 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400'
  const segments = capabilitySegments(pack.rules)
  return (
    <Card className={cn('gap-4 py-5', selected && 'border-chart-1/40')}>
      <CardHeader className='gap-3 px-5'>
        <div className='flex items-start justify-between gap-3'>
          <span
            className={cn(
              'flex size-10 items-center justify-center rounded-lg border',
              accent
            )}
          >
            <Icon aria-hidden='true' className='size-5' />
          </span>
          {selected ? (
            <StatusBadge tone='info'>Selected</StatusBadge>
          ) : recommended ? (
            <StatusBadge tone='info'>Recommended</StatusBadge>
          ) : (
            <StatusBadge tone='neutral'>Available</StatusBadge>
          )}
        </div>
        <div>
          <CardTitle asChild>
            <h3 className='text-sm'>{pack.title}</h3>
          </CardTitle>
          <p className='mt-1 text-xs text-muted-foreground'>v{pack.version}</p>
        </div>
      </CardHeader>
      <CardContent className='space-y-3 px-5'>
        <div>
          <div className='mb-1 flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>Rule capabilities</span>
            <span className='font-medium tabular-nums'>
              {pack.rules.length} rules
            </span>
          </div>
          <StackedBar
            segments={segments}
            label={`${pack.title} rule capabilities`}
          />
          <Legend segments={segments} />
        </div>
        <div className='flex flex-wrap gap-1.5'>
          {pack.stages.map((stage) => (
            <span
              key={stage}
              className='rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground'
            >
              {sentence(stage)}
            </span>
          ))}
        </div>
        <div className='flex items-start justify-between gap-2 border-t pt-2'>
          <details className='group min-w-0 flex-1 text-xs'>
            <summary className='flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring'>
              <ChevronDown
                aria-hidden='true'
                className='size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none'
              />
              Pack details
            </summary>
            <p className='pt-2 leading-relaxed text-muted-foreground'>
              {pack.description}
            </p>
          </details>
          <RulesDialog pack={pack} />
        </div>
      </CardContent>
    </Card>
  )
}

export function RepositoryStandards({
  repositoryId,
  canManage,
  sourceBindings,
}: {
  repositoryId: string
  canManage: boolean
  sourceBindings?: ReactNode
}) {
  const query = useStandards(repositoryId)
  const [editing, setEditing] = useState(false)
  const data = query.data
  const selectedIds = new Set(
    data?.selection?.packs.map((ref) => `${ref.id}@${ref.version}`)
  )
  const recommendedIds = new Set(
    data?.recommendations.map((ref) => `${ref.id}@${ref.version}`)
  )
  const chartPacks =
    data?.catalogue.filter((pack) =>
      (data.selection ? selectedIds : recommendedIds).has(
        `${pack.id}@${pack.version}`
      )
    ) ?? []
  const uniqueRules = [
    ...new Map(
      chartPacks.flatMap((pack) => pack.rules).map((rule) => [rule.id, rule])
    ).values(),
  ]
  const chartSegments = capabilitySegments(uniqueRules)
  const savedPacks =
    data?.catalogue.filter((pack) =>
      selectedIds.has(`${pack.id}@${pack.version}`)
    ).length ?? 0
  const standardsContent = (
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
      <div className='grid gap-5 xl:grid-cols-2'>
        <Card className='gap-4'>
          <CardHeader>
            <CardTitle asChild>
              <h2>Standards adoption</h2>
            </CardTitle>
            <CardDescription>
              {data?.selection
                ? 'Saved requirements for this repository.'
                : 'Choose the requirements for this repository.'}
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
                <div className='flex flex-wrap items-center gap-5'>
                  <PackAdoption
                    selected={savedPacks}
                    total={data.catalogue.length}
                  />
                  <dl className='grid min-w-40 flex-1 grid-cols-2 gap-x-6 gap-y-4 text-sm'>
                    <div>
                      <dt className='text-xs text-muted-foreground'>Profile</dt>
                      <dd className='mt-1 font-medium'>
                        {data.selection
                          ? sentence(data.selection.profile)
                          : 'Not saved'}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-xs text-muted-foreground'>Mode</dt>
                      <dd className='mt-1 flex items-center gap-1.5 font-medium'>
                        <Eye
                          aria-hidden='true'
                          className='size-3.5 text-muted-foreground'
                        />
                        Observe
                      </dd>
                    </div>
                    <div>
                      <dt className='text-xs text-muted-foreground'>
                        Revision
                      </dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {data.selection?.revision ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-xs text-muted-foreground'>Saved</dt>
                      <dd className='mt-1 font-medium'>
                        {data.selection ? (
                          <RelativeTime value={data.selection.createdAt} />
                        ) : (
                          'Never'
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              )
            )}
          </CardContent>
        </Card>
        {data && (
          <Card className='gap-4'>
            <CardHeader>
              <CardTitle asChild>
                <h2>Rule capabilities</h2>
              </CardTitle>
              <CardDescription>
                {data.selection ? 'Saved selection' : 'Recommended preview'} ·
                shared rules counted once.
              </CardDescription>
              <CardAction>
                <Badge variant='neutral'>{uniqueRules.length} rules</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className='space-y-4'>
              <StackedBar
                segments={chartSegments}
                label='Unique rule capabilities'
              />
              <dl className='grid grid-cols-3 gap-3'>
                {chartSegments.map((segment) => (
                  <div
                    key={segment.key}
                    className={cn(
                      'rounded-lg border p-3',
                      segment.key === 'available'
                        ? 'border-blue-500/20 bg-blue-500/5'
                        : segment.key === 'import_only'
                          ? 'border-amber-500/20 bg-amber-500/5'
                          : 'bg-muted/20'
                    )}
                  >
                    <dt className='text-xs text-muted-foreground'>
                      {segment.label}
                    </dt>
                    <dd className='mt-1 text-2xl font-semibold tracking-tight tabular-nums'>
                      {segment.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className='text-xs text-muted-foreground'>
                Configuration and CI import describe evidence paths. Planned
                rules await adapters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      {data && (
        <section aria-labelledby='pack-catalogue-title' className='space-y-3'>
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h2 id='pack-catalogue-title' className='text-base font-semibold'>
                Pack catalogue
              </h2>
              <p className='mt-1 text-xs text-muted-foreground'>
                Explore rule capabilities and select applicable packs.
              </p>
            </div>
            <Badge variant='neutral'>{data.catalogue.length} available</Badge>
          </div>
          <div className='grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3'>
            {data.catalogue.map((pack) => (
              <PackCard
                key={`${pack.id}@${pack.version}`}
                pack={pack}
                selected={selectedIds.has(`${pack.id}@${pack.version}`)}
                recommended={recommendedIds.has(`${pack.id}@${pack.version}`)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
  return sourceBindings ? (
    <Tabs defaultValue='standards' className='space-y-5'>
      <TabsList
        aria-label='Repository policy sections'
        className='h-auto flex-wrap justify-start gap-1'
      >
        <TabsTrigger value='standards' className='gap-2'>
          <Layers aria-hidden='true' className='size-4' />
          Standards
        </TabsTrigger>
        <TabsTrigger value='bindings' className='gap-2'>
          <Workflow aria-hidden='true' className='size-4' />
          CI source bindings
        </TabsTrigger>
      </TabsList>
      <TabsContent value='standards'>{standardsContent}</TabsContent>
      <TabsContent value='bindings'>{sourceBindings}</TabsContent>
    </Tabs>
  ) : (
    standardsContent
  )
}
