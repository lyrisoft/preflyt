import type { StatusTone } from '@/components/status-badge'
import type { FindingAiResult } from './finding-ai-api'

export type FindingGuidance = {
  version: 1 | 2
  source: 'PREFLYT_RULE_GUIDANCE'
  rule: string
  why: string
  fix: string
  limits: string
  reference?: string
}

export type VaptAnalysis = {
  version: 1
  status: 'NEEDS_REVIEW'
  reasoning: string
  impact: string
  remediation: string
  preconditions: string
  verificationSteps: string
  counterevidence: string
}

export type Finding = {
  aiReview?: VaptAnalysis
  origin?: 'ci' | 'health' | 'ai'
  recommendation?: string
  impact?: string | null
  pullRequest?: number
  pullRequestUrl?: string
  codeSide?: 'LEFT' | 'RIGHT' | null
  evidenceLocations?: {
    ref: string
    path?: string
    line?: number
    side?: string
    label?: string
  }[]
  health?: string
  healthFingerprint?: string
  relatedLocations?: { path: string; line: number; endLine: number }[]
  id: string
  title: string
  repositoryId: string
  repository: string
  sourceSha: string
  assessmentId: string
  observedAt: string | null
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
  referenceGuidance?: Omit<FindingGuidance, 'source'> & {
    source: 'PREFLYT_RULE_REFERENCE'
    problem?: string
  }
  guidance?: FindingGuidance
  aiGuidance?: FindingAiResult & { model: string | null }
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
  low: 'success',
  unknown: 'neutral',
}
export const triageLabels: Record<string, string> = {
  IGNORED: 'Ignored',
  REPORTED: 'Reported',
  IN_REVIEW: 'In review',
  RESOLVED: 'Resolved',
}
