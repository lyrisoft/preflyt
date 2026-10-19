# Security workflow audit — 19 October 2026

## Scope and result

Reviewed the pending source-security review, shared source archive, model limits/usage, findings index, repository charts/table, external agent evidence, hosted MCP OAuth, optional companion, skill import, feedback and workspace UI changes. No blocking runtime or authorization defect was identified in the reviewed paths. Four loose browser-test types and a review-area route hot-refresh warning were corrected during the audit.

MCP connections are personal to an identity within an organization, limited to approved repositories. Repository permissions are rechecked on use. External evidence does not automatically verify findings, resolve issues, or authorize merges. Source reports remain revision-bound; AI findings are advisory. Related repository-table reports must match the current authorized repository, branch and commit.

## Verification

- Changed API suites: 22 files, 343 tests passed using disposable local databases.
- Changed browser suites: 20 files, 255 tests passed. The two suites affected by lint cleanup were rerun: 12 tests passed.
- Pinned Strix Python environment: 26 tests passed, no skips. The generic host Python run skipped three SDK-dependent archive tests; the pinned run covered them.
- Optional companion: all four Node tests passed with loopback listener access. An initial restricted-host run terminated inside Node; the approved rerun completed successfully.
- API and web type checks passed. Changed web files passed ESLint after cleanup. Git whitespace checks passed.
- Pending tracked/untracked file inspection found no credential-pattern or sensitive-filename matches. Only example environment files are included.
- Live maiguard-api repository table: 231 unique findings across three pages, including one AI finding; the Security card also totals 231.
- Live general Findings endpoint: all six requests returned 200 and 1,965 findings, with measured total latency of 68–327 ms during this audit. These are local measurements, not a production performance qualification.

## Limits

This audit ran the affected suites and reviewed the changed boundaries; it was not a new live penetration test or a full production qualification. No new paid AI scan was started. Live API/website penetration testing remains outside the implemented source-review scope. Background index preparation retains a synchronous fallback for previously unseen scopes or requests arriving before preparation finishes.
