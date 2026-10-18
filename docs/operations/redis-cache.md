# Redis cache and GitHub coordination

Set the same `REDIS_URL` and deployment-specific `REDIS_CACHE_PREFIX` in the API and worker. Docker Compose supplies both and waits for cache health. For terminal development, configure both processes explicitly. Use authenticated TLS (`rediss://`) for remote services.

Use a dedicated Redis/Valkey service with `noeviction`. Metadata, refresh leases and request-budget counters share this service; eviction must not remove active coordination. Keep the persistent BullMQ queue separate. Monitor memory and Redis availability. Redis commands have 500 ms limits and a five-second reconnect cooldown. Configured Redis failure pauses new coordinated GitHub requests instead of issuing uncoordinated upstream traffic. Authorized PostgreSQL views remain readable. Without a configured URL, single-process development uses in-memory coordination only; this is unsuitable for multiple API/worker processes.

## Shared display refreshes

Ordinary branch, workflow, ruleset and health-freshness reads use PostgreSQL snapshots. Missing data queues one durable refresh and returns `GITHUB_SYNC_PENDING` with a retry time. Saved data stays readable during a refresh or GitHub cooldown, subject to current local authorization. Refresh buttons queue work; they do not bypass a cooldown. Finding source reads similarly queue background capture and retain only redacted excerpts.

Run the worker alongside the API. It refreshes recently viewed snapshots after five minutes, claims jobs with database leases, and fences publication against access changes and newer webhook events. `GITHUB_DISPLAY_REFRESH_BATCH` limits each pass (default 10, range 1–50). Snapshots unused for seven days are removed. Freshness indicators use the actual saved observation time, never the time a page opened.

Signed push, branch create/delete, repository, ruleset and workflow-run events queue refreshes for connected repositories. Enable `GITHUB_EVENTS_ENABLED` and configure the webhook secret and URL. Existing GitHub Apps must enable the corresponding event subscriptions; changing the manifest does not update installed Apps. Periodic reconciliation covers missed events. Replayed deliveries do not multiply work or reset throttling deadlines.

GitHub-linked user access uses unexpired local evidence, with background renewal near expiry. Missing or expired evidence queues verification and blocks access until verification succeeds. Local role, repository selection, active installation and access revision checks still run on every read. Access-related webhooks invalidate evidence. Saved data never extends an expired authorization grant.

Worker upstream reads share Redis refresh leases and bounded installation verification (`GITHUB_ACCESS_CACHE_SECONDS`, default 30, range 5–60 seconds). Keys include the connection, installation, repository and access revision. Installation GET requests use ETags where available; a successful `304` reuses the saved body and refunds the primary-budget reservation only in the matching reset window. Conditional bodies are credential-scoped, size-limited and retained for one hour; token values are not stored in Redis.

Writes verify upstream access. Setup PR creation rechecks the source and branch against the reviewed base commit. Display snapshots never authorize a merge or supply execution evidence.

## Budget-aware scheduling

The limiter records GitHub limit, remaining and reset headers per existing authentication scope. Atomic reservations prevent replicas from spending the same observed remaining request. Late responses cannot raise remaining budget within a reset window. Cooldowns and pacing use Redis time; app and installation scopes are isolated.

Compose sets `GITHUB_REQUEST_PRIORITY=interactive` for the API and `background` for the worker; the terminal worker also defaults to background. Background calls spread their available budget over the remaining window and stop at the interactive reserve (`GITHUB_INTERACTIVE_RESERVE_PERCENT`, default 10, bounded to 1–50%). Interactive calls can spend that reserve. Durable display/access refreshes, inventory and PR sync, pipeline processing, readiness automation, source capture, pre-inference AI reviews and AI feedback retain pending work during budget deferrals. Native preparation retains its lease until the retry time, subject to its overall execution deadline. BullMQ lifecycle delivery is delayed without spending a retry attempt. Short waits are bounded; long deferrals return the retry timestamp. Once AI inference has started, it is not automatically replayed; review expiry and execution safety deadlines still apply. Secondary GitHub restrictions still take precedence.

Before headers are known, calls use conservative 250 ms pacing. Restarting nonpersistent Redis loses observations and leases, so avoid routine restarts under load. Other applications consuming the same GitHub budget and secondary limits can still cause throttling; the reserve is not a guarantee of unlimited capacity. Observe `github.rate_limit` logs without tokens, raw URLs or source contents.

## Local verification

Run the focused concurrency suites against an isolated service:

```sh
TEST_REDIS_URL=redis://127.0.0.1:16391/0 pnpm --filter @preflyt/api exec vitest run test/github-coordination.integration.test.ts test/redis-cache.integration.test.ts
```

Tests create unique prefixes and delete only their own keys. They cover shared refreshes, fencing, bounded verification, revocation, atomic budgets, installation isolation and coordination outages.

## Refresh progress and recovery

The workflow setup page checks saved data automatically at the server's `retryAt` time. These checks never set `refresh=true`, never replay a write, and stop when data arrives or an unrelated error occurs. Polling pauses while the tab is in the background. Loading is shown as a status rather than an error; failed refreshes and delayed workers have distinct messages.

Cold reads report `GITHUB_SYNC_PENDING` while queued or leased, `GITHUB_RATE_LIMITED` during a provider cooldown, and `GITHUB_SYNC_FAILED` after a refresh failure. If a due job has no active lease and has not progressed for `GITHUB_DISPLAY_STALL_SECONDS` (default 180; range 30–900), the API reports `GITHUB_SYNC_STALLED`. This detects missing progress, not a confirmed worker outage. Administrators should check worker health, migrations, shared database/configuration and `github.display_refresh_failed` log entries. Repeated page checks do not reset the job's retry deadline.
