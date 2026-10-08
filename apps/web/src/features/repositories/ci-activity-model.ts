import type { CiObservation } from './repository-queries'
import type { CiResult } from './repository-vocabulary'

export const ciResultOrder: CiResult[] = [
  'SUCCEEDED',
  'FAILED',
  'PENDING',
  'NOT_EXECUTED',
  'UNKNOWN',
]

const emptyCounts = (): Record<CiResult, number> => ({
  SUCCEEDED: 0,
  FAILED: 0,
  PENDING: 0,
  NOT_EXECUTED: 0,
  UNKNOWN: 0,
})

export function summarizeCiActivity(
  observations: Pick<
    CiObservation,
    'result' | 'observedAt' | 'sourceSha' | 'artifacts'
  >[]
) {
  const results = emptyCounts()
  let reports = 0
  const commits = new Set<string>()
  const dates: { result: CiResult; day: number }[] = []
  for (const item of observations) {
    results[item.result] += 1
    reports += item.artifacts.length
    commits.add(item.sourceSha)
    const timestamp = Date.parse(item.observedAt)
    if (Number.isFinite(timestamp)) {
      dates.push({
        result: item.result,
        day: Math.floor(timestamp / 86_400_000),
      })
    }
  }
  const latestDay = dates.length
    ? Math.max(...dates.map((item) => item.day))
    : null
  const earliestDay = dates.length
    ? Math.min(...dates.map((item) => item.day))
    : null
  const days: ({ day: string } & Record<CiResult, number>)[] = []
  if (latestDay !== null && earliestDay !== null) {
    const start = Math.max(earliestDay, latestDay - 13)
    for (let day = start; day <= latestDay; day += 1) {
      days.push({
        day: new Date(day * 86_400_000).toISOString().slice(0, 10),
        ...emptyCounts(),
      })
    }
    for (const item of dates) {
      if (item.day >= start) days[item.day - start][item.result] += 1
    }
  }
  return { results, reports, commits: commits.size, days }
}
