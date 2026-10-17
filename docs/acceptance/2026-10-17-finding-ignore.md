# Persistent finding ignore and reopen

Implemented and verified locally on 2026-10-17. Not committed or published.

## Behavior and scope

- CI report findings, Health findings and AI suggestions have Ignore and Reopen controls. Both require a reason; Ignore accepts an optional future expiry.
- Decisions persist independently of scan/commit IDs. Matching includes organization, repository, source, category, rule, path, line range and message. Changed findings require a new decision; whole-rule and whole-file suppressions are not created.
- Ignore expiry is evaluated on reads, so no scheduler or new scan is required. Refresh the page to see an expiry while it remains open.
- Ignored entries remain available through the Ignored status filter, with neutral badges. They are excluded from Findings metric/chart aggregates.
- Original assessment evidence, saved Health totals and merge results remain unchanged. Check failures and missing evidence cannot be ignored.
- Repository authorization applies to reads and writes; writes recheck authorization inside the transaction. Optimistic revisions reject concurrent stale changes. Decisions and audit events are stored atomically.
- The detail panel shows the latest 20 review events. Full retained audit history remains in the audit log.

## Verification

- 60 API tests passed across the new disposable-database lifecycle tests, existing AI finding/source/summary tests and scoped contributor/finding integration tests. The final six lifecycle tests passed again after expiry validation was finalized.
- 65 distinct browser tests passed across finding details/list, Ignore/Reopen, filters and semantic badge tests. Coverage includes required reasons, optional expiry, reopening revisions, access denial, read-only history, safe text rendering and 320px layouts in both themes.
- API/web TypeScript checks, focused web ESLint, image builds and diff whitespace checks passed (excluding the unrelated pre-existing web environment example).
- New Prisma migration `20261017010000_finding_ignore` was applied to the local development database; Prisma Client regenerated. Integration tests used disposable databases, not application data.

## Local Compose

- Built API/worker, migration, native controller, Health scanner and web images for ARM64; tagged `preflyt-local/*:finding-ignore-20261017-arm64`.
- Updated ignored `work/community-local` version and image records. Existing volumes preserved.
- API, worker, web, Health scanner, Health engine, database, cache and queue are healthy. Migration exited 0.
- Verified running image IDs against build records. Web returned HTTP 200; API readiness returned ready; unauthenticated finding-review request returned HTTP 401.
- Local app: http://localhost:8081. No changes were pushed and no customer findings were ignored during verification.

## Route authorization correction

- A live panel exposed a missing `/findings/:id/ignore` entry in the central route authorization map. This caused authenticated requests to fail before the service-level repository checks. Added the route while retaining controller/service authorization and origin checks.
- Added an HTTP integration regression through SessionGuard and the real authorization service. Verified authorized read/ignore/reopen, read-only denial for writes, foreign-origin rejection, cross-organization denial and revoked repository access.
- All 42 tests in the HTTP scope and ignore lifecycle suites passed; API TypeScript passed. Rebuilt the local API bundle for this correction.
