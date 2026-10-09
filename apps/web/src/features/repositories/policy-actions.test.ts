import { expect, it } from 'vitest'
import { policyActions } from './policy-actions'

const draft = {
  state: 'DRAFT',
  stale: false,
  canPublish: true,
  platformAdmin: false,
  actorId: 'author',
  draftedById: 'author',
  truncated: false,
}
it('keeps self-authored drafts awaiting independent approval for regular publishers', () => {
  const actions = policyActions(draft)
  expect(actions.canApprove).toBe(false)
  expect(actions.canPublish).toBe(false)
  expect(actions.approvalReason).toContain('Another authorized publisher')
  expect(actions.publicationReason).toContain('Approve this policy first')
})
it('allows recovery Super Admin self approval without skipping publication approval', () => {
  const actions = policyActions({ ...draft, platformAdmin: true })
  expect(actions.canApprove).toBe(true)
  expect(actions.canPublish).toBe(false)
  expect(
    policyActions({ ...draft, state: 'APPROVED', platformAdmin: true })
      .canPublish
  ).toBe(true)
})
it('allows independent publishers and denies missing permissions, stale standards and incomplete history', () => {
  expect(policyActions({ ...draft, actorId: 'reviewer' }).canApprove).toBe(true)
  expect(
    policyActions({ ...draft, platformAdmin: true, canPublish: false })
      .canApprove
  ).toBe(false)
  expect(
    policyActions({ ...draft, state: 'APPROVED', canPublish: false }).canPublish
  ).toBe(false)
  expect(
    policyActions({ ...draft, platformAdmin: true, stale: true }).canApprove
  ).toBe(false)
  expect(
    policyActions({ ...draft, state: 'APPROVED', stale: true }).canPublish
  ).toBe(false)
  expect(
    policyActions({ ...draft, state: 'APPROVED', truncated: true }).canPublish
  ).toBe(false)
  expect(policyActions({ ...draft, state: 'PUBLISHED' }).canPublish).toBe(false)
})
