import { healthAnalyses, healthFindingCount, type HealthReport } from './health-report.js'
import type { RepositorySnapshot } from '../github/repository-profile.js'
import { applicableHealthAnalyses } from './health-report.js'

export const healthCategories = ['security', 'reliability', 'maintainability', 'duplication', 'coverage'] as const
export type HealthCategory = (typeof healthCategories)[number]

export function selectedHealthAnalyses(snapshot: RepositorySnapshot, category?: HealthCategory) {
 const applicable = applicableHealthAnalyses(snapshot, false)
 return category ? applicable.filter(analysis => analysis.category === category || (category === 'security' && analysis.category === 'hotspot')) : applicable
}

export function healthCategoryMetric(report: HealthReport, category: HealthCategory): string {
 if (category === 'coverage') {
  const measure = report.measurements?.coverage
  return measure?.analyzedLines ? `${(100 * measure.coveredLines / measure.analyzedLines).toFixed(1)}%` : 'Unavailable'
 }
 if (category === 'duplication') {
  const measure = report.measurements?.duplication
  return measure?.analyzedLines ? `${(100 * measure.duplicatedLines / measure.analyzedLines).toFixed(1)}%` : 'Unavailable'
 }
 const ids = new Set<string>(healthAnalyses.filter(a => a.category === category).map(a => a.id))
 const analyses = report.analyses.filter(a => ids.has(a.id))
 const validated = analyses.filter(a => ['PASS', 'FAIL'].includes(a.state) && a.findingsRetained !== undefined)
 const count = healthFindingCount(report, category, [...ids])
 const incomplete = validated.length !== analyses.length || validated.some(a => a.findingsReported !== undefined && a.findingsReported > (a.findingsRetained ?? 0))
 return validated.length && !incomplete ? count.toLocaleString() : count ? `≥${count.toLocaleString()}` : 'Unavailable'
}
