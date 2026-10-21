import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { SurfaceIcon } from '@/components/surface-icon'
import {
  activityLevel,
  activityWeeks,
  type ActivityDay,
} from './activity-calendar'

const tones = [
  'bg-muted',
  'bg-emerald-500/20',
  'bg-emerald-500/40',
  'bg-emerald-500/65',
  'bg-emerald-500',
]
const dateLabel = (date: string, locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

export function ActivityHeatmap({
  from,
  to,
  activity,
  locale,
}: {
  from: string
  to: string
  locale?: string
  activity: ActivityDay[]
}) {
  const weeks = activityWeeks(from, to, activity)
  const [selected, setSelected] = useState<ActivityDay | null>(null)
  const total = activity.reduce((sum, day) => sum + day.count, 0)
  return (
    <Card className='min-w-0'>
      <CardHeader className='flex flex-row items-center gap-3'>
        <SurfaceIcon icon={CalendarDays} tone='teal' />
        <div>
          <CardTitle>Assessment activity</CardTitle>
          <CardDescription>
            {total.toLocaleString()} assessment{total === 1 ? '' : 's'} recorded
            · {dateLabel(from, locale)}–{dateLabel(to, locale)}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto pb-2'>
          <div className='flex w-max gap-1'>
            <div
              aria-hidden='true'
              className='grid grid-rows-[1rem_repeat(7,1.5rem)] gap-1 pe-2 text-xs leading-6 text-muted-foreground'
            >
              <span />
              <span />
              <span>Mon</span>
              <span />
              <span>Wed</span>
              <span />
              <span>Fri</span>
              <span />
            </div>
            {weeks.map((week, index) => {
              const first = week.find(
                (day) => day && (index === 0 || day.date.endsWith('-01'))
              )
              return (
                <div
                  key={index}
                  className='grid chart-reveal grid-rows-[1rem_repeat(7,1.5rem)] gap-1'
                  style={{ animationDelay: `${Math.min(index * 8, 100)}ms` }}
                >
                  <span
                    aria-hidden='true'
                    className='h-4 text-xs text-muted-foreground'
                  >
                    {first
                      ? new Intl.DateTimeFormat(locale, {
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${first.date}T00:00:00Z`))
                      : ''}
                  </span>
                  {week.map((day, row) =>
                    day ? (
                      <Tooltip key={day.date}>
                        <TooltipTrigger asChild>
                          <button
                            type='button'
                            onClick={() => setSelected(day)}
                            aria-label={`${dateLabel(day.date, locale)}: ${day.count} saved assessments`}
                            aria-pressed={selected?.date === day.date}
                            className={cn(
                              'size-6 rounded-[3px] chart-cell-motion outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                              tones[activityLevel(day.count)],
                              selected?.date === day.date &&
                                'ring-2 ring-ring ring-offset-1 ring-offset-card'
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent className='motion-reduce:animate-none motion-reduce:transition-none'>
                          {dateLabel(day.date, locale)} · {day.count} assessment
                          {day.count === 1 ? '' : 's'}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span key={row} className='size-6' />
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
        <div className='mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground'>
          <p role='status'>
            {selected
              ? `${dateLabel(selected.date, locale)}: ${selected.count} assessments`
              : 'Select a day to inspect activity. Dates use UTC.'}
          </p>
          <div
            className='flex items-center gap-1.5'
            aria-label='Activity intensity: none, 1–2, 3–5, 6–10, more than 10 assessments'
          >
            <span>Less</span>
            {tones.map((tone) => (
              <span
                key={tone}
                aria-hidden='true'
                className={cn('size-3 rounded-[2px]', tone)}
              />
            ))}
            <span>More</span>
          </div>
        </div>
        {total === 0 && (
          <p className='mt-4 text-sm text-muted-foreground'>
            No assessments saved in this period. Adopt standards and collect
            check results to start assessing changes.
          </p>
        )}
        <p className='mt-4 text-xs text-muted-foreground'>
          This chart counts saved assessments. It does not show whether checks
          passed or changes are ready to merge.
        </p>
      </CardContent>
    </Card>
  )
}
