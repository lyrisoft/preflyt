# Health retries, policy previews and public release metadata

Date: 17 October 2026. Publication is authorized by the maintainer through development and main PRs; this record describes local verification before publication.

## Reviewed behavior

- Repository profiling uses verified, bounded Git object reads. Health reuses that fetch for scanner input; access checks and exact branch resolution remain API-backed. No checkout, repository commands, hooks, submodule traversal or credential-bearing source bundle was introduced.
- Health persists temporary GitHub delays and retries after restart, releases worker capacity while waiting, and handles cancellation during a cooldown. Finding excerpts retain their retry allowance during rate limits. Team directory reads share installation request pacing.
- Policy preview errors identify readable blocking repositories and next steps. Hidden repository names and identifiers stay redacted; organization boundaries and policy permissions remain enforced. Approved coverage is preserved. Pickers expose latest workspace standard versions, while saved assignments remain resolvable.
- Homepage release badges use public latest-release endpoints. Homepage, pricing, README and current native-execution guidance reflect public source/image availability. Documentation version selection is unchanged. GitHub Sponsors configuration names `lyrisoft`; payout activation is separate.

## Audit corrections

Restored the unavailable-branch error contract, updated REST-era snapshot fixtures to exercise the Git transport boundary, and added an actual Git commit-integrity rejection fixture. Updated stale Skills beta accessible-name expectations and the production publisher's version-planning dependency assertion. No branch rules or automatic workflow triggers were changed.

## Local verification

- Full API: 167 files passed; 1,865 tests passed and one test skipped. Dedicated temporary PostgreSQL and Redis services were used, separate from application data.
- Full Chromium: 97 files and all 709 tests passed. A non-failing ResizeObserver warning was logged.
- API, web and documentation type checks; full web lint; `git diff --check`: passed.
- Community web and standalone website production builds: passed. Static public/private route checks: 14 passed for each build. Website artifact verification confirmed no application shell, authentication code or workspace links.
- Documentation production build and version/download/deployment checks: passed.
- Release/deployment Node fixtures: 42 passed. GNU-tar scanner packaging fixtures in a read-only local Linux container: two passed. CI/DCO Python fixtures: 16 passed.
- Earlier focused Compose API/worker/web builds and runtime module/Git smoke checks passed. Main publication builds both AMD64 and ARM64 application images separately; publishing images does not deploy customer servers.

No database schema changes or migrations are required. Previously failed Health attempts require Reassess after upgrading; automatic retries apply to assessments handled by the updated worker.
