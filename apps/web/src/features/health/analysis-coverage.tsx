import { useState } from 'react'
import { ChevronLeft, ChevronRight, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ResultTimestamp } from '@/components/result-timestamp'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { RelativeTime } from '@/features/repositories/relative-time'
import {
  healthLabel,
  healthReasons,
  healthTone,
  type HealthData,
  type HealthReport,
} from './health-api'

const pageSize = 4

type Analysis = HealthReport['analyses'][number]

function outcomeSummary(analysis: Analysis, report: HealthReport) {
  if (analysis.state === 'INCOMPLETE' || analysis.state === 'UNAVAILABLE') {
    const reason =
      healthReasons[analysis.reason] ??
      analysis.reason.replace(/_/g, ' ').toLowerCase()
    return analysis.findingsRetained
      ? `${analysis.findingsRetained} findings retained · ${reason}`
      : reason
  }
  if (
    analysis.id === 'quality.duplication' &&
    report.measurements?.duplication &&
    report.measurements.duplication.analyzedLines > 0
  ) {
    const measured = report.measurements.duplication
    return `${((100 * measured.duplicatedLines) / measured.analyzedLines).toFixed(1)}% duplicated · ${measured.analyzedFiles.toLocaleString()} files analyzed`
  }
  if (
    analysis.id === 'tests.coverage' &&
    report.measurements?.coverage &&
    report.measurements.coverage.analyzedLines > 0
  ) {
    const measured = report.measurements.coverage
    return `${((100 * measured.coveredLines) / measured.analyzedLines).toFixed(1)}% covered · ${measured.tests} tests passed`
  }
  if (analysis.fileAnalysis) {
    return `${analysis.fileAnalysis.analyzedFiles} / ${analysis.fileAnalysis.candidateFiles} candidate files analyzed`
  }
  if (analysis.findingsRetained !== undefined) {
    return `${analysis.findingsRetained.toLocaleString()} findings retained in the recorded scope`
  }
  return (
    healthReasons[analysis.reason] ??
    analysis.reason.replace(/_/g, ' ').toLowerCase()
  )
}

