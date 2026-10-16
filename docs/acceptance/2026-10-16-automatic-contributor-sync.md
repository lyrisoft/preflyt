# Automatic contributor sync

Selected repositories import recent contributor activity in the worker without a browser request or manual Import action. A durable per-repository state records queued/running/completed/limited/retry/failed outcomes, access revision, attempts and a fenced lease. Existing webhook capture and event deduplication remain in use. Sync now queues a bounded retry; authorized reads expose progress without contacting GitHub.

## Local verification

- 50 API tests passed across scoped contributor integration, event normalization, daily activity and compliance suites. Coverage includes automatic discovery, scoped access, concurrency, duplicate capture, revocation during import, expired lease recovery, rate-limit delays, retry exhaustion and manual queue cooldown.
- 20 frontend tests passed across contributor tabs, help, queue requests and compliance. Includes automatic progress, retry details, permissions and empty/loading presentation.
- API and web typechecks, focused frontend ESLint and whitespace checks passed.
- All migrations applied to a disposable local PostgreSQL database; Prisma client regenerated.

## Compose and real GitHub verification

- Built and loaded ARM64 API runtime, migration and web images locally. Updated the existing optimized image tags used by `work/community-local/compose.yaml` and refreshed its ignored image inventory.
- Recreated API, worker, migrate and web in project `preflyt-ce-local` on port 8081 with `--pull never`. All long-running services became healthy; migrate exited successfully after applying `20261016020000_contributor_sync`. Application volumes were preserved.
- Without a sync POST, the worker discovered all three selected repositories. Live API reads first showed one running and two queued, then three completed, zero pending and zero failed. Two repositories reached the existing bounded-history limit (PARTIAL); one completed without hitting it (SYNCED). The last-30-day directory populated with two observed contributors across three repositories and 40 authored PRs. These are recorded activity counts, not assessment outcomes or productivity scores.
- Login/origin/protected-route/SPA/health Compose smoke passed. Verified running API and worker use the new API image, and migrate/web use their rebuilt images.

Image IDs:

- API / worker: `sha256:30e563ee3a4312ccbc6dcca9261a2a82219b34af975624de5af0b81777281ed2`
- Migration: `sha256:44f6c90645c5a61a3ffd79a8954d7f9980749e54844b6d9b025ca472f7d99a07`
- Web: `sha256:a73ec1e1ebbc55c0cdd7c69b556d2e439cbf99eab9bc5c2381d8008992816293`

Removed the disposable PostgreSQL test container and its fixture volume. No commit or push performed.
