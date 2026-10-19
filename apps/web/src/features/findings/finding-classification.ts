import { triageLabels, type Finding } from './finding-types'

export const classificationLabels: Record<string, string> = {
  POTENTIAL: 'Potential',
  LIKELY: 'Likely',
  CONFIRMED: 'Confirmed',
  FALSE_POSITIVE: 'False positive',
}

export function findingStatus(
  finding: Pick<Finding, 'status' | 'review' | 'triage'>
) {
  if (finding.status === 'Ignored') return 'Ignored'
  const classification = finding.review?.classification
  if (classification && classificationLabels[classification])
    return classificationLabels[classification]
  return finding.triage?.state && finding.triage.state !== 'REPORTED'
    ? (triageLabels[finding.triage.state] ?? finding.status)
    : finding.status
}
