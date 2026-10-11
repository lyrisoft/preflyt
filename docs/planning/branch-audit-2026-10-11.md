# Current branch audit — 11 October 2026

Branch: `codex/p0-p3-phase-closure`. Reviewed base: `25d12a8`.

Scope: all pending changes in the visible Preflyt checkout, including the previously staged notification, model selection and documentation changes. No isolated worktree, remote push or PR merge was performed for this audit.

## Reviewed changes

- Signed GitHub repository webhook ingestion binds events without installation metadata only to an existing selected repository with an active installation and matching repository identity.
- Preflyt-generated feedback events are excluded from CI evidence. Unchanged automatic evidence reuses an assessment; changed evidence produces a new snapshot.
- Repository PR feedback supports one repository or all authorized selected repositories. AI review authorization is recorded with its revision and time, rechecked during dispatch, and excludes verified submissions preceding consent.
- Automatic PR AI review uses the published policy's standards, bounded changed-code context and constrained evidence references. Summary and inline suggestions go on the PR; AI feedback remains advisory and never approves the PR or overrides a required policy check.
- Explicit retries of unavailable AI reviews recheck authorization and retain bounded retry accounting. Automatic dispatch remains idempotent.
- Notification explanations and links use authorized repository context. Email notifications keep repository details behind sign-in. Model routing excludes the primary model from fallback selection.
- Both Prisma migrations match the repository AI settings in the schema. They were applied locally and the client regenerated during the live integration work.

## Audit corrections

1. Removed instructions to configure token budgets from historical AI notifications, retaining support for already recorded events.
2. Replaced an incorrect all-repositories “Disabled” status with actual enabled counts. Policy comments and AI review controls also show their enabled counts; bulk check buttons explicitly apply to all selected repositories.
3. Removed the redundant settings refresh after a successful bulk update.
4. Changed failed-check guidance to rerun the workflow instead of asking pipeline users to save another assessment manually.
5. Updated outdated ruleset/editor test fixture types and the fullscreen mock so application compilation and touched-file lint succeed.

No additional commit-blocking issue was found in the reviewed diff. This is a branch audit, not a claim that the three remaining live acceptance cases passed.

## Validation

- API TypeScript compilation passed without emitting build artifacts.
- Changed frontend files passed ESLint and Prettier checks.
- Frontend application TypeScript compilation passed without emitting build artifacts.
- Diff whitespace checks passed. An added-line credential scan found no credential values; no environment or private-key files are included.
- No unit, integration or live tests were run for this audit. Earlier live verification and focused regression results are recorded in the saved live-test report.

## Live evidence already recorded

[Acceptance PR #5](https://github.com/lyrisoft/preflyt-p2-acceptance/pull/5) remains open and unmerged. Its tested workflow detected intentional test/scanner failures; Preflyt saved the assessment, registered both sources automatically, published a failed readiness check and updated the policy comment. The [automatic OpenAI review](https://github.com/lyrisoft/preflyt-p2-acceptance/pull/5#pullrequestreview-5482150320) posted two inline findings on changed application code.

## Three live tests still pending

1. **Trusted passing path:** run a clean fixture with configured execution proof and verify passing assessment, PR publication and AI feedback. The local test deployment currently lacks the required attestation/verifier and execution-contract setup.
2. **Publication failure gate:** install reviewed gate integration on the acceptance repository's default branch, then verify publication failure and timeout fail the final gate. The workflow currently exists only on the test branch; the defect fixture must remain unmerged.
3. **Merge enforcement:** require the Preflyt readiness/publication checks on the test branch target and verify failed results block merging while passing results clear those requirements. Existing review/conversation blocking does not prove Preflyt enforcement. Ruleset activation also needs the appropriate GitHub Administration permission.

The temporary test webhook is inactive and the tunnel is stopped. The next live run needs a reachable API URL and reactivated test event delivery. Those external changes have not been made during this audit.
