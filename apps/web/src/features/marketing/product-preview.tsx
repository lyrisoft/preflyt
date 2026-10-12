import { useState } from 'react'
import { Activity, GitBranch, LayoutDashboard, ListChecks } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { ActivityHeatmap } from '@/features/dashboard/activity-heatmap'
import { DashboardMetrics } from '@/features/dashboard/dashboard-metrics'
import { ActivityTrendChart } from '@/features/repositories/activity-trend-chart'
import { AssessmentResultsChart } from '@/features/repositories/assessment-results-chart'
import { demoActivity, demoChecks, demoMetrics } from './demo-workspace'

export function ProductPreview() {
  const [days, setDays] = useState('30')
  const [selected, setSelected] = useState('all')
  const activity = demoActivity.slice(-Number(days))
  return (
    <section
      className='product-preview-shell'
      aria-label='Explore the Preflyt demo workspace'
    >
      <div className='preview-caption'>
        <span>Inside Preflyt</span>
        <p>Your engineering workflow. In one clear view.</p>
      </div>
      <div className='product-preview rounded-2xl border bg-background text-foreground shadow-xl'>
        <div className='flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 text-xs text-muted-foreground'>
          <span className='flex items-center gap-2'>
            <GitBranch className='size-4' /> Northstar / engineering
          </span>
          <span>Demo workspace</span>
        </div>
        <TooltipProvider>
          <div className='space-y-5 p-4 sm:p-6'>
            <PageHeader
              headingLevel={2}
              title='Engineering Overview'
              section='Workspace'
              description='Review repository evidence, assessment activity, and changes requiring attention.'
              icon={LayoutDashboard}
              tone='blue'
            />
            <DashboardMetrics metrics={demoMetrics} />
            <Tabs defaultValue='overview' className='space-y-4'>
              <TabsList
                aria-label='Product preview views'
                className='h-auto max-w-full flex-wrap'
              >
                <TabsTrigger value='overview'>
                  <LayoutDashboard className='size-4' />
                  Overview
                </TabsTrigger>
                <TabsTrigger value='activity'>
                  <Activity className='size-4' />
                  Repository activity
                </TabsTrigger>
                <TabsTrigger value='checks'>
                  <ListChecks className='size-4' />
                  Check results
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value='overview'
                className='grid items-start gap-4 lg:grid-cols-[1.6fr_1fr]'
              >
                <ActivityHeatmap
                  locale='en-GB'
                  from={demoActivity[0].date}
                  to={demoActivity[89].date}
                  activity={demoActivity}
                />
                <Card>
                  <CardHeader>
                    <CardTitle>Evidence overview</CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4 text-sm'>
                    <div className='flex justify-between gap-3'>
                      <span className='text-muted-foreground'>
                        Snapshot recorded
                      </span>
                      <strong>12</strong>
                    </div>
                    <div className='flex justify-between gap-3'>
                      <span className='text-muted-foreground'>
                        No assessment yet
                      </span>
                      <strong>0</strong>
                    </div>
                    <div className='flex justify-between gap-3'>
                      <span className='text-muted-foreground'>
                        Standards not adopted
                      </span>
                      <strong>2</strong>
                    </div>
                    <p className='border-t pt-4 text-xs text-muted-foreground'>
                      A successful CI result alone does not mean a change is
                      ready to merge.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value='activity'>
                <ActivityTrendChart
                  from={activity[0].date}
                  to={activity[activity.length - 1].date}
                  activity={activity}
                  days={days}
                  onDays={setDays}
                />
              </TabsContent>
              <TabsContent
                value='checks'
                className='grid items-start gap-4 lg:grid-cols-2'
              >
                <AssessmentResultsChart
                  total={4}
                  passed={2}
                  failed={1}
                  incomplete={1}
                  selected={selected}
                  onSelect={setSelected}
                />
                <Card>
                  <CardHeader>
                    <CardTitle>Check details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className='divide-y'>
                      {demoChecks
                        .filter(
                          (check) =>
                            selected === 'all' ||
                            (selected === 'passed'
                              ? check.status === 'Passed'
                              : selected === 'failed'
                                ? check.status === 'Failed'
                                : check.status === 'Not evaluated')
                        )
                        .map((check) => (
                          <li
                            key={check.name}
                            className='flex items-center justify-between gap-3 py-4 text-sm'
                          >
                            <span>{check.name}</span>
                            <StatusBadge tone={check.tone}>
                              {check.status}
                            </StatusBadge>
                          </li>
                        ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </TooltipProvider>
      </div>
    </section>
  )
}
