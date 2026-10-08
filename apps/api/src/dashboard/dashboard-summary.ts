import { readPullRequestContext } from '../github-events/pull-request-context.js'

export function attentionReason(
  row: {
    context: unknown
    syncState: string
    verifiedAt: Date | null
    verifiedInstallationId: string | null
    verifiedAccessRevision: number | null
  },
  repository: {
    githubId: bigint
    installationId: bigint
    installation: { accessRevision: number }
    standards: { id: string }[]
  },
  now: Date,
) {
  const context = readPullRequestContext(row.context)
  if (!context || context.base.repositoryId !== repository.githubId.toString())
    return 'CONTEXT_UNAVAILABLE'
  if (context.state !== 'open' || context.merged) return 'CLOSED'
  const age = row.verifiedAt
    ? now.getTime() - row.verifiedAt.getTime()
    : Infinity
  if (
    row.syncState !== 'SYNCED' ||
    age < 0 ||
    age >= 300000 ||
    row.verifiedInstallationId !== repository.installationId.toString() ||
    row.verifiedAccessRevision !== repository.installation.accessRevision
  )
    return 'AWAITING_SYNC'
  if (context.head.repositoryId !== context.base.repositoryId)
    return 'FORK_HEAD_UNSUPPORTED'
  if (!repository.standards.length) return 'STANDARDS_NOT_ADOPTED'
  return 'EXECUTION_NOT_VERIFIED'
}

export function profileTechnologies(report: unknown) {
  if (
    !report ||
    typeof report !== 'object' ||
    !('signals' in report) ||
    !Array.isArray(report.signals)
  )
    return []
  return report.signals
    .flatMap((signal: unknown) => {
      if (!signal || typeof signal !== 'object') return []
      const s = signal as { id?: string; observations?: unknown }
      return ['languages', 'frameworks'].includes(s.id ?? '') &&
        Array.isArray(s.observations)
        ? s.observations
            .filter(
              (value): value is string =>
                typeof value === 'string' && value.length <= 80,
            )
            .slice(0, 4)
        : []
    })
    .slice(0, 6)
}
