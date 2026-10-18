# App read performance — 2026-10-18

## Changes

1. Inventory, dashboard and Health portfolio reads select the latest row IDs in PostgreSQL before loading report bodies. Each indexed lateral lookup has its own `LIMIT 1`. Health selects the configured branch directly, eliminating the extra request per repository when a newer report belongs to another branch. Existing summaries, bounds, access checks and report verification remain in place.
2. The closed notification bell requests only an authorized unread count. Opening it loads five notifications and their context. The full inbox groups repository choices in SQL rather than transferring every historical event for client-side deduplication. Both new routes use the session guard, current repository scope and `Cache-Control: no-store`. Marking read refreshes the count and preview.
3. Retention indexes commit references when saved pull request context changes. Cleanup joins those references instead of repeatedly searching PR JSON. Existing references are backfilled. Open contexts that exceed indexing limits conservatively protect repository history; invalid legacy commit IDs are also retained. Closed PRs stop protecting history, and deleted PRs remove their reference rows. Latest assessments per repository/branch are computed once per cleanup statement. All existing policy, investigation, evidence and notification protections remain.
4. Team details load selections, policies and verification context in batches. The existing verifier still checks assignment digests, approved scope, revisions, nested-team fingerprints and sync freshness. This request-local read facade does not authorize writes or persist permissions.
5. Findings reuses normalized candidate rows across page and display-filter changes. Each request checks current authorization and small database revision stamps. Report, artifact, imported-evidence and AI-review changes advance those stamps in the same database transaction. Repeatable-read transactions and parent row locks prevent a changed dependency from being hidden by a cached result; serialization conflicts retry once. A global sequence also prevents cache reuse after deletion/recreation of a source ID. Triage and ignores are loaded fresh. The process-local cache expires after five minutes and is bounded to 16 entries, 8 MiB per entry and 32 MiB total serialized data. Larger results remain uncached. It does not consume shared Redis coordination capacity.
6. Contributor association indexes assessments by repository, commit and exact PR number rather than scanning every assessment for every observation. Missing and null PR numbers remain distinct. The existing 5,000-record bounds and historical evidence rules remain.

## Local measurements

Synthetic fixtures on the same local PostgreSQL container; these are service measurements, not production latency guarantees. Query counts include authorization. Some bounded reads add a small ID-selection query to avoid transferring large historical bodies.

| Read / fixture | Before | After |
| --- | --- | --- |
| Latest profile/CI/Health bodies: 100 repositories, 5 historical rows each | 500 bodies per relation | 100 bodies per relation |
| Health portfolio, matching branch, 10-row page | 293 ms | 118 ms |
| Health portfolio, newer report on another branch | 111 queries, 358 ms | 12 queries, 113 ms |
| Team details, 10 / 100 repositories | 36 / 216 queries | 22 / 22 queries |
| Team details, 100 repositories | 98 ms | 21 ms |
| Findings, 500 synthetic Health reports, 2,000 bounded candidates | 162 ms on every read | 210 ms cold; 33 ms cached page |
| Closed notification bell, 100,000 historical / 10,000 unread | 247 ms, 19,515-byte response, 25 items | approximately 76 ms, 36-byte count, no items |
| Open notification preview, same history | full inbox load | approximately 49 ms, five items |
| Retention eligibility, 5,000 old assessments / 1,000 open PRs | 4,706 ms | 35 ms |

Cold Findings reads still verify and normalize bounded saved reports. Cache expiry, an uncached oversized projection, a new API process or changed evidence takes that cold path. The improvement applies to repeated pages/filters without sacrificing source checks. Candidate limits and truncation reporting are unchanged.

## Verification

- API production build and Prisma client generation passed.
- The broader affected API group passed 142 tests, with one optional integration skipped: assessments, scoped contributors/Findings, teams, dashboard, retention and audit performance/access regressions.
- The final targeted API group passed 55 tests, with one optional integration skipped: notifications, inventory, advisory Findings, cache memory bounds, contributor association and deployment configuration. The additional six-test Findings group passed, including concurrent cold reads and a real dependency edit between reading a revision and locking its parent.
- Contributor regression covers 5,000 observations/assessments and bounds property reads instead of relying on a hardware-specific timing threshold. It also checks repository, commit, typed PR-number and legacy null/missing bindings.
- Notification browser tests passed all 17 checks. They verify count-only loading while closed, preview-on-open, pending/error/retry states, read-count refresh and existing links/statuses. Web typecheck and affected-file lint passed. The Compose web image completed the production build and public-page prerender.
- Disposable fixtures measured actual PostgreSQL relation row counts, query counts and large-history behavior. No live GitHub requests were required.
- The rebuilt migration image applied all migrations in an isolated Compose deployment using the normal owner/runtime role split. API, worker and web became healthy. Packaged HTTP checks exercised real session login, anonymous rejection, no-store headers on the new/read-sensitive routes, cross-repository rejection, count/preview limits, inventory, Health, teams, dashboard, audit, and Findings invalidation. Runtime inserts exercised trigger and sequence privileges.

## Migrations and deployment

`20261018100000_pr_commit_retention_index` adds/backfills PR retention references. `20261018101000_finding_read_revisions` adds internal revision stamps and dependency invalidation triggers. These are internal read/cleanup aids; ignored Prisma fields do not enter public JSON responses. Existing report bodies and assessment hashes are preserved.

Upgrade the migration image with the API/worker image; Compose runs it before application startup. Backfills inspect existing saved rows and can extend migration time on large databases. Retention settings are not enabled or shortened by these migrations.

At the user's request, all four pending migrations, including the earlier workspace-retention and audit-index migrations, were also applied to the configured local `preflyt` database at `127.0.0.1:5432`. Prisma reports the schema up to date, and the client was regenerated. Production was not migrated.

Local API/worker, migration and web images were rebuilt. Task-owned fixture services are removed after verification; the configured local database is preserved. These results cover local verification. Publishing the release and updating an installed server are separate steps.
