# Health Git source retrieval and failure explanations — 14 October 2026

## Delivered

The latest maiguard-api reassessment failed at 05:49 UTC (06:49 GMT+1) with `GITHUB_RATE_LIMITED`, before pinning a commit or starting scanners. The reason was stored but absent from the history row, and the no-report path offered no explanation.

Failed assessments now show an accessible explanation and next action in the report header and history. Pre-pin failures explicitly state that no scanners or tests ran. Technical details expose the assessment ID and recognized safe failure code. GitHub cooldown times are preserved for new failures and displayed when available; the earlier run has no captured reset time. Readers are directed to a maintainer instead of being offered unauthorized retry actions. Raw provider exceptions, credentials and Git stderr remain hidden.

Health bulk source retrieval now performs one shallow Git fetch of the exact pinned commit using a temporary repository-scoped GitHub App token. No checkout, hooks, filters, submodule recursion, LFS smudging or repository command execution occurs. The broker reconstructs the existing source bundle from Git objects, verifies commit/tree/blob hashes and deletes its private temporary store. Authentication appears only in the fetch subprocess environment, not command arguments, repository configuration or scanner input. Subprocesses receive no platform environment secrets. Timeout/output limits and a monitored 256 MiB object-store budget preserve bounded failure behavior; selected-source limits remain 8,000 files, 2 MiB per file and 64 MiB overall. Git is included in the deployment base image.

Access verification, branch/profile inspection and source excerpts still use GitHub's API and can still be throttled. This changes bulk scan-source transport; it does not bypass GitHub authorization or promise that API rate limits disappear. General native execution retains its existing source path.

## Verification

- Real authenticated shallow fetch succeeded for maiguard-api commit `6d3a4faa9c421e40e5422afe121f0f59fc3efe07`: 3,647 verified files, 37,374,360 bytes, 30 excluded entries. No scanner or repository tests ran during this verification.
- 55 focused source/provider/scanner tests initially passed. Final Git-source suite has six tests, including pinned revision versus newer branch contents, exact binary bytes, credential-free disk configuration, corruption rejection, pre-abort, output/store limits and cleanup.
- Final Health integration suite: 36 passing tests, including four distinct Git failure codes, no scanner admission on retrieval failure, safe GitHub retry-time persistence and unauthorized-read rejection.
- Deployment configuration tests passed; the local deployment base image built successfully with Git installed.
- 36 Health browser tests passed, including no-report failure visibility, history reason, retry time/action, 320px layout, reader permissions and unknown/prototype failure-code handling.
- API/web TypeScript checks, focused frontend ESLint and diff checks passed.

No push, GitHub Actions run, image publication or remote deployment was performed. Existing reports were not rewritten.
