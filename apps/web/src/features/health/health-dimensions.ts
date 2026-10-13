import type { HealthData, HealthReport } from './health-api'

export function healthDimensionValues(
  report: HealthReport,
  _review: HealthData['hotspotReview'],
  requestedCoverage: boolean
) {
  const count = (category: string, ids: string[]) => {
    const analyses = report.analyses.filter((a) => ids.includes(a.id))
    const validated = analyses.filter(
      (a) =>
        ['PASS', 'FAIL'].includes(a.state) && a.findingsRetained !== undefined
    )
    const found = report.findings.filter((f) => f.category === category && ids.includes(f.checkId)).length
    if (!validated.length) return found ? `≥${found.toLocaleString()}` : 'Unavailable'
    const incomplete =
      validated.length !== analyses.length ||
      validated.some(
        (a) =>
          a.findingsReported !== undefined &&
          a.findingsReported > (a.findingsRetained ?? 0)
      )
    return incomplete
      ? found
        ? `≥${found.toLocaleString()}`
        : 'Unavailable'
      : found.toLocaleString()
  }
  const duplication = report.measurements?.duplication,
    coverage = report.measurements?.coverage
  return {
    security: count('security', [
      'secrets.scan',
      'security.sast',
      'security.dependencies',
      'iac.policy',
    ]),
    reliability: count('reliability', ['quality.reliability']),
    maintainability: count('maintainability', ['quality.maintainability']),
    duplication:
      duplication && duplication.analyzedLines > 0
        ? `${((100 * duplication.duplicatedLines) / duplication.analyzedLines).toFixed(1)}%`
        : 'Unavailable',
    hotspots: count('hotspot', ['security.hotspots']),
    coverage:
      coverage && coverage.analyzedLines > 0
        ? `${((100 * coverage.coveredLines) / coverage.analyzedLines).toFixed(1)}%`
        : requestedCoverage
          ? 'Unavailable'
          : 'Awaiting CI coverage',
  }
}
