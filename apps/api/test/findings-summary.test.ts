import { expect, it } from 'vitest'
import { summarizeFindings } from '../src/findings/findings-summary.js'

it('counts matching entries across both tabs and excludes source suppressions', () => {
  const rows = [
    {
      repositoryId: '1',
      category: 'security',
      status: 'Reported',
      severity: 'critical',
      ruleId: 'sql',
    },
    {
      repositoryId: '1',
      category: 'check',
      status: 'Failed',
      severity: 'high',
      ruleId: 'security.sast',
    },
    {
      repositoryId: '2',
      category: 'evidence',
      status: 'Evidence missing',
      severity: 'high',
      ruleId: 'types.required',
    },
    {
      repositoryId: '3',
      category: 'security',
      status: 'Suppressed',
      severity: 'critical',
      ruleId: 'sql',
    },
  ]
  const summary = summarizeFindings(rows, 'findings')
  expect(summary).toMatchObject({
    reportedIssues: 2,
    criticalHigh: 2,
    affectedRepositories: 2,
    evidenceGaps: 1,
    suppressed: 1,
    chartTotal: 2,
  })
  expect(summary.bySeverity.find((item) => item.name === 'high')?.count).toBe(1)
  expect(summary.byCheck.reduce((sum, item) => sum + item.count, 0)).toBe(2)
  const gaps = summarizeFindings(rows, 'gaps')
  expect(gaps.chartTotal).toBe(1)
  expect(gaps.byCheck).toEqual([{ name: 'types.required', count: 1 }])
  expect(gaps.reportedIssues).toBe(summary.reportedIssues)
})
it('keeps chart totals when more than eight checks match and returns honest empty counts', () => {
  const rows = Array.from({ length: 60 }, (_, index) => ({
    repositoryId: '1',
    category: 'security',
    status: 'Reported',
    severity: 'medium',
    ruleId: `rule-${index}`,
  }))
  const summary = summarizeFindings(rows, 'findings')
  expect(summary.byCheck).toHaveLength(9)
  expect(summary.byCheck.at(-1)).toEqual({ name: 'Other checks', count: 52 })
  expect(summary.byCheck.reduce((sum, item) => sum + item.count, 0)).toBe(60)
  expect(summarizeFindings([], 'findings')).toMatchObject({
    reportedIssues: 0,
    affectedRepositories: 0,
    criticalHigh: 0,
    evidenceGaps: 0,
    chartTotal: 0,
    byCheck: [],
  })
})
