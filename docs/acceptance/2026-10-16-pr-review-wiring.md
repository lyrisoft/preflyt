# PR review and dashboard data corrections — 16 October 2026

## Implemented

- Pull request details evaluate the newest matching, integrity-checked frozen assessment with the shared deterministic evaluator. The response includes its assessment ID, source commit and result. Existing exact-head, installation, standards-selection, source-binding, same-repository and PR context checks remain in effect. Context is checked again before exposing a result; missing, stale, closed, fork or concurrently changed context does not inherit a passing result.
- The PR UI uses the shared result vocabulary and StatusBadge colors, links to the evaluated saved assessment and distinguishes that result from GitHub's current merge permission. Fetch errors hide cached passing results.
- Dashboard attention uses the same PR lookup and evaluation. It removes passing saved results from its bounded recent-PR attention list, retains failed/incomplete/optional-check warnings and reports actual missing-context states. Branch-owned standards are resolved by that lookup, rather than treating missing repository-default standards as proof that no standards exist. Integrity conflicts appear as unavailable results. The dashboard cache namespace changed to avoid stale hardcoded summaries.
- Team policy assignment no longer substitutes `main` when the repository default branch is unavailable. The target field stays empty and preview requires explicit input. Empty `refs/heads/` is also rejected before submitting.
- Removed unused dashboard `blockedPrs`, `openFindings` and `verifiedPolicyCoverage` fields that always returned null. Replaced the obsolete claim that gate outcomes and findings are unimplemented with the actual historical-result limitation.

## Local verification

- 134 API tests passed across PR assessment integration, dashboard integration/summary, gate evaluator and new PR review regressions. The optional real-Redis dashboard test was not enabled in this run; it passed during the preceding dashboard change. PostgreSQL tests use a separate disposable local database.
- 49 Chromium tests passed across dashboard, repository assessments, PR review display and teams. Includes passing/failing/incomplete/warning colors, stale/corrupt/context-change rejection, cached-pass hiding after a fetch error and unknown-branch input.
- API/web TypeScript, focused web ESLint and diff whitespace checks passed.
- Updated Compose startup and authentication/origin/protected-route smoke passed. All three live repository summaries matched the saved assessment evaluation endpoint; obsolete metric fields were absent. API, worker and web were healthy and used the rebuilt image IDs. The private image manifest was updated and the disposable test container removed.
- Runtime API (also used by worker) and web production images rebuilt locally for ARM64, preserving the optimized packaging and earlier uncommitted fixes.

No commit, push, registry publication or remote CI run is authorized or performed. Local documentation Compose uses port 8081 and preserves its settings and application volumes. The attention list covers at most the 10 most recently updated tracked open PRs and labels truncation; it is not an organization-wide readiness calculation. These results do not activate merge enforcement or treat AI as a merge decision.

Private verification/build logs: `/private/tmp/preflyt-hardcoded-*`.
