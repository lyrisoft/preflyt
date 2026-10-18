# GitHub workflow cooldown UX and request investigation

## Changes

- Preserve the GitHub error code and validated retry timestamp through the governance API client.
- Show the server retry instant in the viewer's local timezone and a countdown in setup and workflow-editor errors. Disable manual retry until that instant; enable it when the countdown expires. Do not automatically issue another GitHub request.
- Give setup data a five-minute client freshness window. Disable focus/reconnect reloads for setup and workflow source queries. Explicit refresh and mutation invalidation remain available; server authorization checks remain unchanged.
- Emit a structured `github.rate_limit` warning when an upstream response establishes a cooldown, including the successful response that consumes the final request. Record budget category, hashed scope, fixed operation category, upstream status, available limit/reset numbers and pause duration. Rejected local retries do not emit duplicate upstream warnings. Tokens, raw URLs, repository names, source paths and response bodies are excluded.

## Investigation findings before shared coordination

The subsequent [shared coordination change](2026-10-18-github-shared-coordination.md) adds bounded display verification and budget admission, and wires the worker to Redis. The observations below describe the earlier behavior.

Verified in source:

1. Setup was immediately stale under React Query defaults, allowing focus/remount/reconnect traffic even when server workflow data was cached. The client change reduces those reloads.
2. `discoverPipelineWorkflows` opens the repository before consulting its five-minute Redis display cache. `openRepository` verifies the installation and fetches repository metadata. Cached workflow lists intentionally retain live access checks.
3. Opening an uncached workflow source opens a Contents reader and separately discovers workflows through an Actions reader. Both readers verify installation/repository access. File reads are pinned to the selected policy branch's commit.
4. Installation verification calls `/app/installations/{installation_id}` through the app scope; repository calls use the installation scope. Concurrent verification is deduplicated, but completed verification is not cached. A request can be paused by either budget.
5. Shared pacing reserves one slot every 250 ms. That controls bursts but does not track the available hourly budget. It honors GitHub reset/Retry-After responses and shares cooldowns through Redis; without available Redis, coordination falls back to each process.
6. Background installation sync checks inventory every five minutes, independently of interactive workflow loading. Other worker consumers can share installation requests. The worker's five-second scheduler does not mean a full inventory sync every five seconds: the sync query checks its last attempt timestamp and uses a lease.

These are confirmed traffic contributors, not proof of the exact production budget exhaustion. No production logs or installation-token response headers were available during this investigation. The reported 507-second error does not distinguish primary exhaustion from a secondary restriction. On the next occurrence, inspect `github.rate_limit` in API/worker logs, correlate `scopeHash`, `operation`, `kind` and reset time, and check Redis availability. App verification, Actions, branch/file lookup and repository metadata categories are now distinguishable. Operations outside those categories appear as `other` and may need further instrumentation if dominant. Do not weaken authorization checks or silently switch branches to avoid rate limits.

GitHub documents both primary installation limits and secondary limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

## Local validation

- Focused API limiter/provider/cache tests: 28 passed.
- Focused Chromium error-panel and API-client tests: 9 passed.
- API and web TypeScript checks and changed-file web lint passed.
- No deployment, commit or push performed.
