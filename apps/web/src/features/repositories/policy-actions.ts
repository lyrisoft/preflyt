export function policyActions(input: {
  state: string
  stale: boolean
  canPublish: boolean
  platformAdmin: boolean
  actorId?: string
  draftedById: string
  truncated: boolean
}) {
  const self = input.actorId === input.draftedById
  const approvalReason =
    !input.canPublish || !input.actorId
      ? 'You need policy publishing permission for this repository.'
      : input.stale
        ? 'Update this draft to use the latest saved standards before approval.'
        : self && !input.platformAdmin
          ? 'Another authorized publisher must approve your draft. Only the recovery Super Admin can approve its own draft.'
          : ''
  const publicationReason = !input.canPublish
    ? 'You need policy publishing permission for this repository.'
    : input.stale
      ? 'The saved standards changed. Update the draft before continuing.'
      : input.state !== 'APPROVED'
        ? 'Approve this policy first. Publish policy becomes available after approval.'
        : input.truncated
          ? 'Reload a complete policy history before publishing.'
          : ''
  return {
    canApprove: input.state === 'DRAFT' && !approvalReason,
    canPublish: input.state === 'APPROVED' && !publicationReason,
    approvalReason,
    publicationReason,
  }
}
