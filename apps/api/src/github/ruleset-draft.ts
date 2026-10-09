import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { validProfileBranch } from './repository-profile.js'
export const readinessCheck = 'Preflyt / Engineering Readiness'
export type DraftInput = {
  name: string
  profile: 'STANDARD' | 'STRICT' | 'CUSTOM'
  branches: string[]
  approvals: number
  requirePullRequest: boolean
  resolveConversations: boolean
  preventForcePush: boolean
  preventDeletion: boolean
  expectedSelectionId: string | null
}
export function draftDefinition(input: DraftInput, githubId: string) {
  if (
    !input ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.trim().length > 100 ||
    /[\x00-\x1f\x7f]/.test(input.name)
  )
    throw new BadRequestException('Enter a ruleset name up to 100 characters')
  if (!['STANDARD', 'STRICT', 'CUSTOM'].includes(input.profile))
    throw new BadRequestException('Choose a protection profile')
  if (
    !Array.isArray(input.branches) ||
    input.branches.length < 1 ||
    input.branches.length > 20 ||
    input.branches.some((branch) => !validProfileBranch(branch)) ||
    new Set(input.branches).size !== input.branches.length
  )
    throw new BadRequestException('Choose 1 to 20 different branch names')
  if (
    !Number.isInteger(input.approvals) ||
    input.approvals < 0 ||
    input.approvals > 6 ||
    [
      'requirePullRequest',
      'resolveConversations',
      'preventForcePush',
      'preventDeletion',
    ].some((key) => typeof input[key as keyof DraftInput] !== 'boolean')
  )
    throw new BadRequestException('Invalid protection options')
  if (
    !/^[1-9]\d{0,15}$/.test(githubId) ||
    !Number.isSafeInteger(Number(githubId))
  )
    throw new BadRequestException('Invalid repository ID')
  const strict = input.profile === 'STRICT',
    custom = input.profile === 'CUSTOM'
  const options = {
    approvals: custom ? input.approvals : strict ? 2 : 1,
    requirePullRequest: custom ? input.requirePullRequest : true,
    resolveConversations: custom ? input.resolveConversations : strict,
    preventForcePush: custom ? input.preventForcePush : true,
    preventDeletion: custom ? input.preventDeletion : true,
  }
  const rules: { type: string; parameters?: Record<string, unknown> }[] = []
  if (options.requirePullRequest)
    rules.push({
      type: 'pull_request',
      parameters: {
        required_approving_review_count: options.approvals,
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: strict,
        require_last_push_approval: strict,
        required_review_thread_resolution: options.resolveConversations,
        allowed_merge_methods: ['merge', 'squash', 'rebase'],
      },
    })
  if (options.preventForcePush) rules.push({ type: 'non_fast_forward' })
  if (options.preventDeletion) rules.push({ type: 'deletion' })
  rules.push({
    type: 'required_status_checks',
    parameters: {
      required_status_checks: [{ context: readinessCheck }],
      strict_required_status_checks_policy: strict,
    },
  })
  return {
    name: input.name.trim(),
    target: 'branch',
    enforcement: 'disabled',
    conditions: {
      repository_id: { repository_ids: [Number(githubId)] },
      ref_name: {
        include: [...input.branches]
          .sort()
          .map((branch) => `refs/heads/${branch}`),
        exclude: [],
      },
    },
    rules,
    bypass_actors: [],
  }
}
export function draftHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
