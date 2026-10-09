# Versioned advisory policy review

The Policies page now supports repository-scoped, explicit-branch advisory definitions. Save a standards selection, enter a full branch ref such as `refs/heads/development`, optionally strengthen advisory rules, and create a draft. Review its frozen rule requirements, pack versions and definition hash. A different authorized publisher must approve the exact definition before publication, except an active local Super Admin may approve its own definition with an audited exception.

Open a policy revision on **Policies → Standards**. The review drawer keeps **Approve policy** and **Publish policy** visible for drafts, with disabled actions explaining the required permission, independent review or changed standards. Approve the exact draft first; publication becomes available when its state is Approved. GitHub sign-in as an organization Owner/Admin does not automatically confer the recovery Super Admin self-approval exception.

This increment persists reviewed definitions. Assessment previews still evaluate their frozen standards selections; publishing a definition does not change existing assessments, publish a GitHub check or activate enforcement. Organization baselines, applicability evaluation, exceptions and verified passing check publication remain P2 work; manual non-passing publication is available separately under Quality Gates. The UI states this boundary explicitly.

`policy.draft` permits drafting. `policy.publish` permits approval/publication. Owners, Admins and Policy Managers have these permissions, with assigned repository boundaries for Policy Managers. A platform role label alone grants no organization/repository access. Independent approval remains mandatory for Owners/Admins unless the actor is also an active local Super Admin. Publication rechecks the approver's current permission and assignment, rejects older drafts replacing newer publications, and requires the currently published revision ID as an optimistic concurrency precondition.

Approved and published definitions are immutable; drafts can be edited against the latest saved standards before approval. Their SHA-256 covers frozen requirements, pack versions/digests and repository/organization/branch context. Changes require another revision and independent review, except an active local Super Admin may approve its own definition with an explicit audited `SUPER_ADMIN_SELF_APPROVAL` marker. Organization/repository authorization still applies, and publication rechecks the Super Admin status. This exception does not allow self-approved waivers or enforcement bypass. The current standards baseline must match at draft, approval and publication. Existing mandatory requirements cannot be weakened through this API. Changed baselines invalidate approval/publication attempts. All successful transitions and rejected transition attempts are audited; successful transitions and their audit events commit atomically.

Endpoints, all requiring a live scoped session:

- `GET /github/repositories/:repositoryId/gate-policies`: latest 50 revisions and current baseline selection. Incomplete history disables publication in the UI.
- `POST /github/repositories/:repositoryId/gate-policies`: `expectedSelectionId`, explicit `branchRef`, and `requiredRules` (only strengthening existing rules).
- `POST /github/repositories/:repositoryId/gate-policies/:policyId/approve`: `expectedHash`.
- `POST /github/repositories/:repositoryId/gate-policies/:policyId/publish`: `expectedHash`, `expectedPublishedId` (null for first publication).

Apply migration `20261009024500_gate_policy_approvals` using the existing API migration service or `pnpm --filter @preflyt/api prisma:migrate`; regenerate the Prisma client and deploy API/web together. No additional service, token scope or repository execution is introduced. The local database migration has been applied; the user's API was not manually restarted.

Focused integration tests cover live permissions and assignments, independent approval, immutable baseline hashes, stale versions, forbidden enforcement fields, optimistic concurrency, rollback on audit failure, and explicit branch validation. Browser checks remain skipped as requested.
