import { ConflictException } from '@nestjs/common'
import { digest } from '../assessments/assessment-digest.js'
import { inheritedTeamStandards, verifyTeamContext } from '../teams/team-context.js'
import { resolvePacks, type PackRef } from './catalogue.js'

// Policy standards live in the existing immutable revision definition. Repository
// defaults remain readable for older policies and assessments.
export function policySelectionId(repositoryId: string, branchRef: string, selection: {
  profile: string; packs: unknown; teamContext?: unknown
}) {
  return `policy-${digest({ repositoryId, branchRef, profile: selection.profile,
    packs: selection.packs, teamContext: selection.teamContext ?? [] })}`
}

export async function currentStandards(db: any, repositoryId: string, options: {
  expectedId?: string; branchRef?: string; policyId?: string; allowDraft?: boolean; verifyContext?: boolean
} = {}): Promise<any> {
  const owned = options.expectedId?.startsWith('policy-')
  let policy
  if (owned || options.policyId || options.branchRef) {
    policy = await db.gatePolicyRevision.findFirst({
      where: { repositoryId,
        ...(options.policyId ? { id: options.policyId } : {}),
        ...(owned ? { selectionId: options.expectedId } : {}),
        ...(options.branchRef ? { branchRef: options.branchRef } : {}),
        state: options.allowDraft ? { in: ['DRAFT', 'APPROVED', 'PUBLISHED'] } : 'PUBLISHED',
      }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  }
  const definition = policy?.definition
  if (definition?.standardsSource === 'POLICY') {
    const selection = { id: policy.selectionId, profile: definition.adoptionProfile,
      packs: definition.packs, teamContext: definition.teamContext ?? [],
      revision: policy.revision, createdAt: policy.createdAt, sourceSha: null,
      profileSnapshotId: null, policyId: policy.id, branchRef: policy.branchRef, standardsSource: 'POLICY' }
    if (digest(definition) !== policy.definitionHash ||
      definition.selectionId !== selection.id || definition.branchRef !== policy.branchRef ||
      policySelectionId(repositoryId, policy.branchRef, selection) !== selection.id ||
      !Array.isArray(selection.packs) || !selection.packs.length || selection.packs.length > 5 ||
      resolvePacks(selection.packs as PackRef[]).some((pack, i) => !pack || pack.digest !== selection.packs[i].digest))
      throw new ConflictException('Policy standards could not be verified. Review the policy again.')
    if (policy.state === 'PUBLISHED') {
      const latest = await db.gatePolicyRevision.findFirst({ where: { repositoryId,
        branchRef: policy.branchRef, state: 'PUBLISHED' },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] })
      if (latest?.id !== policy.id) throw new ConflictException('Branch policy changed. Refresh and try again.')
    }
    if (options.verifyContext !== false) {
    await verifyTeamContext(db, repositoryId, selection.teamContext)
    const inherited = await inheritedTeamStandards(db, repositoryId, policy.organizationId)
    if (digest(inherited.context) !== digest(selection.teamContext))
      throw new ConflictException('Organization or team requirements changed. Create and approve a new policy version.')
    }
    return selection
  }
  if (owned || (options.policyId && !policy))
    throw new ConflictException('Branch policy changed or is unavailable. Refresh and try again.')
  return db.repositoryStandardsSelection.findFirst({ where: { repositoryId }, orderBy: { revision: 'desc' } })
}

export async function repositoryStandards(db: any, repositoryId: string, policyId?: string, inspectedBranch?: string) {
  if (policyId) return currentStandards(db, repositoryId, { policyId, allowDraft: true, verifyContext: false })
  if (inspectedBranch) return currentStandards(db, repositoryId, { branchRef: `refs/heads/${inspectedBranch}`, verifyContext: false })
  const repo = await db.gitHubRepository.findUnique({ where: { id: repositoryId }, select: { defaultBranch: true } })
  return currentStandards(db, repositoryId, repo?.defaultBranch ? { branchRef: `refs/heads/${repo.defaultBranch}`, verifyContext: false } : {})
}

export function selectionBindingWhere(repositoryId: string, selectionId?: string) {
  return { repositoryId, ...(selectionId?.startsWith('policy-') ? { selectionId } : { NOT: { selectionId: { startsWith: 'policy-' } } }) }
}
