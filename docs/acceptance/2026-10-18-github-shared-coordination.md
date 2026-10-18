# Shared GitHub refresh and budget coordination

## Implemented

- Redis owner-fenced leases deduplicate display loads and overlapping explicit refreshes across processes; process-local coalescing remains for single-process development.
- Display installation/repository access proofs expire after 30 seconds by default (configuration bounded to 5–60 seconds). Local authorization, durable access revisions, connection changes and inactive installations remain authoritative. Writes and explicit refreshes verify upstream access.
- GitHub response headers feed atomic per-authentication-scope budget reservations. Worker requests spread their allowance across the reset window and preserve a default 10% interactive reserve. Shared cooldowns still honor GitHub restrictions.
- Configured Redis outages stop coordinated requests rather than allowing independent fallback traffic.
- Compose now gives the worker the same Redis URL and namespace as the API. Previously these were absent from the worker environment, preventing shared coordination. Both services receive the access TTL and reserve configuration; the worker waits for cache health. The coordination cache uses noeviction.
- Updated operator and editable documentation and regenerated Compose downloads. Existing versioned documentation snapshots are unchanged.

This establishes request admission and deduplication; it does not eliminate GitHub limits or introduce a new durable job scheduler. Existing workers retain their retry/defer behavior. Unknown budgets use conservative pacing until response headers arrive. Redis restart clears observations. Production exhaustion has not been reproduced or attributed to a measured specific request category.

## Local verification

- Real isolated Valkey integration and focused provider/cache/limiter suites: 7 files, 84 tests passed. Includes 100 concurrent readers across 10 instances, overlapping forced refresh, expired-owner fencing, failed-refresh recovery, bounded access expiry, fresh refresh/write access, revocation and revision races, installation isolation, reserved interactive budget and atomic remaining-budget admission.
- Pipeline setup tests: 2 passed.
- API production build (Prisma client generation and TypeScript): passed.
- Compose configuration validation with synthetic required values: passed.
- Documentation download generation and git diff whitespace check: passed.

The first rerun was blocked by sandbox socket permissions; the same suites passed with local network access. Tests used an isolated Valkey container, unique key prefixes and mocked GitHub responses, not production GitHub credentials. No production deployment, commit or push.
