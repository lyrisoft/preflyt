import { expect, it } from 'vitest'
import {
  draftDefinition,
  draftHash,
  readinessCheck,
  type DraftInput,
} from '../src/github/ruleset-draft.js'
const input = (extra: Partial<DraftInput> = {}): DraftInput => ({
  name: 'Development protection',
  profile: 'STANDARD',
  branches: ['development'],
  approvals: 0,
  requirePullRequest: false,
  resolveConversations: false,
  preventForcePush: false,
  preventDeletion: false,
  expectedSelectionId: null,
  ...extra,
})
it('keeps Standard protections disabled with exact repository and branch scope', () => {
  const result = draftDefinition(
    input({ branches: ['release/v1', 'development'] }),
    '51',
  )
  expect(result).toMatchObject({
    enforcement: 'disabled',
    target: 'branch',
    conditions: {
      repository_id: { repository_ids: [51] },
      ref_name: {
        include: ['refs/heads/development', 'refs/heads/release/v1'],
        exclude: [],
      },
    },
    bypass_actors: [],
  })
  expect(result.rules).toEqual(
    expect.arrayContaining([
      { type: 'non_fast_forward' },
      { type: 'deletion' },
    ]),
  )
  expect(
    result.rules.find((r) => r.type === 'pull_request')?.parameters
      ?.required_approving_review_count,
  ).toBe(1)
  expect(
    result.rules.find((r) => r.type === 'required_status_checks')?.parameters
      ?.required_status_checks,
  ).toEqual([{ context: readinessCheck }])
})
it('applies Strict defaults and bounds Custom options without activating', () => {
  const strict = draftDefinition(input({ profile: 'STRICT' }), '51')
  expect(
    strict.rules.find((r) => r.type === 'pull_request')?.parameters,
  ).toMatchObject({
    required_approving_review_count: 2,
    required_review_thread_resolution: true,
  })
  expect(
    strict.rules.find((r) => r.type === 'required_status_checks')?.parameters
      ?.strict_required_status_checks_policy,
  ).toBe(true)
  const custom = draftDefinition(input({ profile: 'CUSTOM' }), '51')
  expect(custom.rules.map((r) => r.type)).toEqual(['required_status_checks'])
  expect(custom.enforcement).toBe('disabled')
})
it.each(['refs/heads/main', '*', '../main', 'main.lock', '', '@', 'a b'])(
  'rejects non-explicit branch %s',
  (branch) => {
    expect(() => draftDefinition(input({ branches: [branch] }), '51')).toThrow(
      'branch names',
    )
  },
)
it('rejects duplicate targets, unsafe IDs and unsupported controls', () => {
  expect(() =>
    draftDefinition(input({ branches: ['main', 'main'] }), '51'),
  ).toThrow()
  expect(() => draftDefinition(input(), '9007199254740992')).toThrow()
  expect(() => draftDefinition(input({ approvals: 7 }), '51')).toThrow()
  expect(() =>
    draftDefinition(
      input({ requirePullRequest: 'yes' as unknown as boolean }),
      '51',
    ),
  ).toThrow()
  expect(() => draftDefinition(input({ name: '\u007f' }), '51')).toThrow()
})
it('hashes sorted branch targets consistently while distinguishing standards versions', () => {
  const one = draftDefinition(
    input({ branches: ['main', 'development'] }),
    '51',
  )
  const two = draftDefinition(
    input({ branches: ['development', 'main'] }),
    '51',
  )
  expect(draftHash(one)).toBe(draftHash(two))
  expect(draftHash({ definition: one, selectionId: 'v1' })).not.toBe(
    draftHash({ definition: one, selectionId: 'v2' }),
  )
})
