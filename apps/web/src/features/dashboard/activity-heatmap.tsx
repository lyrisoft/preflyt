import { useState } from 'react'
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
import {
  activityLevel,
  activityWeeks,
  type ActivityDay,
} from './activity-calendar'

const tones = [
  'bg-muted',
  'bg-primary/20',
  'bg-primary/40',
  'bg-primary/65',
  'bg-primary',
]
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))

export function ActivityHeatmap({
  from,
  to,
  activity,
}: {
  from: string
  to: string
  activity: ActivityDay[]
}) {
  const weeks = activityWeeks(from, to, activity)
  const [selected, setSelected] = useState<ActivityDay | null>(null)
  const total = activity.reduce((sum, day) => sum + day.count, 0)
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>Assessment activity</CardTitle>
        <CardDescription>
          {total.toLocaleString()} snapshot{total === 1 ? '' : 's'} recorded ·{' '}
          {dateLabel(from)}–{dateLabel(to)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto pb-2'>
          <div className='mx-auto flex w-max gap-2'>
            <div
              aria-hidden='true'
              className='grid grid-rows-8 gap-1 text-[10px] leading-4 text-muted-foreground'
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
                <div key={index} className='grid grid-rows-8 gap-1'>
                  <span
                    aria-hidden='true'
                    className='h-4 text-[10px] text-muted-foreground'
                  >
                    {first
                      ? new Intl.DateTimeFormat(undefined, {
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
                            aria-label={`${dateLabel(day.date)}: ${day.count} assessment snapshots`}
                            aria-pressed={selected?.date === day.date}
                            className={cn(
                              'size-4 rounded-[3px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                              tones[activityLevel(day.count)],
                              selected?.date === day.date &&
                                'ring-2 ring-ring ring-offset-1 ring-offset-card'
                            )}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {dateLabel(day.date)} · {day.count} snapshot
                          {day.count === 1 ? '' : 's'}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span key={row} className='size-4' />
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
              ? `${dateLabel(selected.date)}: ${selected.count} snapshots`
              : 'Select a day to inspect activity. Dates use UTC.'}
          </p>
          <div
            className='flex items-center gap-1.5'
            aria-label='Activity intensity: none, 1–2, 3–5, 6–10, more than 10 snapshots'
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
            No snapshots recorded in this period. Adopt standards and collect CI
            evidence to start assessing changes.
          </p>
        )}
        <p className='mt-4 text-xs text-muted-foreground'>
          Activity measures snapshot volume. It does not indicate passing checks
          or merge readiness.
        </p>
      </CardContent>
    </Card>
  )
}
