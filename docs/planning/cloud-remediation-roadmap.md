# Cloud remediation PRs: roadmap and implementation plan

**Decision:** 16 October 2026 · **Edition:** Cloud only · **Status:** Planned; not implemented.

Preflyt Cloud will help teams investigate findings, propose fixes and verify them against their engineering standards, then open reviewable draft PRs. A human reviews and merges the change through GitHub's normal controls. This complements Dependabot: dependency update PRs can be inputs to Preflyt's investigation and verification, while Preflyt also addresses findings and CI failures beyond dependency updates.

This is an optional Cloud workstream, not a new P0–P12 phase or a Community release prerequisite. Implementation belongs in separate private Cloud code. Existing Community Health, findings, standards, CI assurance and optional BYOK diff reviews remain included and independently usable. Do not add this roadmap's details to the public pricing page; its simple Cloud coming soon card remains unchanged.

## Current capability and gap

| Capability | Current boundary |
| --- | --- |
| Findings, guidance and deterministic assessments | Existing Community capabilities; reuse their authorized evidence contracts. |
| Advisory AI PR review | Existing; a review does not authorize a fix, execution or merge. |
| Reviewed CI setup PR | Existing, user-triggered workflow setup; not a general code repair agent. |
| Repository context outside the PR diff | Planned open-source P4.RI foundation / issue #97; edition revised 18 October 2026. |
| Investigation → validated patch → draft fix PR | Planned Cloud capability described here; not shipped. |

## User workflow

1. An administrator enables remediation for selected repositories and defines permissions, allowed paths, execution policy and spending limits. The default is disabled.
2. A user selects **Investigate** on a finding, failed check or existing PR, including a Dependabot PR. Pin the repository ID, source commit, assessment and originating PR when applicable.
3. Preflyt presents an evidence-linked explanation, uncertainty, affected files, proposed change and validation plan. Repository-wide context requires the separately enabled repository-intelligence capability in Community Edition.
4. An authorized user approves the bounded fix attempt. A separate isolated job proposes and validates the patch. Investigation approval alone does not grant repository write access.
5. Preflyt shows the diff, original failure evidence, applicable standards and before/after check results. Missing results remain incomplete; failed reproduction or unavailable execution is stated explicitly.
6. The user selects **Create draft PR** for that exact patch and target. A restricted Git writer creates a dedicated branch and one draft PR. It does not edit the originating Dependabot branch or push to a protected branch.
7. Required GitHub checks and human review run normally. Preflyt never approves its own PR, merges it, bypasses protections or deploys it. Findings become resolved only when fresh, comparable assessment evidence supports that conclusion; creating or merging a PR alone is insufficient.

## Initial scope

- One repository and one bounded finding or CI failure per attempt; small, reviewable patches with explicit file and diff-size limits.
- Read-only compatibility investigation of existing dependency PRs. Retain Dependabot as the dependency-update author; deduplicate related work rather than creating competing upgrade PRs.
- Generated regression tests where appropriate, evaluated separately from the trusted baseline checks. Passing agent-authored tests alone does not establish a fix.
- Clear outcomes: evidence-only, blocked, inconclusive, validation failed, ready for draft PR, draft PR created, cancelled or stale.
- Traceable source links, resource usage, approvals, patch hashes, validation artifacts and PR links.

Cross-repository changes, automatic write authorization, direct edits to existing third-party PRs, automatic merges, deployment changes and broad dependency-upgrade campaigns are outside the initial scope. Follow-up work needs separate prioritization and acceptance criteria.

## Architecture and permission boundaries

Architecture review must approve the Cloud/Community interfaces before implementation. This product decision does not approve real-repository execution or relax [ADR-0002](../architecture/ADR-0002-safe-execution-fixtures-remediation-contract.md). Its fixture-only write boundary remains in force until a separate real-repository write qualification is explicitly approved.

