# Audit log performance — 2026-10-18

## Change

The audit reader now builds one narrow, materialized scope per request and reuses it for rows, exact totals and action choices. Repository identifiers use equality joins through a shared key set rather than an OR join that repeatedly scanned repositories. Raw metadata and actor IDs are loaded only after pagination. UTC timestamps, filter behavior, page sizes, ordering and the API response remain unchanged.

The additive `20261018090000_audit_scope_index` migration indexes the normalized workspace metadata expression, including legacy records with missing/empty workspace metadata. It creates the index concurrently. Compose continues to run the migration image before API/worker startup; upgrade the migration image alongside the application image. No audit events are rewritten or deleted.

Authorization still resolves references through current source resources and current repository scope. Missing references, conflicting workspace metadata and foreign/inaccessible repositories remain excluded from rows, totals and action choices. No result or authorization caching was added.

## Local verification

- API production build and Prisma client generation passed.
- 22 checks passed across `audit-log.integration.test.ts`, `audit-log-performance.integration.test.ts`, `retention.integration.test.ts` and `deployment-config.test.ts`.
- Access regression covers Owner/Admin/Auditor roles, anonymous/unauthorized requests, grant removal, GitHub access-evidence changes, inactive workspace membership, deleted sources, unavailable repositories, identifier collisions, reference precedence, cross-workspace conflicts, metadata redaction, filtering, empty pages and exact UTC timestamps. Tests ran with `TZ=Africa/Lagos`.
- The large-history regression seeds 100,000 synthetic events across two workspaces and 100 repositories. It verifies one context statement, one materialization of scope and no per-event scans of the repository table. It checks 63,000 visible events and a 10-row page. It asserts plan behavior rather than a hardware-dependent timing threshold.
- On identical synthetic fixtures, the prior service took 3,068 ms and the optimized service took 186 ms. Responses were identical. These are local service measurements, not production latency guarantees.
- Compose configuration validated. API/worker runtime and migration images rebuilt locally. The actual migration image applied all migrations successfully, including the concurrent index; the API and worker became healthy.
- The packaged HTTP endpoint returned a 10-row page and the expected 63,000 visible events from the same-size fixture in 286 ms. Real session login, anonymous rejection (401), foreign-repository rejection (403), no-store headers and index validity passed.

Only task-owned disposable databases/Compose services were used. Health scanners and the web frontend were not started for this backend-only check. Existing application data was not changed. Temporary services and fixture volumes were removed after verification; rebuilt API and migration images remain locally available under `audit-local` and `development` tags. These results cover local verification; release publication is tracked separately.
