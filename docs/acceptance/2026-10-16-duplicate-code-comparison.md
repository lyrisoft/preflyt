# Duplicate code comparison

Implemented locally on 2026-10-16. Audit and focused regression verification repeated on 2026-10-17; no release images published.

## Behavior

- Duplication details list the original location and all valid related locations retained in the report. Pagination defaults to ten rows and offers the shared page-size control.
- Preview loads one block. Compare displays the original and selected match beside each other on desktop and stacked on narrow screens. Guidance remains associated with the original finding.
- Source requests select an index from the authorized saved finding, not an arbitrary path. Both CI and Health source endpoints retain assessed-commit binding, bounded redacted excerpts and repository authorization before and after reading source.
- The duplication scanner and API no longer truncate related locations to three. Existing report/receipt size and finding-count limits remain. Legacy reports cannot recover discarded matches without reassessment.
- No database migration is required. Frozen v0.1.2 documentation remains unchanged; the current guide describes the new behavior.

## Local verification

- 80 API tests passed across source access, report normalization, Health validation, location validation, duplication storage and native receipt suites.
- 23 Chromium tests passed, including comparison, pagination beyond ten locations, unavailable repository access and 320px/1600px layouts in light/dark themes.
- API and web TypeScript checks and focused frontend ESLint passed.
- The rebuilt duplication scanner processed a disposable fixture containing twelve repeated blocks, emitting twelve findings and retaining eleven related locations for one block. Its expected findings exit status is 1. It ran with networking disabled, read-only source and container filesystem, and bounded CPU/memory.
- API/worker, migration, native controller, bundled Health scanner and web images are built locally for ARM64. Local Compose rollout verification is recorded below after completion.

Application databases were not used for regression tests. The pre-existing apps/web/.env.example edit is outside this change.

## Compose rollout

- Updated ignored `work/community-local/.env` to `PREFLYT_VERSION=duplicate-comparison-20261016-arm64`; `images.json` records all five built image IDs.
- `docker compose up -d --wait --wait-timeout 240` completed successfully. Existing volumes were preserved.
- API, worker, web, PostgreSQL, cache, queue, Health engine and Health scanner are healthy. Migration and Health initialization exited 0.
- Running API/worker, web, scanner and migration image IDs match the build records.
- `http://localhost:8081/healthz`, `/api/health/ready` and `/super-admin/login` returned HTTP 200. The running web image contains the duplicate-comparison bundle.
- Browser verification used deterministic local fixtures; no new scan was submitted to a connected customer repository. Existing saved matches can be compared immediately. Reassessment is needed to recover locations previously discarded by the old retention limit.
