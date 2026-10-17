import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ShieldCheck,
  CheckCircle2,
  CircleAlert,
  FileQuestion,
  ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table } from '@/components/ui/table'
import { SurfaceIcon } from '@/components/surface-icon'
import { paginateCollection } from './pull-request-pagination'

export type Compliance = {
  eligiblePrs: number
  completePrs: number
  passingPrs: number
  blockedPrs: number
  incompletePrs: number
  unassessedPrs: number
  stalePrs: number
  passRate: number | null
  coverage: number | null
  mixedBaselines: boolean
  truncated: boolean
  rowsTruncated: boolean
  repositories: { id: string; githubId: string; fullName: string }[]
  baselines: {
    selectionId: string
    repositoryId: string
    revision: number | null
    complete: number
    passed: number
    firstEvaluated: number
    firstPassed: number
    passRate: number | null
    firstRecordedPassRate: number | null
  }[]
  rows: {
    repositoryId: string
    number: number
    sourceSha: string
    status: string
    assessmentId: string | null
    selectionId: string | null
    requiredRules: number | null
    passedRules: number | null
    blockedRules: number | null
    missingRules: number | null
    assessedAt: string | null
  }[]
}
const percent = (n: number | null) => (n === null ? 'Not available' : `${n}%`)
const statuses: Record<string, { title: string; className: string }> = {
  PASS: {
    title: 'Required checks met',
    className:
      'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400',
  },
  BLOCK: {
    title: 'Failed required checks',
    className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  },
  BLOCK_INCOMPLETE: {
    title: 'Failed checks · missing evidence',
    className: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  },
  INCOMPLETE: {
    title: 'Missing evidence',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  INVALID: {
    title: 'Assessment could not be verified',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  UNKNOWN: {
    title: 'PR revision unclear',
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  STALE: {
    title: 'Newer commit needs assessment',
    className: 'bg-muted text-muted-foreground',
  },
  UNASSESSED: {
    title: 'Not assessed',
    className: 'bg-muted text-muted-foreground',
  },
}
export function PolicyComplianceSummary({
  data,
  period,
  onEvidence,
}: {
  data: Compliance | null
  period: { from: string; to: string }
  onEvidence: () => void
}) {
  const gaps = data
    ? data.incompletePrs + data.unassessedPrs + data.stalePrs
    : 0
  return (
    <Card className='h-full min-w-0 gap-3 border-primary/20'>
      <CardHeader className='flex flex-col items-start gap-3'>
        <div className='flex w-full min-w-0 items-start gap-3'>
          <SurfaceIcon icon={ShieldCheck} tone='teal' />
          <div className='min-w-0 flex-1 space-y-1'>
            <CardTitle>Policy Compliance</CardTitle>
            <p className='text-xs text-muted-foreground'>
              {new Date(period.from).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })}
              –
              {new Date(period.to).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
              })}{' '}
              · Authorized repositories
            </p>
          </div>
        </div>
        <Button size='sm' variant='outline' onClick={onEvidence}>
          View evidence
          <ArrowRight className='size-3.5' />
        </Button>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-4'>
        {!data ? (
          <p className='text-sm text-muted-foreground'>
            You need contributor policy evidence permission to view compliance.
          </p>
        ) : !data.eligiblePrs ? (
          <p className='rounded-lg border border-dashed p-5 text-sm text-muted-foreground'>
            No authored PRs match this period and repository filter. Broaden the
            period or import recent GitHub activity. Compliance is not
            available.
          </p>
        ) : (
          <>
            <div className='grid flex-1 auto-rows-fr grid-cols-2 gap-3'>
              {[
                {
                  label: 'Pass rate',
                  value: data.mixedBaselines
                    ? 'By version'
                    : data.passRate === null
                      ? '—'
                      : percent(data.passRate),
                  detail: `${data.passingPrs}/${data.completePrs} fully assessed PRs`,
                  icon: CheckCircle2,
                  color: 'text-teal-600 dark:text-teal-400',
                },
                {
                  label: 'PRs fully assessed',
                  value: percent(data.coverage),
                  detail: `${data.completePrs}/${data.eligiblePrs} PRs assessed`,
                  icon: ShieldCheck,
                  color: 'text-primary',
                },
                {
                  label: 'PRs with failed required checks',
                  value: String(data.blockedPrs),
                  detail: '',
                  icon: CircleAlert,
                  color: 'text-red-600 dark:text-red-400',
                },
                {
                  label: 'Missing evidence',
                  value: String(gaps),
                  detail: `${data.unassessedPrs} not assessed · ${data.stalePrs} older assessments`,
                  icon: FileQuestion,
                  color: 'text-amber-600 dark:text-amber-400',
                },
              ].map((metric) => (
                <div
                  key={metric.label}
                  className='rounded-lg border bg-muted/15 p-3'
                >
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-xs text-muted-foreground'>
                      {metric.label}
                    </p>
                    <metric.icon
                      className={`size-4 shrink-0 ${metric.color}`}
                    />
                  </div>
                  <p
                    aria-label={`${metric.label}: ${metric.value === '—' ? 'Not available' : metric.value}`}
                    className={`mt-2 text-lg font-semibold tabular-nums 2xl:text-xl ${metric.value === '—' || metric.value === 'By version' ? 'text-muted-foreground' : metric.color}`}
                  >
                    {metric.value}
                  </p>
                  {metric.detail && (
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {metric.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {data.truncated && (
              <p className='text-sm text-amber-600 dark:text-amber-400'>
                Collection limit reached. Percentages are hidden; narrow the
                period or repository.
              </p>
            )}
            {data.baselines.length > 0 && (
              <details className='text-xs text-muted-foreground'>
                <summary className='cursor-pointer'>
                  Compliance by standards version
                </summary>{' '}
                <div className='mt-3 overflow-x-auto'>
                  <Table className='w-full text-left text-xs'>
                    <caption className='mb-2 text-left font-medium'>
                      Compliance by saved standards version
                    </caption>
                    <thead>
                      <tr className='border-b text-muted-foreground'>
                        <th className='py-2 pr-4'>Repository / version</th>
                        <th className='py-2 pr-4'>First recorded assessment</th>
                        <th className='py-2'>Latest recorded revision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.baselines.map((b) => (
                        <tr
                          key={b.selectionId}
                          className='border-b last:border-0'
                        >
                          <td className='py-3 pr-4'>
                            {
                              data.repositories.find(
                                (r) => r.id === b.repositoryId
                              )?.fullName
                            }
                            <span className='mt-1 block text-muted-foreground'>
                              Standards{' '}
                              {b.revision === null
                                ? b.selectionId.slice(0, 8)
                                : `revision ${b.revision}`}
                            </span>
                          </td>
                          <td className='py-3 pr-4 tabular-nums'>
                            {percent(b.firstRecordedPassRate)}
                            <span className='mt-1 block text-muted-foreground'>
                              {b.firstPassed}/{b.firstEvaluated} fully assessed
                              PRs
                            </span>
                          </td>
                          <td className='py-3 tabular-nums'>
                            {percent(b.passRate)}
                            <span className='mt-1 block text-muted-foreground'>
                              {b.passed}/{b.complete} fully assessed PRs
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
export function PolicyComplianceEvidence({
  data,
  page = 1,
  onPageChange,
}: {
  data: Compliance | null
  page?: number
  onPageChange: (page: number) => void
}) {
  const [pageSize, setPageSize] = useState(10)
  if (!data)
    return (
      <p className='text-sm text-muted-foreground'>
        Policy evidence permission is required.
      </p>
    )
  if (!data.rows.length)
    return (
      <p className='text-sm text-muted-foreground'>
        No authored PR evidence in this period.
      </p>
    )

  return (
    <div className='space-y-3'>
      {data.rowsTruncated && (
        <p className='text-xs text-muted-foreground'>
          Showing the first 200 PRs. Narrow the filters for a smaller evidence
          set.
        </p>
      )}
      <div className='overflow-x-auto'>
        <Table
          pagination={{
            page,
            pageSize,
            total: data.rows.length,
            onPageChange,
            onPageSizeChange: (size) => {
              setPageSize(size)
              onPageChange(1)
            },
          }}
          className='w-full text-left text-sm'
        >
          <thead>
            <tr className='border-b text-xs text-muted-foreground'>
              <th className='p-3'>Pull request</th>
              <th className='p-3'>Required checks</th>
              <th className='p-3'>Result</th>
              <th className='p-3'>Assessment</th>
            </tr>
          </thead>
          <tbody>
            {paginateCollection(data.rows, page, pageSize).items.map((row) => {
              const repo = data.repositories.find(
                (r) => r.id === row.repositoryId
              )!
              const status = statuses[row.status] ?? statuses.UNKNOWN
              return (
                <tr
                  key={`${row.repositoryId}:${row.number}`}
                  className='border-b last:border-0'
                >
                  <td className='p-3'>
                    <a
                      className='font-medium text-primary hover:underline'
                      href={`https://github.com/${repo.fullName}/pull/${row.number}`}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {repo.fullName} #{row.number}
                    </a>
                    <p
                      className='mt-1 font-mono text-xs text-muted-foreground'
                      title={row.sourceSha}
                    >
                      {row.sourceSha.slice(0, 12)}
                    </p>
                  </td>
                  <td className='p-3 text-xs'>
                    {row.requiredRules === null
                      ? 'Not available'
                      : `${row.passedRules}/${row.requiredRules} met · ${row.blockedRules} failed · ${row.missingRules} missing`}
                  </td>
                  <td className='p-3'>
                    <Badge variant='outline' className={status.className}>
                      {status.title}
                    </Badge>
                  </td>
                  <td className='p-3'>
                    {row.assessmentId ? (
                      <Link
                        to='/repositories/$repositoryId'
                        params={{ repositoryId: repo.githubId }}
                        search={{
                          tab: 'assessments',
                          assessment: row.assessmentId,
                        }}
                        className='text-xs text-primary hover:underline'
                      >
                        View assessment
                      </Link>
                    ) : (
                      <span className='text-xs text-muted-foreground'>
                        Assess the latest recorded commit
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>
    </div>
  )
}
