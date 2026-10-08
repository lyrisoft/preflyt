import { activityWeeks, type ActivityDay } from '../dashboard/activity-calendar'

export type ActivityPoint = { date: string; through: string; count: number }

/** Counts only days in the requested UTC period; partial weeks retain their bounds. */
export function activityTrend(
  from: string,
  to: string,
  activity: ActivityDay[],
  granularity: 'day' | 'week'
) {
  const days = activityWeeks(from, to, activity)
    .flat()
    .filter((day): day is ActivityDay => day !== null)
  const points: ActivityPoint[] = []
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`)
    if (
      granularity === 'day' ||
      date.getUTCDay() === 1 ||
      points.length === 0
    ) {
      points.push({ date: day.date, through: day.date, count: day.count })
    } else {
      const point = points[points.length - 1]
      point.count += day.count
      point.through = day.date
    }
  }
  return {
    points,
    total: days.reduce((sum, day) => sum + day.count, 0),
    activeDays: days.filter((day) => day.count > 0).length,
    peak: days.reduce((peak, day) => Math.max(peak, day.count), 0),
  }
}
