import { useId, useState } from 'react'
import { FileSearch } from 'lucide-react'
import { statusTones } from '@/lib/status-tones'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { FindingsOverview } from '@/features/findings/findings-summary'
import { demoFindings } from './demo-workspace'

/** Full Findings page for the public demo; all filtering stays local. */
export function FindingsPreview({
  severity: selectedSeverity,
  onSeverityChange,
}: {
  severity?: string
  onSeverityChange?: (severity: string) => void
} = {}) {
  const [localSeverity, setLocalSeverity] = useState('all')
  const [search, setSearch] = useState('')
  const searchId = useId()
  const severityId = useId()
  const severity = selectedSeverity ?? localSeverity
  const setSeverity = onSeverityChange ?? setLocalSeverity
  const query = search.trim().toLowerCase()
  const visible = demoFindings.filter(
    (finding) =>
      (severity === 'all' || finding.severity === severity) &&
      `${finding.title} ${finding.repository} ${finding.path}`
        .toLowerCase()
        .includes(query)
  )

  return (
    <div data-preview='findings' className='scroll-mt-28 space-y-5'>
      <PageHeader
        headingLevel={2}
        title='Findings'
        description='Review reported issues and missing evidence across repositories.'
        icon={FileSearch}
        section='Workspace'
      >
        <p className='text-xs text-muted-foreground'>Northstar / engineering</p>
      </PageHeader>
      <FindingsOverview
        kind='issues'
        onSeverity={setSeverity}
        summary={{
          reportedIssues: 6,
          affectedRepositories: 3,
          criticalHigh: 2,
          evidenceGaps: 1,
          suppressed: 0,
          chartTotal: 6,
          bySeverity: [
            { name: 'high', count: 2 },
            { name: 'medium', count: 3 },
            { name: 'low', count: 1 },
          ],
          byCheck: [
            { name: 'Dependency scan', count: 3 },
            { name: 'Code quality', count: 2 },
            { name: 'Secret detection', count: 1 },
          ],
        }}
      />
      <Card>
        <CardHeader className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle>
            {severity === 'all'
              ? 'Reported issues'
              : `${severity[0].toUpperCase() + severity.slice(1)} severity issues`}
          </CardTitle>
          {(severity !== 'all' || query) && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => {
                setSeverity('all')
                setSearch('')
              }}
            >
              Show all issues
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]'>
            <div className='space-y-2'>
              <label
                htmlFor={searchId}
                className='text-xs text-muted-foreground'
              >
                Search findings or files
              </label>
              <Input
                id={searchId}
                aria-label='Search findings or files'
                placeholder='Find a finding, repository or file…'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <label
                htmlFor={severityId}
                className='text-xs text-muted-foreground'
              >
                Severity
              </label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger id={severityId} className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All severities</SelectItem>
                  <SelectItem value='high'>High</SelectItem>
                  <SelectItem value='medium'>Medium</SelectItem>
                  <SelectItem value='low'>Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className='mt-4 text-xs text-muted-foreground' role='status'>
            Showing {visible.length} of {demoFindings.length} reported issues
          </p>
          <ul className='divide-y'>
            {visible.map((finding) => (
              <li
                key={finding.title}
                className='flex flex-wrap items-start justify-between gap-3 py-4'
              >
                <div className='min-w-0'>
                  <p className='text-sm font-medium'>{finding.title}</p>
                  <p className='mt-1 text-xs break-all text-muted-foreground'>
                    {finding.repository} · {finding.path}
                  </p>
                </div>
                <StatusBadge tone={statusTones[finding.severity] ?? 'neutral'}>
                  {finding.severity[0].toUpperCase() +
                    finding.severity.slice(1)}
                </StatusBadge>
              </li>
            ))}
            {visible.length === 0 && (
              <li className='py-6 text-sm text-muted-foreground'>
                No findings match these filters.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
