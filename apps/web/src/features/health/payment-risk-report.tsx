import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileSearch, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { healthRequest } from './health-api'

type Reference = { path: string; startLine: number; endLine: number }
type Outcome = {
  outcome: string
  reason: string
  references: Reference[]
  issueIds: string[]
}
type Report = {
  executiveSummary: string
  systemInventory: {
    service: string
    description: string
    references: Reference[]
  }[]
  findings: {
    issueId: string
    title: string
    references: Reference[]
    impactDescription: string
    category: string
    service: string
    function: string
    review?: { reason: string; updatedAt: string }
    classification: string
    likelihood: number
    impact: number
    score: number
    severity: string
    attackScenario: string
  }[]
  domains: (Outcome & { domain: string })[]
  paymentRiskRegister: (Outcome & { area: string })[]
  attackScenarios: (Outcome & { scenario: string })[]
  remediationPlan: { timeframe: string; actions: string; issueIds: string[] }[]
  qaRegressionCases: { issueId: string; test: string }[]
  finalRiskSummary: {
    summary: string
    topIssueIds: string[]
    immediateActions: string
  }
}
const label = (value: string) => value.replace(/_/g, ' ')
function References({ rows }: { rows: Reference[] }) {
  return (
    <ul className='mt-2 space-y-1 font-mono text-xs text-muted-foreground'>
      {rows.map((r, i) => (
        <li key={i} className='break-all'>
          {r.path}:{r.startLine}–{r.endLine}
        </li>
      ))}
    </ul>
  )
}

