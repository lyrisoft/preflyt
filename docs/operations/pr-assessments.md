# PR-triggered assessments

Open same-repository pull-request deliveries now create historical exact-head assessments through the existing signed webhook and worker. No repository code is executed, GitHub check is published or gate evaluated. The UI is unchanged; the existing assessment list/detail API exposes the new snapshots.

## Activation and contract

Enable the [signed webhook worker](github-events.md), select the repository and adopt its Engineering Standards. Supported PR actions remain opened, reopened, synchronize, edited and ready_for_review; closed deliveries are retained but do not create assessments. Draft PRs may have snapshots, with draft status preserved.

Signed PR context freezes head and base repository IDs, exact refs and commit SHAs, state, draft/merged flags, PR number and source object ID. Raw titles, bodies, sender details and URLs are discarded. The additive nullable delivery column supports older records without inferring missing base context.

The assessment request records subjectKind PULL_REQUEST, trigger GITHUB_PR, sourceDeliveryId, null actor, the full allowlisted pullRequest context and baseContext. sourceSha always equals the PR head SHA. Standards and any approved CI bindings are pinned at processing time, rather than inferred from the provider event timestamp. The request, plan and report share the existing integrity hash and immutable API semantics.

A PR without head CI/profile evidence still receives an assessment: absent required CI is MISSING and required coverage remains INCOMPLETE. Profiles and observations from the base or a synthetic merge SHA are never borrowed. [Approved source bindings](ci-bindings.md) apply only to evidence for the same installed repository and exact head SHA. Provider outcomes remain distinct from verified rule execution; ruleOutcome and qualityGate stay null.

## Safe boundaries

Processing records a fixed assessmentReason when it cannot create a snapshot:

- standards_not_adopted: no adopted repository selection.
- pr_context_unavailable: missing or inconsistent head/base context, including historical minimized records.
- pr_not_open: closed/merged PR or a closed action.
- fork_head_not_supported: head repository differs from the installed base repository. The signed delivery remains available; this slice does not borrow base-repository evidence for a fork.

Access revoked before processing marks the delivery IGNORED. Assessment creation, delivery processing and audit writes commit atomically; failed transactions leave the delivery retryable. Duplicate/concurrent processing cannot duplicate snapshots or audit events.

Out-of-order deliveries create separate snapshots for their reported heads and bases. They never advance a current-PR pointer or claim branch readiness. Even the newest receipt is not evidence that a PR is currently open or at that revision. CI events arriving later continue to create COMMIT assessments; they do not silently rewrite or upgrade a prior PR snapshot. A subsequent supported PR delivery creates another snapshot from then-available exact-head evidence.

Current PR state reconciliation, linking later CI assessments into a PR readiness view, fork-safe evidence support, trusted execution coverage and policy gates remain later slices. No additional provider API request is needed for this implementation.

## Verification

Run the PR context, assessment integration and signed webhook tests against an isolated migrated database. Coverage includes allowlist validation, head/base pinning, missing CI, SHA isolation, approved bindings, drafts, changing bases, delayed heads, forks, access changes, concurrent replay and audit rollback. Browser/full-system tests and live GitHub demonstrations are not included in these local checks.
