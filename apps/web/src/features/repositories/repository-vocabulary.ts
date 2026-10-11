import type { StatusTone } from '@/components/status-badge'

/**
 * One vocabulary for repository states, shared by every tab so the same
 * condition always reads with the same label and tone.
 */
export type Status = { label: string; tone: StatusTone }

/** API enum to sentence case: CONFIGURATION_OBSERVED -> Configuration observed. */
export function sentence(value: string) {
  const text = value.replace(/_/g, ' ').toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const configFound: Status = { label: 'Related files found', tone: 'success' }
const notFound: Status = { label: 'Not found', tone: 'warning' }
const unknown: Status = { label: 'Not determined', tone: 'neutral' }

export const configurationStatus: Record<string, Status> = {
  HINT_DETECTED: configFound,
  MISSING: notFound,
  UNKNOWN: unknown,
}
export const signalStatus: Record<string, Status> = {
  detected: configFound,
  not_detected: notFound,
  unknown,
}
/** Gaps first, then unknown, then configured. */
export const configurationOrder: Record<string, number> = {
  MISSING: 0,
  UNKNOWN: 1,
  HINT_DETECTED: 2,
}

export function coverageStatus(value: string): Status {
  switch (value) {
    case 'CONFIGURATION_OBSERVED':
      return configFound
    case 'MISSING':
      return notFound
    case 'UNVERIFIED':
      return { label: 'Source not verified', tone: 'warning' }
    case 'SUPERSEDED':
      return { label: 'Newer result available', tone: 'warning' }
    case 'SKIPPED':
      return { label: sentence(value), tone: 'warning' }
    case 'PENDING':
      return { label: 'Pending', tone: 'info' }
    case 'EXPIRED':
      return { label: 'Result expired', tone: 'error' }
    case 'AMBIGUOUS':
      return { label: 'Multiple matching results', tone: 'error' }
    case 'FUTURE':
      return { label: 'Report date is in the future', tone: 'error' }
    case 'NOT_IMPLEMENTED':
      return { label: 'Not available', tone: 'neutral' }
    default:
      return { label: sentence(value), tone: 'neutral' }
  }
}

export type CiResult =
  'SUCCEEDED' | 'FAILED' | 'PENDING' | 'NOT_EXECUTED' | 'UNKNOWN'
export const ciResultStatus: Record<CiResult, Status> = {
  SUCCEEDED: { label: 'Succeeded', tone: 'success' },
  PENDING: { label: 'Pending', tone: 'info' },
  NOT_EXECUTED: { label: 'Not run', tone: 'neutral' },
  UNKNOWN: { label: 'Unknown', tone: 'neutral' },
  FAILED: { label: 'Failed', tone: 'error' },
}

export type DeliveryState = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'FAILED'
export const deliveryStatus: Record<DeliveryState, Status> = {
  RECEIVED: { label: 'Waiting to process', tone: 'info' },
  PROCESSED: { label: 'Recorded', tone: 'success' },
  IGNORED: { label: 'Not processed', tone: 'warning' },
  FAILED: { label: 'Processing failed', tone: 'error' },
}

const sourceKindLabels: Record<string, string> = {
  check_run: 'Check',
  workflow_run: 'Workflow',
  pull_request: 'Pull request',
}
export const sourceLabel = (kind: string, id: string | number) =>
  `${sourceKindLabels[kind] ?? sentence(kind)} #${id}`

/** Mark fills for charts; validated order keeps CVD-confusable hues apart. */
export const toneFill: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral-mark',
}
export const toneTrack: Record<StatusTone, string> = {
  success: 'bg-success/15',
  warning: 'bg-warning/15',
  error: 'bg-danger/15',
  info: 'bg-info/15',
  neutral: 'bg-muted',
}