export function AnalysisCoverage({
  report,
  assessmentId,
  assessmentReason,
  hotspotReview,
  headCheckedAt,
  finishedAt,
}: {
  report: HealthReport
  assessmentId: string
  assessmentReason: string | null
  hotspotReview: HealthData['hotspotReview']
  headCheckedAt: string | null | undefined
  finishedAt?: string | null
}) {
  const [pagination, setPagination] = useState({ assessmentId: '', page: 1 })
  const pages = Math.max(1, Math.ceil(report.analyses.length / pageSize))
  const currentPage = Math.min(
    pagination.assessmentId === assessmentId ? pagination.page : 1,
    pages
  )
  const start = (currentPage - 1) * pageSize
  const completed = report.analyses.filter((analysis) =>
    ['PASS', 'FAIL'].includes(analysis.state)
  ).length
  const notice = assessmentReason
    ? (healthReasons[assessmentReason] ??
      'Analysis evidence is incomplete. Review the recorded outcomes.')
    : null

  return (
    <Card className='gap-0 overflow-hidden py-0' aria-label='Analysis coverage'>
      <CardHeader className='gap-2 border-b p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={ScanLine} tone='teal' size='sm' />
            <div>
              <CardTitle>Analysis coverage</CardTitle>
              <CardDescription className='mt-1'>
                {report.mode === 'INSPECTION_ONLY'
                  ? 'Inspection only · no analyzer ran'
                  : 'Recorded analyzer outcomes for this assessment'}
              </CardDescription>
            </div>
          </div>
          <dl className='flex flex-wrap gap-x-5 gap-y-2 text-xs'>
            <div>
              <dt className='text-muted-foreground'>Findings retained</dt>
              <dd className='mt-0.5 font-semibold tabular-nums'>
                {report.mode === 'EXECUTED'
                  ? report.findings.length.toLocaleString()
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Analyses completed</dt>
              <dd className='mt-0.5 font-semibold tabular-nums'>
                {completed} / {report.analyses.length}
              </dd>
            </div>
            <div>
              <dt className='text-muted-foreground'>Files discovered</dt>
              <dd className='mt-0.5 font-semibold tabular-nums'>
                {report.inspection.fileCount.toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
        {notice && (
          <p className='text-xs leading-relaxed text-muted-foreground'>
            {notice}
          </p>
        )}
      </CardHeader>
      <CardContent className='px-5 py-4'>
        {report.analyses.length ? (
          <>
            <div className='grid gap-3 md:grid-cols-2'>
              {report.analyses
                .slice(start, start + pageSize)
                .map((analysis) => (
                  <details
                    key={analysis.id}
                    className='group min-w-0 self-start rounded-xl border bg-muted/10'
                  >
                    <summary className='cursor-pointer list-none rounded-xl p-4 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden'>
                      <span className='flex flex-wrap items-start justify-between gap-2'>
                        <span className='text-sm font-medium'>
                          {analysis.title}
                        </span>
                        <StatusBadge tone={healthTone(analysis.state)}>
                          {healthLabel(analysis.state)}
                        </StatusBadge>
                      </span>
                      <span className='mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground'>
                        {outcomeSummary(analysis, report)}
                      </span>
                      <span className='mt-2 block text-xs text-muted-foreground'>
                        Report completed{' '}
                        <ResultTimestamp
                          value={
                            report.mode === 'EXECUTED' && analysis.reportHash
                              ? finishedAt
                              : null
                          }
                        />
                      </span>
                      <span className='mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground'>
                        Scope and evidence
                        <ChevronRight
                          className='size-3.5 transition-transform group-open:rotate-90'
                          aria-hidden='true'
                        />
                      </span>
                    </summary>
                    <div className='space-y-3 border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground'>
                      {analysis.scope && <p>{analysis.scope}</p>}
                      {analysis.fileAnalysis && (
                        <p>
                          {analysis.fileAnalysis.analyzedFiles} /{' '}
                          {analysis.fileAnalysis.candidateFiles} candidate files
                          analyzed · {analysis.fileAnalysis.skippedFiles} not
                          analyzed. JavaScript, TypeScript and Python candidate
                          files up to 1 MiB only; this is not whole-repository
                          or policy coverage.
                        </p>
                      )}
                      {analysis.id === 'tests.coverage' &&
                        report.measurements?.coverage && (
                          <p>
                            {report.measurements.coverage.coveredLines} of{' '}
                            {report.measurements.coverage.analyzedLines}{' '}
                            measured lines ·{' '}
                            {report.measurements.coverage.tests} tests passed.
                            Loaded source files only; unimported files are
                            excluded.
                          </p>
                        )}
                      {analysis.id === 'quality.duplication' &&
                        report.measurements?.duplication && (
                          <p>
                            {report.measurements.duplication.duplicatedLines.toLocaleString()}{' '}
                            of{' '}
                            {report.measurements.duplication.analyzedLines.toLocaleString()}{' '}
                            analyzed lines ·{' '}
                            {report.measurements.duplication.analyzedFiles.toLocaleString()}{' '}
                            files. Overlapping blocks count once.
                          </p>
                        )}
                      {analysis.id === 'security.hotspots' && hotspotReview && (
                        <div className='space-y-1'>
                          <p>
                            Optional review · {hotspotReview.reviewed} /{' '}
                            {hotspotReview.total} reviewed
                          </p>
                          <p>
                            {hotspotReview.percentage === null
                              ? hotspotReview.complete &&
                                hotspotReview.total === 0
                                ? 'No hotspots reported in the analyzed scope.'
                                : 'Retained hotspots only. A percentage needs complete hotspot output.'
                              : `${hotspotReview.percentage.toFixed(1)}% reviewed. Decisions apply to this commit only.`}
                          </p>
                        </div>
                      )}
                      <p>
                        {healthReasons[analysis.reason] ??
                          analysis.reason.replace(/_/g, ' ').toLowerCase()}
                      </p>
                      {(analysis.tool ||
                        analysis.reportHash ||
                        analysis.findingsRetained !== undefined) && (
                        <dl className='grid gap-2 border-t pt-3 sm:grid-cols-2'>
                          {analysis.tool && (
                            <div>
                              <dt>Tool version</dt>
                              <dd className='font-medium text-foreground'>
                                {analysis.tool}
                              </dd>
                            </div>
                          )}
                          <div>
                            <dt>Files analyzed</dt>
                            <dd className='font-medium text-foreground'>
                              {analysis.fileAnalysis?.analyzedFiles ??
                                (analysis.id === 'quality.duplication'
                                  ? report.measurements?.duplication
                                      ?.analyzedFiles
                                  : analysis.id === 'tests.coverage'
                                    ? report.measurements?.coverage
                                        ?.analyzedFiles
                                    : undefined) ??
                                'Unavailable'}
                            </dd>
                          </div>
                          {analysis.findingsRetained !== undefined && (
                            <div>
                              <dt>Findings retained</dt>
                              <dd className='font-medium text-foreground'>
                                {analysis.findingsRetained}
                              </dd>
                            </div>
                          )}
                          {analysis.fileAnalysis && (
                            <div className='sm:col-span-2'>
                              <dt>File-set checksum</dt>
                              <dd className='font-mono break-all'>
                                {analysis.fileAnalysis.pathsDigest}
                              </dd>
                            </div>
                          )}
                          {analysis.reportHash && (
                            <div className='sm:col-span-2'>
                              <dt>Report checksum</dt>
                              <dd className='font-mono break-all'>
                                {analysis.reportHash}
                              </dd>
                            </div>
                          )}
                        </dl>
                      )}
                    </div>
                  </details>
                ))}
            </div>
            {pages > 1 && (
              <nav
                aria-label='Analysis coverage pages'
                className='mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4'
              >
                <p className='text-xs text-muted-foreground'>
                  {start + 1}–
                  {Math.min(start + pageSize, report.analyses.length)} of{' '}
                  {report.analyses.length} analyzers · page {currentPage} of{' '}
                  {pages}
                </p>
                <div className='flex items-center gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={currentPage === 1}
                    onClick={() =>
                      setPagination({ assessmentId, page: currentPage - 1 })
                    }
                  >
                    <ChevronLeft /> Previous
                  </Button>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={currentPage === pages}
                    onClick={() =>
                      setPagination({ assessmentId, page: currentPage + 1 })
                    }
                  >
                    Next <ChevronRight />
                  </Button>
                </div>
              </nav>
            )}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            No analyzers were selected for this report.
          </p>
        )}
        <details className='mt-4 border-t pt-4'>
          <summary className='cursor-pointer text-xs font-medium'>
            Analysis limits and unavailable metrics
          </summary>
          <ul className='mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted-foreground'>
            {report.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </details>
        {headCheckedAt && (
          <p className='mt-4 border-t pt-4 text-xs leading-relaxed text-muted-foreground'>
            Branch head checked <RelativeTime value={headCheckedAt} />. Cached
            for one minute.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
