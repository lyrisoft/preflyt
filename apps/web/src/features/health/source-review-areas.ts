import type { HealthReport } from './health-api'

export const reviewAreaOutcomes = {
  reported: { label: 'Finding reported', tone: 'info' },
  no_issue_found: { label: 'No issue reported', tone: 'neutral' },
  ruled_out: { label: 'Concern ruled out', tone: 'neutral' },
  not_applicable: { label: 'Not applicable', tone: 'neutral' },
  needs_follow_up: { label: 'Needs review', tone: 'warning' },
} as const

type CoverageRow = {
  surface: string
  riskArea: string
  outcome: keyof typeof reviewAreaOutcomes
  notes: string[]
}

export function sourceReviewAreas(
  coverage: HealthReport['sourceReviewCoverage']
): CoverageRow[] {
  const rows: CoverageRow[] = (coverage?.entries ?? []).map((entry) => ({
    ...entry,
    notes: [],
  }))
  for (const gap of coverage?.gaps ?? []) {
    const match = rows.find(
      (row) => row.surface === gap.surface && row.riskArea === gap.riskArea
    )
    if (match) {
      if (!match.notes.includes(gap.detail)) match.notes.push(gap.detail)
    } else
      rows.push({ ...gap, outcome: 'needs_follow_up', notes: [gap.detail] })
  }
  return rows
}