export function PaymentRiskReport({
  repositoryId,
  assessmentId,
  scopeKey,
  embedded = false,
}: {
  repositoryId: string
  assessmentId: string
  scopeKey: string
  embedded?: boolean
}) {
  const [open, setOpen] = useState(embedded)
  const query = useQuery({
    queryKey: ['payment-risk-report', scopeKey, repositoryId, assessmentId],
    queryFn: ({ signal }) =>
      healthRequest<{ report: Report; sourceSha: string; branch: string }>(
        `repositories/${repositoryId}/health/${assessmentId}/payment-risk-report`,
        signal
      ),
    enabled: open,
    retry: false,
    staleTime: 30000,
  })
  const report = query.isError ? undefined : query.data?.report
  const findingLink = (id: string, title = 'Open finding') => (
    <Link
      to='/findings/$findingId'
      params={{ findingId: id }}
      search={{
        origin: 'health',
        repository: repositoryId,
        health: assessmentId,
      }}
      className='text-sm underline underline-offset-4'
    >
      {title}
    </Link>
  )
  const outcomes = (rows: (Outcome & { title: string })[]) => (
    <div className='divide-y'>
      {rows.map((row) => (
        <article key={row.title} className='py-3'>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <h4 className='text-sm font-medium capitalize'>
              {label(row.title)}
            </h4>
            <span className='text-xs text-muted-foreground'>
              {row.outcome === 'reviewed'
                ? 'Source reviewed'
                : row.outcome === 'needs_follow_up'
                  ? 'Further review needed'
                  : 'Not applicable'}
            </span>
          </div>
          <p className='mt-1 text-sm leading-6 whitespace-pre-wrap'>
            {row.reason}
          </p>
          <References rows={row.references} />
          <div className='mt-2 flex flex-wrap gap-3'>
            {row.issueIds.map((id, i) => (
              <span key={id}>{findingLink(id, `Finding ${i + 1}`)}</span>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
  const section = (title: string, children: React.ReactNode) => (
    <details className='border-t px-5 py-4'>
      <summary className='cursor-pointer text-sm font-semibold focus-visible:outline-ring'>
        {title}
      </summary>
      <div className='mt-3 text-sm leading-6 [overflow-wrap:anywhere]'>
        {children}
      </div>
    </details>
  )
  const download = () => {
    if (!report) return
    const blob = new Blob(
      [JSON.stringify({ assessmentId, ...query.data }, null, 2)],
      { type: 'application/json' }
    )
    const url = URL.createObjectURL(blob),
      anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `payment-risk-${assessmentId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section
      className='overflow-hidden rounded-xl border'
      aria-label='Payment Risk Review report'
    >
      <div className='flex flex-wrap items-center justify-between gap-3 p-5'>
        <div className='flex items-center gap-3'>
          <SurfaceIcon icon={FileSearch} tone='blue' />
          <div>
            <h3 className='font-semibold'>Payment Risk Review</h3>
            <p className='text-xs text-muted-foreground'>
              Source analysis and proposed tests. Findings need independent
              verification.
            </p>
          </div>
        </div>
        {!embedded && (
          <Button
            variant='outline'
            size='sm'
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? 'Hide report' : 'Open report'}
          </Button>
        )}
      </div>
      {open && (
        <div aria-live='polite'>
          {query.isPending && (
            <p className='px-5 pb-5 text-sm text-muted-foreground'>
              Loading payment risk report…
            </p>
          )}
          {query.isError && (
            <div className='px-5 pb-5'>
              <p className='text-sm text-destructive'>
                The payment risk report could not be loaded.
              </p>
              <Button
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {report && (
            <>
              <div className='flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3'>
                <p className='font-mono text-xs text-muted-foreground'>
                  {query.data?.branch} · {query.data?.sourceSha.slice(0, 12)}
                </p>
                <Button variant='outline' size='sm' onClick={download}>
                  <Download />
                  Download report
                </Button>
              </div>
              <div className='border-t px-5 py-4'>
                <h4 className='text-sm font-semibold'>1. Executive summary</h4>
                <p className='mt-2 text-sm leading-6 whitespace-pre-wrap'>
                  {report.executiveSummary}
                </p>
              </div>
              {section(
                '2. System inventory',
                report.systemInventory.map((item, i) => (
                  <article key={i} className='mb-4'>
                    <h4 className='font-medium'>{item.service}</h4>
                    <p className='whitespace-pre-wrap'>{item.description}</p>
                    <References rows={item.references} />
                  </article>
                ))
              )}
              {section(
                `3. Findings (${report.findings.length})`,
                <>
                  <p className='mb-3 text-muted-foreground'>
                    Likelihood × impact, each scored 1–5. AI conclusions need
                    independent review. Human decisions are shown when
                    available.
                  </p>
                  {report.findings.map((f, i) => (
                    <article
                      key={f.issueId}
                      className='mb-4 rounded-lg border p-3'
                    >
                      {findingLink(f.issueId, `${i + 1}. ${f.title}`)}
                      <StatusBadge tone='neutral' compact>
                        {label(f.classification.toLowerCase())}
                      </StatusBadge>
                      {f.review && (
                        <p className='mt-2 whitespace-pre-wrap'>
                          {f.review.reason}
                        </p>
                      )}
                      <p className='mt-1 text-xs text-muted-foreground capitalize'>
                        {f.severity} · {f.likelihood} × {f.impact} = {f.score}
                        /25 · {label(f.classification.toLowerCase())}
                      </p>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {f.service} · {f.function}
                      </p>
                      <References rows={f.references} />
                      <p className='mt-2 whitespace-pre-wrap'>
                        {f.impactDescription}
                      </p>
                      <p className='mt-2 whitespace-pre-wrap'>
                        {f.attackScenario}
                      </p>
                    </article>
                  ))}
                  {report.findings.length === 0 && (
                    <p>
                      No source-backed issues were recorded. Review the scope
                      gaps below.
                    </p>
                  )}
                </>
              )}
              {section(
                '4. Payment risk register',
                <>
                  {outcomes(
                    report.paymentRiskRegister.map((r) => ({
                      ...r,
                      title: r.area,
                    }))
                  )}
                  <h4 className='mt-4 font-medium'>Review scope</h4>
                  {outcomes(
                    report.domains.map((r) => ({ ...r, title: r.domain }))
                  )}
                </>
              )}
              {section(
                '5. Attack scenarios',
                <>
                  <p className='text-muted-foreground'>
                    Conceptual source traces. These scenarios were not executed.
                  </p>
                  {outcomes(
                    report.attackScenarios.map((r) => ({
                      ...r,
                      title: r.scenario,
                    }))
                  )}
                </>
              )}
              {section(
                '6. Remediation plan',
                report.remediationPlan.map((r) => (
                  <article key={r.timeframe} className='mb-4'>
                    <h4 className='font-medium capitalize'>
                      {label(r.timeframe)}
                    </h4>
                    <p className='whitespace-pre-wrap'>{r.actions}</p>
                    <div className='flex flex-wrap gap-3'>
                      {r.issueIds.map((id, i) => (
                        <span key={id}>
                          {findingLink(id, `Finding ${i + 1}`)}
                        </span>
                      ))}
                    </div>
                  </article>
                ))
              )}
              {section(
                '7. Proposed regression tests',
                <>
                  <p className='mb-3 text-muted-foreground'>
                    Test cases for your engineering team. No tests were executed
                    by this review.
                  </p>
                  {report.qaRegressionCases.map((r, i) => (
                    <article key={r.issueId} className='mb-4'>
                      {findingLink(r.issueId, `Finding ${i + 1}`)}
                      <p className='whitespace-pre-wrap'>{r.test}</p>
                    </article>
                  ))}
                </>
              )}
              {section(
                '8. Final risk summary',
                <>
                  <p className='whitespace-pre-wrap'>
                    {report.finalRiskSummary.summary}
                  </p>
                  <h4 className='mt-3 font-medium'>Immediate actions</h4>
                  <p className='whitespace-pre-wrap'>
                    {report.finalRiskSummary.immediateActions}
                  </p>
                  <ol className='mt-3 list-inside list-decimal'>
                    {report.finalRiskSummary.topIssueIds.map((id, i) => (
                      <li key={id}>
                        {findingLink(id, `Priority finding ${i + 1}`)}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
