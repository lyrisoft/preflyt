import { useState, type ReactNode } from 'react'
import { GitBranch, GitPullRequest, ShieldCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/status-badge'
import { HealthTimelineChart } from '@/features/health/health-timeline-chart'
import { AssessmentResultsChart } from '@/features/repositories/assessment-results-chart'
import {
  demoHealthHistory,
  demoHealthReport,
  demoHealthTimeline,
} from './demo-health'
import { demoChecks } from './demo-workspace'

function Frame({
  title,
  children,
  label = 'Northstar / engineering',
}: {
  title: string
  children: ReactNode
  label?: string
}) {
  return (
    <div className='product-preview reference-ui dark'>
      <div className='reference-ui-top'>
        <span className='reference-ui-mark'>
          <GitBranch size={15} aria-hidden='true' />
        </span>
        <div>
          <strong>{title}</strong>
          <span>{label}</span>
        </div>
        <i aria-hidden='true'>•••</i>
      </div>
      {children}
    </div>
  )
}
export function FocusedHealthPreview() {
  const [reportId, setReportId] = useState('7c82a1f')
  const [search, setSearch] = useState('')
  const selectedReport = demoHealthHistory.find((item) => item.sha === reportId)
  return (
    <Frame title='northstar/platform-api'>
      <Tabs defaultValue='health'>
        <TabsList
          aria-label='Repository preview pages'
          className='reference-ui-tabs'
        >
          <TabsTrigger value='health'>Repository details</TabsTrigger>
          <TabsTrigger value='findings'>Findings</TabsTrigger>
        </TabsList>
        <TabsContent value='health' className='reference-ui-body'>
          <p className='reference-meta'>Latest report · main · 7c82a1f</p>
          <div className='reference-summary'>
            <div>
              <span>Reported findings</span>
              <strong>3</strong>
            </div>
            <div>
              <span>Analyses completed</span>
              <strong>8 / 8</strong>
            </div>
            <div>
              <span>Duplication</span>
              <strong>2.4%</strong>
            </div>
          </div>
          <div className='reference-chart-label'>
            <strong>Findings over time</strong>
            <span>main · comparable reports</span>
          </div>
          <HealthTimelineChart
            embedded
            compact
            locale='en-GB'
            points={demoHealthTimeline}
            branch='main'
            onSelectReport={setReportId}
          />
          <p className='reference-meta' role='status'>
            Selected report · {selectedReport?.date} · {reportId} ·{' '}
            {selectedReport?.findings} findings
          </p>
          <div className='reference-finding'>
            <span>Latest report · Needs attention</span>
            <strong>Dependency includes a vulnerable transitive package</strong>
            <code>package-lock.json · 7c82a1f</code>
            <StatusBadge tone='error'>High</StatusBadge>
          </div>
        </TabsContent>
        <TabsContent value='findings' className='reference-ui-body'>
          <div className='reference-chart-label'>
            <strong>Reported findings</strong>
            <span>3 at this commit</span>
          </div>
          <input
            aria-label='Search focused findings'
            placeholder='Search findings or files…'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className='reference-input'
          />
          {demoHealthReport.findings
            .filter((item) =>
              `${item.title} ${item.path}`
                .toLowerCase()
                .includes(search.toLowerCase())
            )
            .map((item) => (
              <div className='reference-finding' key={item.fingerprint}>
                <strong>{item.title}</strong>
                <code>
                  {item.path}:{item.line}
                </code>
                <StatusBadge tone='neutral'>
                  {item.severity === 'high' ? 'High' : 'Medium'}
                </StatusBadge>
              </div>
            ))}
          {!demoHealthReport.findings.some((item) =>
            `${item.title} ${item.path}`
              .toLowerCase()
              .includes(search.toLowerCase())
          ) && <p>No findings match this search.</p>}
        </TabsContent>
      </Tabs>
    </Frame>
  )
}
export function FocusedEvidencePreview() {
  const [selected, setSelected] = useState('all')
  return (
    <Frame
      title='Pull request assessment'
      label='Northstar · PR #128 · 7c82a1f'
    >
      <div className='reference-ui-body'>
        <div className='reference-chart-label'>
          <strong>Baseline Engineering</strong>
          <span>Policy revision 3</span>
        </div>
        <AssessmentResultsChart
          compact
          total={4}
          passed={2}
          failed={1}
          incomplete={1}
          selected={selected}
          onSelect={setSelected}
        />
        <div className='reference-checks'>
          {demoChecks
            .filter(
              (item) =>
                selected === 'all' ||
                (selected === 'passed'
                  ? item.status === 'Passed'
                  : selected === 'failed'
                    ? item.status === 'Failed'
                    : item.status === 'Not evaluated')
            )
            .map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
              </div>
            ))}
        </div>
        <p className='reference-meta'>
          Results stay bound to this policy and commit.
        </p>
      </div>
    </Frame>
  )
}
export function FocusedProtectionPreview() {
  return (
    <Frame title='Merge Protection' label='Northstar / platform-api'>
      <div className='reference-ui-body'>
        <div className='reference-chart-label'>
          <strong>Branch rules</strong>
          <span>main</span>
        </div>
        <div className='reference-protection'>
          <ShieldCheck size={22} aria-hidden='true' />
          <div>
            <strong>Require a pull request</strong>
            <p>Review changes before merging.</p>
          </div>
        </div>
        <div className='reference-protection'>
          <GitPullRequest size={22} aria-hidden='true' />
          <div>
            <strong>Require the Preflyt check</strong>
            <p>Preflyt / Engineering Readiness</p>
          </div>
        </div>
        <div className='reference-checks'>
          <div>
            <span>Ruleset draft</span>
            <StatusBadge tone='warning'>Draft</StatusBadge>
          </div>
          <div>
            <span>Activation review</span>
            <StatusBadge tone='warning'>Pending review</StatusBadge>
          </div>
        </div>
        <p className='reference-meta'>
          Saving a draft does not change GitHub. Review and explicit activation
          come next.
        </p>
      </div>
    </Frame>
  )
}
