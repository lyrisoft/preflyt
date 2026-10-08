export type ActivityDay = { date: string; count: number }

/** UTC calendar days, Sunday-first weeks. Padding days are not part of the period. */
export function activityWeeks(
  from: string,
  to: string,
  activity: ActivityDay[]
) {
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  if (!Number.isFinite(days) || days < 1 || days > 366) return []
  const counts = new Map(activity.map((day) => [day.date, day.count]))
  const cells: (ActivityDay | null)[] = Array(start.getUTCDay()).fill(null)
  for (let index = 0; index < days; index++) {
    const date = new Date(start.getTime() + index * 86400000)
      .toISOString()
      .slice(0, 10)
    const count = counts.get(date) ?? 0
    cells.push({
      date,
      count: Number.isSafeInteger(count) && count >= 0 ? count : 0,
    })
  }
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7)
  )
}

export function activityLevel(count: number) {
  return count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4
}
