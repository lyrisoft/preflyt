# Development CI runtime improvement — 2026-10-14

## Observed baseline

Run `38631931440`, attempt 3, took 16m 33s in `development / checks`. Setup/source validation consumed 6m 7s before the policy. Related browser tests passed 565 cases in 173.65s. Policy execution then repeated the full browser suite (the published command also repeated Chromium OS dependency installation) and built all three workspaces with zero cache hits; that build took 2m 2s. Policy execution ultimately reported `incomplete`, and result submission failed after about 94s with no submission persisted. Tailscale readiness and unauthenticated POST checks succeeded afterward; these probes do not establish why the authenticated submission failed.

## Change

Run contracts, related API tests and lint in a separate read-only source job alongside the policy job. Keep the existing policy job identity and the final gate's dependency on the entire reusable workflow. Exclude always-run API contract suites from the related invocation.

Only skip the redundant focused browser invocation after the current policy's exact reviewed all-browser command has a passing JUnit report bound to the current policy/hash, repository, commit, workflow, run attempt and job. Validate its report digest and actual executed cases. Unknown/narrowed commands, stale/missing/failed/partial reports and unknown Action layouts fall back to focused tests. This is local deduplication, not accepted policy evidence. Required checks, report submission, independent GitHub verification and the final gate remain unchanged.

Cache pnpm downloads, Chromium downloads and Turbo build artifacts. Restore the actual documentation output and generated deployment downloads, plus the web public renderer. Hash external deployment inputs and documentation deployment variables. Keep API TypeScript incremental state inside its emitted `dist` directory. Never cache tests or `.preflyt` reports.

Pin the v2.1.1-compatible transport diagnostics patch from [preflyt-action PR #2](https://github.com/lyrisoft/preflyt-action/pull/2) in both policy and final gate steps. Safe HTTP/timeout/network categories preserve failing exit status without printing credentials, URLs, API bodies or report contents. It is a diagnostic patch, not a confirmed submission repair.

## Verification

- Browser reuse tests cover current full coverage and fallback for prior attempts/commits/policies, narrowed commands, failed or missing reports, digest mismatch, empty/skipped suites, symlinks and malformed/unknown layouts.
- Workflow tests preserve checkout SHA, token scope, fallback conditions and final-gate dependencies; release/change-scope tests retain failure propagation and API contract coverage.
- Full local API/web/docs build passed. A repeated local build restored all three tasks from Turbo cache (108ms); this is not a GitHub runner speed claim.
- An output-removal restore test exposed the pre-existing external API incremental-state issue; compiler state was moved inside `dist`. The repeated output-removal test passed with all three cache hits in 898ms and verified matching API entrypoint/compiler-state, web shell, docs HTML and generated Compose fingerprints.
- Published policy definitions and requirements were not edited. GitHub timing and the authenticated submission outcome require verification on the pushed revision.

## Completed GitHub verification and local scanner repair

The first optimized run, `38640422692` at `f87dae8`, completed in 10m 39s versus 18m 18s for the previous attempt. The policy Action took 6m 36s versus 10m 23s; the full check job took 9m 44s versus 16m 33s. Source checks passed in parallel. The current-run browser coverage check recognized the full passing suite, so the duplicate browser installation/test steps were skipped. Chromium and Turbo caches were saved. Result submission succeeded and persisted the normalized report; the earlier transport failure was not reproduced, and its original cause remains unconfirmed.

The final gate remained failed because `security.sast` was incomplete. Its safe metadata identified a Semgrep syntax error at `apps/api/src/execution/native-controller-jobs.ts:72`: the pinned parser rejects an inline TypeScript `import(...).NativeToolReview` type that the TypeScript compiler accepts. An offline single-file reproduction with the exact CI image exited 3. Replacing that expression with a normal type-only import and a named admission type produced exit 0 with zero findings. Full local SAST also completed with zero findings; no scanner rules or policy requirements were disabled.

After the user's request to avoid wasting build minutes, the scanner repair was left unpushed. A local preflight exercised all five published policy commands. The full API/web/docs build passed; the browser and type commands exited 0; both pinned scanner recipes completed. The Action's own report parser classified component tests, types, secret scanning and SAST as passed. Scanner validation used a private temporary clean source copy without application environment files, with successful build products matching the working tree. Sharing node_modules through symlinks was unsuitable for Docusaurus SSG in that copy, so the successful full build was run in the original workspace and its generated products were used for the scanner preflight.

The 59 focused controller/workflow/source/gate tests passed, including the existing real HTTP protocol tests with loopback enabled. The full local development API unit suite then passed 1,088 tests across 123 files, with two skipped cases (database integration remains a separate acceptance path). No further GitHub Actions run was triggered during this local preflight. The user subsequently authorized pushing the repair. Remote OIDC, independent GitHub verification and final publication still require verification on the pushed revision; these local results do not establish those outcomes.
