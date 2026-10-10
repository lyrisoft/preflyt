type SummaryRow = {
  repositoryId: string
  category: string
  status: string
  severity: string
  ruleId: string | null
}
const severities = ['critical', 'high', 'medium', 'low', 'unknown'] as const
/** Aggregate the same scoped, deduplicated and filtered rows before pagination. */
export function summarizeFindings(rows: SummaryRow[], kind: string) {
  const active = rows.filter((row) => row.status !== 'Suppressed')
  const issues = active.filter((row) => row.category !== 'evidence')
  const gaps = active.filter((row) => row.category === 'evidence')
  const chartRows = kind === 'gaps' ? gaps : issues
  const groups = new Map<string, number>()
  for (const row of chartRows) {
    const name =
      row.ruleId ??
      (row.category === 'evidence' ? 'Missing evidence' : 'Unspecified check')
    groups.set(name, (groups.get(name) ?? 0) + 1)
  }
  const sorted = [...groups].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
  const byCheck = sorted.slice(0, 8).map(([name, count]) => ({ name, count }))
  if (sorted.length > 8)
    byCheck.push({
      name: 'Other checks',
      count: sorted.slice(8).reduce((sum, [, count]) => sum + count, 0),
    })
  return {
    reportedIssues: issues.length,
    affectedRepositories: new Set(active.map((row) => row.repositoryId)).size,
    criticalHigh: issues.filter((row) =>
      ['critical', 'high'].includes(row.severity),
    ).length,
    evidenceGaps: gaps.length,
    suppressed: rows.length - active.length,
    bySeverity: severities.map((name) => ({
      name,
      count: chartRows.filter((row) => row.severity === name).length,
    })),
    byCheck,
    chartTotal: chartRows.length,
  }
}
