import { useState } from 'react'
import {
  Bug,
  Copy,
  FileSearch,
  GitBranch,
  History,
  ShieldCheck,
  TestTube,
  Wrench,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { SurfaceIcon } from '@/components/surface-icon'
import { AnalysisCoverage } from '@/features/health/analysis-coverage'
import type { HealthReport } from '@/features/health/health-api'
import { healthDimensionValues } from '@/features/health/health-dimensions'
import { HealthTimelineChart } from '@/features/health/health-timeline-chart'
import { TechIcon } from '@/features/repositories/tech-icon'

// Isolated demo report: retained findings do not imply complete analysis or merge readiness.
const report: HealthReport = {
  completeness: 'COMPLETE',
  mode: 'EXECUTED',
  inspection: { complete: true, fileCount: 248, languages: ['TypeScript'] },
  analyses: [
    {
      id: 'secrets.scan',
      title: 'Secret detection',
      state: 'PASS',
      reason: 'NO_FINDINGS',
      scope: 'Tracked source and configuration files at the assessed commit.',
      tool: 'Gitleaks',
      findingsRetained: 0,
    },
    {
      id: 'security.sast',
      title: 'Static security analysis',
      state: 'PASS',
      reason: 'NO_FINDINGS',
      scope: 'All supported TypeScript candidate files were analyzed.',
      tool: 'Semgrep',
      findingsRetained: 0,
    },
    {
      id: 'security.dependencies',
      title: 'Dependency vulnerabilities',
      state: 'FAIL',
      reason: 'FINDINGS_REPORTED',
      scope: 'Dependencies from the lockfile at commit 7c82a1f.',
      tool: 'Trivy',
      findingsRetained: 2,
    },
    {
      id: 'iac.policy',
      title: 'Infrastructure configuration',
      state: 'FAIL',
      reason: 'FINDINGS_REPORTED',
      scope: 'Kubernetes manifests at the assessed revision.',
      tool: 'Trivy',
      findingsRetained: 1,
    },
    {
      id: 'quality.maintainability',
      title: 'Maintainability',
      state: 'PASS',
      reason: 'NO_FINDINGS',
      scope: 'Supported TypeScript source files.',
      findingsRetained: 0,
    },
    {
      id: 'quality.reliability',
      title: 'Reliability',
      state: 'PASS',
      reason: 'NO_FINDINGS',
      findingsRetained: 0,
    },
    {
      id: 'quality.duplication',
      title: 'Duplication',
      state: 'PASS',
      reason: 'NO_FINDINGS',
      findingsRetained: 0,
    },
    {
      id: 'tests.coverage',
      title: 'Test coverage',
      state: 'PASS',
      reason: 'MEASURED_COVERAGE',
    },
  ],
  findings: [
    {
      fingerprint: 'demo-dependency-1',
      category: 'security',
      severity: 'high',
      title: 'Dependency includes a vulnerable transitive package',
      ruleId: 'dependency-review',
      path: 'package-lock.json',
      line: 128,
      checkId: 'security.dependencies',
      evidence: 'Recorded dependency analysis',
    },
    {
      fingerprint: 'demo-dependency-2',
      category: 'security',
      severity: 'medium',
      title: 'Dependency update requires review',
      ruleId: 'dependency-review',
      path: 'package-lock.json',
      line: 246,
      checkId: 'security.dependencies',
      evidence: 'Recorded dependency analysis',
    },
    {
      fingerprint: 'demo-config-1',
      category: 'security',
      severity: 'medium',
      title: 'Container security context permits privilege escalation',
      ruleId: 'container-security-context',
      path: 'deploy/api.yaml',
      line: 34,
      checkId: 'iac.policy',
      evidence: 'Recorded configuration analysis',
    },
  ],
  limits: [
    'Coverage measures loaded source files; unimported files are excluded.',
  ],
  measurements: {
    duplication: {
      version: 1,
      formula: 'unique-lines-v1',
      analyzedLines: 10000,
      duplicatedLines: 240,
      analyzedFiles: 182,
      clonePairs: 8,
    },
    coverage: {
      version: 1,
      formula: 'node-covered-lines-v1',
      scope: 'node-loaded-files',
      analyzedLines: 10000,
      coveredLines: 9160,
      analyzedFiles: 164,
      tests: 420,
      passed: 420,
    },
  },
}
const dimensions = healthDimensionValues(report, null, true)
const history = [
  {
    sha: '7c82a1f',
    at: '2026-10-11T14:30:00Z',
    date: '11 Oct 2026 · 14:30',
    findings: 3,
  },
  {
    sha: '6ab019d',
    at: '2026-10-09T09:15:00Z',
    date: '9 Oct 2026 · 09:15',
    findings: 4,
  },
  {
    sha: '4de082b',
    at: '2026-10-07T16:40:00Z',
    date: '7 Oct 2026 · 16:40',
    findings: 5,
  },
  {
    sha: '3bc971a',
    at: '2026-10-05T11:20:00Z',
    date: '5 Oct 2026 · 11:20',
    findings: 7,
  },
  {
    sha: '2af640c',
    at: '2026-10-03T10:05:00Z',
    date: '3 Oct 2026 · 10:05',
    findings: 9,
  },
  {
    sha: '1ed530b',
    at: '2026-10-01T08:00:00Z',
    date: '1 Oct 2026 · 08:00',
    findings: 12,
  },
]
const timeline = [...history]
  .reverse()
  .map((item) => ({
    id: item.sha,
    sourceSha: item.sha,
    at: item.at,
    findings: item.findings,
  }))

export function RepositoryPreview() {
  const [search, setSearch] = useState('')
  const [detailTab, setDetailTab] = useState('findings')
  const [selectedReport, setSelectedReport] = useState('7c82a1f')
  const findings = report.findings.filter((f) =>
    `${f.title} ${f.path}`.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div id='repository-preview' className='scroll-mt-28 space-y-4'>
      <PageHeader
        headingLevel={2}
        title='northstar/platform-api'
        section='Workspace'
        icon={GitBranch}
        tone='blue'
      >
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <TechIcon name='TypeScript' compact />
            <TechIcon name='NestJS' compact />
          </div>
          <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
            <span>Inspected branch: main</span>
            <span>Commit: 7c82a1f</span>
            <StatusBadge tone='success'>Inspection complete</StatusBadge>
          </div>
        </div>
      </PageHeader>
      <div className='flex flex-wrap items-center gap-3 text-xs text-muted-foreground'>
        <span className='rounded-md border bg-muted px-3 py-2 font-semibold text-foreground'>
          Health
        </span>
        <span>Repository health at the assessed revision</span>
      </div>
      <Card className='gap-0 overflow-hidden py-0'>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 border-b p-5'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={ShieldCheck} tone='teal' />
            <div>
              <CardTitle>Repository health</CardTitle>
              <p className='mt-1 text-xs text-muted-foreground'>
                Findings over time and the latest assessment.
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <StatusBadge tone='error'>Unhealthy</StatusBadge>
            <StatusBadge tone='success'>Current</StatusBadge>
          </div>
        </CardHeader>
        <div className='border-b bg-muted/10 px-5 py-3 text-xs text-muted-foreground'>
          main · 7c82a1f · Assessed 11 October 2026
        </div>
        <HealthTimelineChart
          embedded
          branch='main'
          points={timeline}
          onSelectReport={(id) => {
            setSelectedReport(id)
            setDetailTab('history')
          }}
        />
      </Card>
      <div className='grid grid-cols-2 gap-3 xl:grid-cols-5'>
        {[
          {
            label: 'Security',
            value: dimensions.security,
            note: 'Reported security findings',
            icon: ShieldCheck,
            tone: 'blue' as const,
          },
          {
            label: 'Reliability',
            value: dimensions.reliability,
            note: 'No findings in the analyzed scope',
            icon: Bug,
            tone: 'blue' as const,
          },
          {
            label: 'Maintainability',
            value: dimensions.maintainability,
            note: 'Findings in the analyzed scope',
            icon: Wrench,
            tone: 'teal' as const,
          },
          {
            label: 'Duplication',
            value: dimensions.duplication,
            note: '240 of 10,000 analyzed lines',
            icon: Copy,
            tone: 'violet' as const,
          },
          {
            label: 'Test coverage',
            value: dimensions.coverage,
            note: '9,160 covered lines · 420 tests passed',
            icon: TestTube,
            tone: 'teal' as const,
          },
        ].map((item) => (
          <Card key={item.label} className='gap-3 py-4'>
            <CardHeader className='flex flex-row items-start justify-between gap-2 px-4'>
              <CardTitle className='text-xs'>{item.label}</CardTitle>
              <SurfaceIcon icon={item.icon} tone={item.tone} size='sm' />
            </CardHeader>
            <CardContent className='space-y-2 px-4'>
              <p
                className={`${item.value === 'Unavailable' ? 'text-base' : 'text-2xl'} font-semibold tabular-nums`}
              >
                {item.value}
              </p>
              <p className='text-[11px] leading-relaxed text-muted-foreground'>
                {item.note}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className='flex flex-wrap gap-x-8 gap-y-2 rounded-lg border bg-muted/10 px-5 py-3 text-xs text-muted-foreground'>
        <span>
          <strong className='text-foreground'>12 → 3</strong> reported findings
          across six comparable assessments
        </span>
        <span>
          <strong className='text-foreground'>8 / 8</strong> analyses completed
        </span>
        <span>1–11 October 2026 · main</span>
      </div>
      <AnalysisCoverage
        report={report}
        assessmentId='demo-health-report'
        assessmentReason={null}
        hotspotReview={null}
        headCheckedAt={undefined}
      />
      <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <Tabs
          value={detailTab}
          onValueChange={setDetailTab}
          className='min-w-0 space-y-4'
        >
          <TabsList
            aria-label='Repository evidence views'
            className='h-auto max-w-full flex-wrap'
          >
            <TabsTrigger value='findings'>Findings (3)</TabsTrigger>
            <TabsTrigger value='history'>Assessment history (6)</TabsTrigger>
          </TabsList>
          <TabsContent value='findings'>
            {' '}
            <Card className='gap-0 overflow-hidden'>
              <CardHeader className='space-y-3 border-b pb-4'>
                <div className='flex items-center gap-3'>
                  <SurfaceIcon icon={FileSearch} tone='blue' />
                  <CardTitle>Findings</CardTitle>
                  <span className='ml-auto text-xs text-muted-foreground'>
                    3 reported
                  </span>
                </div>
                <Input
                  aria-label='Search repository demo findings'
                  placeholder='Search findings or files…'
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </CardHeader>
              <CardContent className='p-0'>
                <div className='flex justify-between border-b bg-muted/10 px-5 py-3 text-xs font-medium text-muted-foreground'>
                  <span>Finding / location</span>
                  <span>Severity</span>
                </div>
                <ul className='divide-y'>
                  {findings.map((f) => (
                    <li
                      key={f.fingerprint}
                      className='flex items-start justify-between gap-3 px-5 py-4'
                    >
                      <div className='min-w-0'>
                        <p className='text-sm font-medium'>{f.title}</p>
                        <p className='mt-2 font-mono text-[11px] break-all text-muted-foreground'>
                          {f.path}:{f.line}
                        </p>
                      </div>
                      <StatusBadge
                        tone={f.severity === 'high' ? 'error' : 'warning'}
                      >
                        {f.severity === 'high' ? 'High' : 'Medium'}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
                {!findings.length && (
                  <p
                    role='status'
                    className='p-5 text-sm text-muted-foreground'
                  >
                    No findings match your search.
                  </p>
                )}
                <p className='border-t px-5 py-3 text-xs text-muted-foreground'>
                  {findings.length} of 3 findings
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value='history'>
            {' '}
            <Card>
              <CardHeader className='flex flex-row items-center gap-3'>
                <SurfaceIcon icon={History} tone='violet' />
                <div>
                  <CardTitle>Assessment history</CardTitle>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Saved reports retain their original commit and analysis
                    limits.
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                <ul className='space-y-2'>
                  {history.map((item) => (
                    <li
                      key={item.sha}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-xs ${selectedReport === item.sha ? 'border-info/40 bg-info/5' : 'bg-muted/10'}`}
                      aria-current={
                        selectedReport === item.sha ? 'true' : undefined
                      }
                    >
                      <div className='flex flex-wrap gap-3'>
                        <code>{item.sha}</code>
                        <span className='text-muted-foreground'>
                          {item.date}
                        </span>
                      </div>
                      <div className='flex items-center gap-3'>
                        <span>{item.findings} findings</span>
                        <StatusBadge tone='success'>Completed</StatusBadge>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Card>
          <CardHeader className='flex flex-row items-center gap-3'>
            <SurfaceIcon icon={FileSearch} tone='teal' />
            <CardTitle>Policy evidence</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4 text-xs leading-relaxed'>
            <p className='font-medium'>Policy revision 3 · 2 requirements</p>
            <p className='text-muted-foreground'>
              No matching, verified historical CI assessment was captured.
              Policy evidence coverage is unavailable.
            </p>
            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer font-medium'>
                Captured policy details
              </summary>
              <p className='mt-3 text-muted-foreground'>
                Branch: main. Required checks: unit tests and dependency scan.
              </p>
            </details>
            <p className='border-t pt-4 text-muted-foreground'>
              Health findings do not satisfy CI checks or establish current
              merge readiness.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
