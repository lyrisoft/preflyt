import type { StatusTone } from '@/components/status-badge'

export type FindingGuidance = {
  version: 1 | 2
  source: 'PREFLYT_RULE_GUIDANCE'
  rule: string
  why: string
  fix: string
  limits: string
  reference?: string
}

export type Finding = {
  origin?: 'ci' | 'health'
  health?: string
  healthFingerprint?: string
  relatedLocations?: { path: string; line: number; endLine: number }[]
  id: string
  title: string
  repositoryId: string
  repository: string
  sourceSha: string
  assessmentId: string
  observedAt: string
  severity: string
  status: string
  path: string | null
  line: number | null
  endLine?: number | null
  reportGuidance?: {
    version: 1
    source: 'ANALYZER_REPORT'
    explanation?: string
    advice?: string
  }
  guidance?: FindingGuidance
  category?: string
  ruleId: string | null
  evidence: string[]
  verification: string
  occurrences: number
  triage?: {
    state: string
    assigneeId: string | null
    note: string
    revision: number
  }
}
export const severityTone: Record<string, StatusTone> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
  unknown: 'neutral',
}
export const triageLabels: Record<string, string> = {
  REPORTED: 'Reported',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
}
