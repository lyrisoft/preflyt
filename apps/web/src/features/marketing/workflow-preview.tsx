import { useState } from 'react'
import { FileSearch, GitBranch, UsersRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { FindingsOverview } from '@/features/findings/findings-summary'
import { ContributorsPreview } from './contributors-preview'
import { demoFindings } from './demo-workspace'
import { RepositoryPreview } from './repository-preview'

export function WorkflowPreview() {
  const [severity, setSeverity] = useState('all')
  return (
    <section
      className='product-preview-shell workflow-preview'
      id='workspace-tour'
      aria-label='Findings, contributors and repository details preview'
    >
      <div className='section-intro'>
        <p className='section-label'>Beyond the overview</p>
        <h2>
          See the issue.
          <br />
          Understand the whole picture.
        </h2>
        <p>
          Investigate findings, follow contribution activity and explore the
          evidence behind each repository.
        </p>
      </div>
      <div className='product-preview overflow-hidden rounded-2xl border bg-background text-foreground shadow-xl'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 text-xs text-muted-foreground'>
          <span>Northstar / engineering</span>
          <span>Demo workspace</span>
        </div>
        <TooltipProvider>
          <Tabs defaultValue='findings' className='gap-0'>
            <div className='border-b p-3 sm:px-6'>
              <TabsList
                aria-label='Explore workspace pages'
                className='h-auto w-full flex-wrap justify-start gap-1 bg-transparent'
              >
                <TabsTrigger value='findings'>
                  <FileSearch className='size-4' />
                  Findings
                </TabsTrigger>
                <TabsTrigger value='contributors'>
                  <UsersRound className='size-4' />
                  Contributors
                </TabsTrigger>
                <TabsTrigger value='repository'>
                  <GitBranch className='size-4' />
                  Repository details
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value='findings' className='space-y-5 p-4 sm:p-6'>
              <PageHeader
                headingLevel={2}
                title='Findings'
                description='Review reported issues and missing evidence across repositories.'
                icon={FileSearch}
                section='Workspace'
              />
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
                  {severity !== 'all' && (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setSeverity('all')}
                    >
                      Show all issues
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className='divide-y'>
                    {demoFindings
                      .filter(
                        (f) => severity === 'all' || f.severity === severity
                      )
                      .map((f) => (
                        <li
                          key={f.title}
                          className='flex flex-wrap items-start justify-between gap-3 py-4'
                        >
                          <div className='min-w-0'>
                            <p className='text-sm font-medium'>{f.title}</p>
                            <p className='mt-1 text-xs break-all text-muted-foreground'>
                              {f.repository} · {f.path}
                            </p>
                          </div>
                          <StatusBadge
                            tone={
                              f.severity === 'high'
                                ? 'error'
                                : f.severity === 'medium'
                                  ? 'warning'
                                  : 'info'
                            }
                          >
                            {f.severity[0].toUpperCase() + f.severity.slice(1)}
                          </StatusBadge>
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value='contributors' className='space-y-5 p-4 sm:p-6'>
              <PageHeader
                headingLevel={2}
                title='Contributors'
                description='Explore recorded GitHub activity and contribution context.'
                icon={UsersRound}
                section='Workspace'
              />
              <ContributorsPreview />
            </TabsContent>
            <TabsContent value='repository' className='space-y-5 p-4 sm:p-6'>
              <RepositoryPreview />
            </TabsContent>
          </Tabs>
        </TooltipProvider>
      </div>
    </section>
  )
}
