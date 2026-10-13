import { ServiceUnavailableException } from '@nestjs/common'

export type RulesetSummary = {
  id: number
  name: string
  target: string
  sourceType: string
  source: string
  enforcement: 'active' | 'disabled' | 'evaluate'
  htmlUrl: string
}
export type RulesetDetail = RulesetSummary & {
  branches: { include: string[]; exclude: string[] }
  rules: {
    type: string
    requiredApprovals: number | null
    checks: { context: string; integrationId: number | null }[]
  }[]
}
function invalid(): never {
  throw new ServiceUnavailableException(
    'GitHub returned an invalid ruleset response',
  )
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalid()
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 4096)
    return invalid()
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 1000) return invalid()
  return value.map(text)
}
export function rulesetSummary(
  value: unknown,
  repository: string,
): RulesetSummary {
  const data = record(value)
  if (
    !Number.isSafeInteger(data.id) ||
    Number(data.id) < 1 ||
    !['active', 'disabled', 'evaluate'].includes(String(data.enforcement))
  )
    return invalid()
  const sourceType = text(data.source_type)
  if (!['Repository', 'Organization', 'Enterprise'].includes(sourceType))
    return invalid()
  return {
    id: Number(data.id),
    name: text(data.name),
    target: text(data.target),
    sourceType,
    source: text(data.source),
    enforcement: data.enforcement as RulesetSummary['enforcement'],
    htmlUrl: `https://github.com/${repository.split('/').map(encodeURIComponent).join('/')}/rules/${data.id}`,
  }
}
export function rulesetDetail(
  value: unknown,
  repository: string,
  expectedId: number,
): RulesetDetail {
  const data = record(value)
  const summary = rulesetSummary(data, repository)
  if (
    summary.id !== expectedId ||
    !Array.isArray(data.rules) ||
    data.rules.length > 100
  )
    return invalid()
  const conditions =
    data.conditions === undefined ? {} : record(data.conditions)
  const refs =
    conditions.ref_name === undefined
      ? { include: [], exclude: [] }
      : record(conditions.ref_name)
  return {
    ...summary,
    branches: {
      include: strings(refs.include),
      exclude: strings(refs.exclude),
    },
    rules: data.rules.map((value) => {
      const rule = record(value)
      const params =
        rule.parameters === undefined ? {} : record(rule.parameters)
      const checks = params.required_status_checks ?? []
      if (!Array.isArray(checks) || checks.length > 100) return invalid()
      const approvals = params.required_approving_review_count
      if (
        approvals !== undefined &&
        (!Number.isInteger(approvals) ||
          Number(approvals) < 0 ||
          Number(approvals) > 100)
      )
        return invalid()
      return {
        type: text(rule.type),
        requiredApprovals: approvals === undefined ? null : Number(approvals),
        checks: checks.map((value) => {
          const check = record(value)
          const id = check.integration_id
          if (
            id !== undefined &&
            id !== null &&
            (!Number.isSafeInteger(id) || Number(id) < 1)
          )
            return invalid()
          return {
            context: text(check.context),
            integrationId: id === undefined || id === null ? null : Number(id),
          }
        }),
      }
    }),
  }
}