- **Investigation service:** reads only authorized tenant/repository evidence and approved revision-pinned context; no Git write capability.
- **Execution service:** approved ephemeral isolation, default-deny egress, bounded CPU/memory/storage/time and cancellation. No host shell fallback, host Docker socket, platform secrets, provider keys or Git write tokens inside repository execution.
- **Validation service:** freezes required checks and policy versions before editing. Re-runs trusted baseline and patched checks in equivalent pinned environments; the agent cannot remove checks, weaken standards, hide skipped tests or manufacture trusted evidence.
- **Git writer:** separate narrowly scoped identity and service. Rechecks tenant, stable provider repository ID, actor permission, approved patch hash, target ref and current HEAD before writing. No merge, review-approval, branch-protection or deployment authority. Sensitive paths such as workflows require separate explicit authorization.
- **Evidence record:** reuse ADR-0002's append-only reproduction/validation contract rather than inventing a parallel evidence model. Record exact original and patched source, environment/tool digests, commands, coverage limits, results, redacted artifacts, model usage, approvals and Git operations.
- **Freshness and recovery:** source/target changes invalidate approvals and results for the old revision. Re-plan and revalidate before writing. Idempotency keys prevent duplicate branches/PRs on retries; partial publication is reconciled without overwriting unrelated work.
- **Data lifecycle:** enforce tenant isolation for indexes, jobs, patches and artifacts; apply source-egress consent, retention/deletion rules, audit access and per-attempt budgets. Repository text, PR comments and tool output cannot grant permissions or override policy.

## Delivery plan

All stages below are pending. These are internal Cloud delivery stages, not changes to the approved core phase order.

| Stage | Work | Exit criteria |
| --- | --- | --- |
| 1. Architecture and contracts | Review ADR-0002, P4.RI dependencies, Cloud ownership, API boundaries, identities, threat model and evidence contract. | Approved architecture and permission matrix; Community behavior unchanged; no execution or write access enabled. |
| 2. Read-only investigations | Add finding/check/PR entry points, revision binding, evidence citations, proposed patch plan and cost limits. Include Dependabot PR inputs. | Unauthorized and cross-tenant requests rejected; claims traceable to authorized evidence; incomplete context and non-reproducible failures visible; no Git writes. |
| 3. Fixture patch generation | Implement bounded patch attempts in approved disposable fixture repositories under ADR-0002's allowlist. | Cancellation, budget enforcement, prompt-injection defenses and patch/path restrictions pass; non-fixture write requests fail at admission and writer. |
| 4. Independent validation | Reproduce baseline where possible and validate patched trees against frozen standards and trusted tests; retain artifacts. | Seeded fixes and regressions classified correctly; removing tests/checks cannot produce success; stale or missing evidence never passes. |
| 5. Fixture draft PRs | Add exact-patch approval, restricted branch creation, draft PR publication, deduplication and retry recovery. | One approved patch produces one draft PR; permission revocation and target movement block writes; no merge or approval capability. |
| 6. Qualified Cloud pilot | Obtain separate security approval for real-repository execution/write scope; enable selected tenants/repositories with a kill switch and monitoring. | Isolation and authorization review passed; user acceptance demonstrates evidence → approved patch → verified draft PR → human review; rollback/revocation demonstrated. |
| 7. General availability | Publish operating limits, support ownership, retention, provider handling and pricing after pilot evidence. | Defined service commitments and observed reliability/costs; no unsupported product claims. |

Read-only investigations can ship before patch execution. Existing CI evidence remains useful when a remediation sandbox is unavailable. P4.RI is required only for the broader repository-context behavior; its absence must never be hidden by claiming complete investigation coverage.

## Required regression and security acceptance

- Fix a seeded defect and detect a seeded regression on exact pinned revisions; reject a patch that only suppresses a check or deletes a failing test.
- Preserve failing/incomplete standards outcomes when AI is enabled, disabled or malicious.
- Reject cross-tenant access, tampered repository IDs/refs, stale approvals, replayed writes and permission changes during an attempt.
- Block repository prompt injection, credential extraction, disallowed egress and unauthorized workflow/secret/configuration edits.
- Demonstrate timeout, cancellation, worker restart, duplicate delivery, GitHub rate limits and a crash between branch creation and PR creation.
- Verify no auto-merge, self-approval, protection bypass or direct protected-branch write is possible.
- Show evidence-only/inconclusive outcomes when reproduction, required checks or approved isolation are unavailable.
- Confirm existing Community setup PRs, CI assessments and advisory reviews still work independently.

## Measures and release reporting

Measure human acceptance rate, independently validated fix rate, regression/revert rate, inconclusive attempts, duplicate PR rate, time to reviewable patch and cost per accepted fix. Report the denominator and validation coverage; PR count alone is not proof of quality or resolution. Do not set availability dates or numerical service promises before pilot qualification.

**Next step:** Architecture/ADR review and a read-only investigation contract. This document authorizes planning only, not implementation, execution, repository writes or a public Cloud launch.
