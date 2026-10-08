# Redis metadata cache

Set `REDIS_URL=redis://127.0.0.1:6379/0` and a unique `REDIS_CACHE_PREFIX=preflyt:development:cache` in `apps/api/.env`. Restart the API after changing environment settings. The existing local Valkey service is Redis-compatible. An unset URL disables caching.

Docker Compose passes the optional URL from `deploy/.env`; use an address reachable from the API container, such as `redis://host.docker.internal:6379/0` on Docker Desktop, or an external service DNS name. Use authenticated TLS (`rediss://`) for remote services. Preflyt does not provision or alter that service.

GitHub installation repository metadata is cached for 30 seconds, scoped by deployment prefix, App ID and installation ID. Names, branches and inventory additions/removals can lag by that interval. The existing Refresh button requests `GET /github/repositories?refresh=true` to bypass cached inventory. Connecting/reconnecting or detecting installation revocation invalidates its entry. Only owned keys are deleted; no database flush commands are used.

The dashboard loads `GET /github/repositories/overview` from the last synced PostgreSQL state, without waiting for GitHub or Redis. Current selection and active-installation flags come from PostgreSQL. This display snapshot is not proof of current upstream access; use the repositories page to refresh it.

Every repository-management listing still checks installation status live. Enabling repository selection checks current upstream repository access; profile access/discovery retains its existing live verification. Selection state and session/role information are read from PostgreSQL and never cached. Cached entries contain no GitHub tokens, credentials or repository source files. GitHub verification failures do not serve stale responses.

Redis operations have 500 ms connection/command limits and a five-second reconnect cooldown. Missing, expired, invalid or oversized (over 2 MiB) cache entries fetch fresh metadata. Redis failure falls back to the upstream source; it does not change API authentication or readiness. Configure cache memory limits and an eviction policy on a dedicated cache instance; keep future durable BullMQ queues on separate storage with a no-eviction policy.

Run the scoped tests from the repository: `pnpm --filter @preflyt/api exec vitest run test/redis-cache.test.ts test/github.integration.test.ts`. Redis tests use unique keys on the local service, delete only those keys, and require it to be reachable. Set `TEST_REDIS_URL` to override its default `redis://127.0.0.1:6379/0`.
