# Gate-only recovery and AI retry — 2026-10-14

## Observed failures

Run `38643689244` passed its check jobs and published a verified successful policy result at `5e59482`. Its original AI review could not reach local Ollama. After the configured route changed to DeepSeek, a new automatic review was rejected by the output validator. The discarded response was not retained, so its exact rejected content is unverified.

A gate-only rerun created attempt 2 without a new result submission. The gate searched only attempt 2 and waited for results that would never arrive. Read-only GitHub API comparison confirmed that copied successful jobs receive new IDs while preserving their execution and step timestamps.

## Local changes

- Reuse only an earlier complete submission from the same run and workflow commit, with its original server verification receipt. Fresh GitHub reads must show identical successful prerequisite executions, including job/step names, timestamps and outcomes. Verify the current PR, published policy, source approval and actual GitHub publication as usual. Preserve the original evidence attempt; do not copy reports into a new submission. Changed executions or missing proof fail closed. Missing compatible submissions fail immediately after the check jobs finish.
- Add an authenticated, origin-protected `POST /github/repositories/:repositoryId/ai-reviews/:id/retry` endpoint and a **Retry AI review** action. Re-admit only unavailable reviews using current repository permissions, policy, source consent, approved skills and tested model settings. Repeated automatic dispatch remains idempotent. Explicit retries preserve feedback publication requirements. Route/provider changes create a separately pinned review; unchanged settings requeue the unavailable review. No build or scanner jobs are rerun.
- Distinguish oversized output, configured-credential echo, PEM/bearer markers, API key patterns and secret assignments using fixed safe codes. Never persist rejected model content or matching substrings. Fix the reproducible false positive that treats the `sk-` inside ordinary words such as “risk-assessment” as a key prefix. Keep credential echoes and real key-prefix tokens rejected, and retain size, schema, evidence and claim validation.

## Local verification

- Full API unit suite: 123 files passed, 1,100 tests passed and two skipped cases. Final focused gate/scanner-output regressions also passed after the last proof changes.
- All 35 API integration suites passed: 609 tests passed and three skipped cases. The final AI integration suite separately passed 62 cases, including provider replacement without a route-revision change, stage-route replacement at the same revision number, explicit retry publication, policy withdrawal, authorization and unsafe-output persistence. These suites create disposable databases; AI and GitHub requests are mocked. The final audit regression run passed 113 cases across five suites, followed by a successful API type check.
- Full Chromium suite completed successfully; the Action's own JUnit parser classified its 575-case report as passed. The final retry UI suite separately passed all ten cases.
- API/web/docs production build, workspace type checks, web lint and changed-file formatting passed. Release/change-scope tests passed 20 cases; Python CI-helper tests passed seven cases.
- Pinned Semgrep and Gitleaks recipes passed on a private temporary copy of the tracked current source and successful build outputs, excluding application environment files. Both produced zero findings and successful invocations; the Action's own parser classified both reports as passed. A synthetic key fixture initially triggered Gitleaks; its construction was corrected without changing the assertion or adding scanner exclusions.

## Limits

The verification above completed locally before commit and push. It triggered no GitHub Actions run, image build/publication, live AI inference request or PR feedback publication. The user subsequently authorized an audit, commit and push. Live OIDC, job-copy verification and DeepSeek feedback recovery still require acceptance on the pushed revision. The local API and worker run with source watchers. Local fixtures prove the word-prefix false positive; they do not prove that it was the exact cause of the original discarded DeepSeek response.
