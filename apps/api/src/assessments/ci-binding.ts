export type Binding = {
  ruleId: string
  kind: 'check_run' | 'workflow_run'
  appId?: string
  checkName?: string
  workflowId?: string
}
export function identityMatches(binding: Binding, identity: unknown): boolean {
  if (!identity || typeof identity !== 'object') return false
  const i = identity as Record<string, unknown>
  return (
    i.kind === binding.kind &&
    (binding.kind === 'check_run'
      ? i.appId === binding.appId && i.checkName === binding.checkName
      : i.workflowId === binding.workflowId)
  )
}
export function runAttempt(identity: unknown): number {
  if (!identity || typeof identity !== 'object') return 0
  const i = identity as Record<string, unknown>
  return i.kind === 'workflow_run' && typeof i.runAttempt === 'number'
    ? i.runAttempt
    : 0
}
export function resolveBindings(
  bindings: Binding[],
  observations: {
    deliveryId: string
    sourceObjectId: string
    sourceIdentity?: unknown
    sourceUpdatedAt: Date | null
    observedAt: Date
  }[],
) {
  const mappings: {
      ruleId: string
      deliveryId: string
      bindingApproved: true
    }[] = [],
    ambiguousRules: string[] = []
  for (const binding of bindings) {
    const matches = observations.filter((row) =>
      identityMatches(binding, row.sourceIdentity),
    )
    if (
      new Set(matches.map((row) => row.sourceObjectId)).size > 1 ||
      (binding.kind === 'workflow_run' &&
        matches.length > 1 &&
        matches.some((row) => !runAttempt(row.sourceIdentity)))
    ) {
      ambiguousRules.push(binding.ruleId)
      continue
    }
    matches.sort(
      (a, b) =>
        runAttempt(b.sourceIdentity) - runAttempt(a.sourceIdentity) ||
        (b.sourceUpdatedAt?.getTime() ?? 0) -
          (a.sourceUpdatedAt?.getTime() ?? 0) ||
        b.observedAt.getTime() - a.observedAt.getTime() ||
        b.deliveryId.localeCompare(a.deliveryId),
    )
    if (matches[0])
      mappings.push({
        ruleId: binding.ruleId,
        deliveryId: matches[0].deliveryId,
        bindingApproved: true,
      })
  }
  return { mappings, ambiguousRules }
}
