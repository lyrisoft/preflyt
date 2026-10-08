import { AlertTriangle, ArrowRight, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/status-badge'
import { RelativeTime } from './relative-time'
import {
  useAssessmentList,
  useCiEvidence,
  useStandards,
  type Profile,
} from './repository-queries'
import {
  ciResultStatus,
  configurationStatus,
  sourceLabel,
  type CiResult,
} from './repository-vocabulary'
import {
  Legend,
  Meter,
  RunStrip,
  StackedBar,
  type Segment,
} from './status-charts'

export type ControlFilter = 'all' | 'review' | 'found'
export type RepositoryTab =
  'overview' | 'standards' | 'assessments' | 'activity'

function Tile({
  label,
  action,
  children,
}: {
  label: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className='flex min-w-0 flex-col gap-3 bg-card p-5'>
      <div className='flex min-h-6 items-center justify-between gap-2'>
        <h2 className='text-sm font-medium text-muted-foreground'>{label}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function TileLink({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      variant='ghost'
      size='sm'
      className='-me-2 h-6 px-2 text-xs text-muted-foreground'
      onClick={onClick}
    >
      {children}
      <ArrowRight aria-hidden='true' className='size-3' />
    </Button>
  )
}

const runWeight: Record<CiResult, number> = {
  FAILED: 1,
  PENDING: 0.7,
  SUCCEEDED: 0.45,
  NOT_EXECUTED: 0.3,
  UNKNOWN: 0.3,
}

/** Posture at a glance: one band, four live readings, no nested cards. */
export function PostureSummary({
  repositoryId,
  profile,
  filter,
  onFilter,
  onOpenTab,
}: {
  repositoryId: string
  profile: Profile | null | undefined
  filter: ControlFilter
  onFilter: (filter: ControlFilter) => void
  onOpenTab: (tab: RepositoryTab) => void
}) {
  const standards = useStandards(repositoryId)
  const ci = useCiEvidence(repositoryId)
  const assessments = useAssessmentList(repositoryId)

  const controls = standards.data?.controls ?? []
  const count = (value: string) =>
    controls.filter((control) => control.configuration === value).length
  const configSegments: Segment[] = [
    { key: 'HINT_DETECTED', ...configurationStatus.HINT_DETECTED },
    { key: 'UNKNOWN', ...configurationStatus.UNKNOWN },
    { key: 'MISSING', ...configurationStatus.MISSING },
  ].map((item) => ({ ...item, value: count(item.key) }))
  const found = configSegments[0].value
  const review = controls.length - found
  const required = controls.filter((control) => control.required)
  const requiredFound = required.filter(
    (control) => control.configuration === 'HINT_DETECTED'
  ).length
  const requiredGaps = required.length - requiredFound
  const advisory = controls.length - required.length
  const ratio = required.length ? requiredFound / required.length : 0

  const observations = ci.data?.observations ?? []
  const runs = [...observations]
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    .slice(-24)
  const ciSegments: Segment[] = (
    ['SUCCEEDED', 'PENDING', 'NOT_EXECUTED', 'FAILED'] as const
  ).map((result) => ({
    key: result,
    ...ciResultStatus[result],
    value: observations.filter((item) =>
      result === 'NOT_EXECUTED'
        ? item.result === 'NOT_EXECUTED' || item.result === 'UNKNOWN'
        : item.result === result
    ).length,
  }))
  const failed = ciSegments[3].value

  const latest = assessments.data?.assessments[0]
  const assessmentCount = assessments.data?.assessments.length ?? 0

  return (
    <Card className='grid gap-px overflow-hidden bg-border py-0 sm:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr_1fr]'>
      <Tile
        label='Control configuration'
        action={
          filter !== 'all' && (
            <TileLink onClick={() => onFilter('all')}>Show all</TileLink>
          )
        }
      >
        {standards.isPending ? (
          <p className='text-sm text-muted-foreground'>Loading controls…</p>
        ) : standards.isError ? (
          <p className='text-sm text-destructive'>{standards.error.message}</p>
        ) : (
          <>
            <p className='flex items-baseline gap-2'>
              <span className='text-4xl leading-none font-semibold tracking-tight'>
                {review}
              </span>
              <span className='text-sm text-muted-foreground'>
                of {controls.length} controls need review
              </span>
            </p>
            <StackedBar
              segments={configSegments}
              label='Control configuration'
            />
            <Legend
              segments={configSegments}
              active={filter === 'found' ? 'HINT_DETECTED' : undefined}
              onSelect={(key) =>
                onFilter(key === 'HINT_DETECTED' ? 'found' : 'review')
              }
            />
          </>
        )}
      </Tile>
      <Tile label='Required controls'>
        {standards.data && (
          <>
            <p className='flex items-baseline gap-1'>
              <span className='text-3xl leading-none font-semibold tracking-tight'>
                {requiredFound}
              </span>
              <span className='text-lg text-muted-foreground'>
                / {required.length}
              </span>
              <span className='ms-1 text-sm text-muted-foreground'>
                config found
              </span>
            </p>
            <Meter
              value={requiredFound}
              max={required.length}
              label='Required controls with configuration found'
              tone={
                ratio === 1 ? 'success' : ratio >= 0.5 ? 'warning' : 'error'
              }
            />
            {requiredGaps ? (
              <button
                type='button'
                onClick={() => onFilter('review')}
                className='flex items-center gap-1.5 text-start text-xs font-medium text-amber-700 hover:underline dark:text-amber-400'
              >
                <AlertTriangle aria-hidden='true' className='size-3.5' />
                {requiredGaps} required{' '}
                {requiredGaps === 1 ? 'control needs' : 'controls need'} review
              </button>
            ) : (
              <p className='flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400'>
                <CircleCheck aria-hidden='true' className='size-3.5' />
                Every required control has config
              </p>
            )}
            <p className='text-xs text-muted-foreground'>
              {standards.data.selection
                ? `${advisory} advisory · ${standards.data.selection.profile.toLowerCase()} profile`
                : 'Recommended preview · no selection saved'}
            </p>
          </>
        )}
      </Tile>
      <Tile
        label='CI results'
        action={
          <TileLink onClick={() => onOpenTab('activity')}>Activity</TileLink>
        }
      >
        {ci.isPending ? (
          <p className='text-sm text-muted-foreground'>Loading CI results…</p>
        ) : ci.isError ? (
          <p className='text-sm text-destructive'>{ci.error.message}</p>
        ) : observations.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {ci.data.enabled
              ? 'No CI results received yet.'
              : 'GitHub event collection is off for this deployment.'}
          </p>
        ) : (
          <>
            <p className='flex items-baseline gap-2'>
              <span className='text-3xl leading-none font-semibold tracking-tight'>
                {failed}
              </span>
              <span className='text-sm text-muted-foreground'>
                failed of {observations.length} recent
              </span>
            </p>
            <RunStrip
              label={`Last ${runs.length} CI results, oldest first`}
              runs={runs.map((item) => ({
                key: item.deliveryId,
                tone: ciResultStatus[item.result].tone,
                weight: runWeight[item.result],
                label: `${sourceLabel(item.sourceKind, item.sourceObjectId)} · ${ciResultStatus[item.result].label} · ${new Date(item.observedAt).toLocaleString()}`,
              }))}
            />
            <Legend segments={ciSegments} />
          </>
        )}
      </Tile>
      <Tile
        label='Assessments'
        action={
          <TileLink onClick={() => onOpenTab('assessments')}>Open</TileLink>
        }
      >
        {assessments.isPending ? (
          <p className='text-sm text-muted-foreground'>Loading assessments…</p>
        ) : assessments.isError ? (
          <p className='text-sm text-destructive'>
            {assessments.error.message}
          </p>
        ) : latest ? (
          <>
            <p className='flex items-baseline gap-2'>
              <span className='text-3xl leading-none font-semibold tracking-tight'>
                {assessmentCount}
              </span>
              <span className='text-sm text-muted-foreground'>
                snapshot{assessmentCount === 1 ? '' : 's'}
              </span>
            </p>
            <p className='text-sm'>
              Latest <RelativeTime value={latest.createdAt} /> at{' '}
              <code className='text-xs'>{latest.sourceSha.slice(0, 7)}</code>
            </p>
            {profile &&
              (latest.sourceSha === profile.sourceSha ? (
                <StatusBadge tone='success'>Matches profile commit</StatusBadge>
              ) : (
                <StatusBadge tone='warning'>Older than profile</StatusBadge>
              ))}
          </>
        ) : (
          <>
            <p className='text-sm text-muted-foreground'>
              No snapshots yet. Freeze standards and CI results at a commit to
              compare over time.
            </p>
          </>
        )}
      </Tile>
    </Card>
  )
}
