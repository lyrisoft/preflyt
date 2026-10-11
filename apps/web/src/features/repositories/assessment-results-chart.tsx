import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { chartAnimation, chartTooltipAnimation } from '@/lib/chart-motion'
import { cn } from '@/lib/utils'

/** Outcomes come from the same verified evaluation as the assessment summary. */
export function AssessmentResultsChart({
  total,
  passed,
  failed,
  incomplete,
  selected,
  onSelect,
}: {
  total: number
  passed: number
  failed: number
  incomplete: number
  selected: string
  onSelect: (key: string) => void
}) {
  const segments = [
    {
      key: 'passed',
      label: 'Passed',
      value: passed,
      color: 'var(--success)',
      fill: 'bg-success',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: failed,
      color: 'var(--danger)',
      fill: 'bg-danger',
    },
    {
      key: 'incomplete',
      label: 'Not evaluated',
      value: incomplete,
      color: 'var(--warning)',
      fill: 'bg-warning',
    },
  ]
  const chartData = segments.filter((segment) => segment.value > 0)
  return (
    <div className='rounded-lg border bg-muted/10 p-4'>
      <p className='text-sm font-semibold'>All check results</p>
      <div className='mt-4 flex flex-wrap items-center gap-5'>
        <div
          className='relative h-44 w-full max-w-44 shrink-0'
          role='img'
          aria-label={`Results for ${total} checks: ${passed} passed, ${failed} failed, ${incomplete} not evaluated`}
        >
          <ResponsiveContainer width='100%' height='100%'>
            <PieChart className='chart-motion' accessibilityLayer>
              <Pie
                data={chartData}
                dataKey='value'
                nameKey='label'
                innerRadius='62%'
                outerRadius='90%'
                startAngle={90}
                endAngle={-270}
                paddingAngle={chartData.length > 1 ? 3 : 0}
                cornerRadius={4}
                stroke='var(--card)'
                strokeWidth={2}
                {...chartAnimation}
                className='cursor-pointer'
                onClick={(_, index) => {
                  const segment = chartData[index]
                  if (segment)
                    onSelect(selected === segment.key ? 'all' : segment.key)
                }}
              >
                {chartData.map((segment) => (
                  <Cell
                    key={segment.key}
                    fill={segment.color}
                    opacity={
                      selected === 'all' || selected === segment.key ? 1 : 0.45
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                {...chartTooltipAnimation}
                formatter={(value, name) => [
                  `${value} checks · ${total ? Math.round((Number(value) / total) * 100) : 0}%`,
                  name,
                ]}
                contentStyle={{
                  background: 'var(--popover)',
                  borderColor: 'var(--border)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--foreground)',
                }}
                itemStyle={{ color: 'var(--foreground)' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className='pointer-events-none absolute inset-0 flex flex-col items-center justify-center'>
            <span className='text-3xl font-semibold tabular-nums'>{total}</span>
            <span className='mt-0.5 text-xs text-muted-foreground'>checks</span>
          </div>
        </div>
        <div className='min-w-40 flex-1 space-y-1'>
          {segments.map((segment) => (
            <button
              key={segment.key}
              type='button'
              aria-pressed={selected === segment.key}
              onClick={() =>
                onSelect(selected === segment.key ? 'all' : segment.key)
              }
              className='flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring aria-pressed:bg-muted'
            >
              <span className='flex items-center gap-2'>
                <span
                  className={cn('size-2 rounded-full', segment.fill)}
                  aria-hidden='true'
                />
                {segment.label}
              </span>
              <span className='font-semibold tabular-nums'>
                {segment.value}
              </span>
            </button>
          ))}
        </div>
      </div>
      <p className='mt-3 text-xs text-muted-foreground'>
        Includes required and optional checks. Select a result to view its
        checks.
      </p>
    </div>
  )
}
