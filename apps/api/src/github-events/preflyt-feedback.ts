import { configurationValue } from '../configuration/runtime-configuration.js'
import { Prisma } from '../generated/prisma/client.js'

const names = ['Preflyt / Engineering Readiness', 'Preflyt / AI Review']
export function isPreflytFeedback(identity: unknown) {
  const value = identity as { kind?: string; appId?: string; checkName?: string } | null
  const appId = configurationValue('GITHUB_APP_ID')
  return !!appId && value?.kind === 'check_run' && value.appId === appId && names.includes(value.checkName ?? '')
}
/** Exclude previously imported feedback too: published checks are output, not CI input. */
export function excludePreflytFeedback(): Prisma.ImportedCiEvidenceWhereInput {
  const appId = configurationValue('GITHUB_APP_ID')
  return appId ? { OR: [{ sourceIdentity: { equals: Prisma.DbNull } }, { NOT: { AND: [
    { sourceKind: 'check_run' },
    { sourceIdentity: { path: ['appId'], equals: appId } },
    { OR: names.map(name => ({ sourceIdentity: { path: ['checkName'], equals: name } })) },
  ] } }] } : {}
}
