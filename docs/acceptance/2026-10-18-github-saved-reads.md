# GitHub saved reads and throttling audit — 2026-10-18

## Findings and changes

The code audit found request amplification from page-triggered branch/workflow/ruleset reads, cold finding-source capture, expired GitHub-user access verification, notification channel reads requiring fresh verification, and a once-per-second AI review authorization check. These are code findings; production rate-limit header/log attribution was not available in this run.

- Normal branch, workflow, ruleset and health freshness reads now use durable PostgreSQL snapshots. Cold reads enqueue work; saved results survive refresh failures. Finding source is captured and redacted by the worker.
- User-access evidence renews in background. Expired evidence blocks access pending verification; it is not extended during an outage. Directory snapshots remain identity/organization/access-revision scoped.
- Signed webhook deliveries queue refreshes. Delivery hashes prevent replay amplification, and generation fencing prevents an in-flight refresh from overwriting a newer event. Webhooks do not grant access.
- Installation GET requests conditionally revalidate ETags. A 304 reuses the saved response only after GitHub accepts the request. Budget refunds cannot cross reset windows.
- Governance requests now share the installation/app limiter with other provider calls. API and worker share Redis leases, cooldowns and request-budget reservations.
- Inventory and PR sync, pipeline processing, readiness automation, native preparation and AI feedback defer throttled work rather than consuming failure attempts. Lifecycle BullMQ jobs use delayed retries. Health/source/contributor deferral paths were also inspected.
- AI cancellation polling uses local authorization. Fresh authorization remains at execution boundaries. Pre-inference throttling preserves a queued review and retry deadline. Once inference starts, automatic replay remains prohibited to avoid duplicate provider usage; review expiry and native execution deadlines remain enforced.

## Audit boundaries

Inspected outbound GitHub calls in the main provider, identity provider, governance provider, release checker and manifest conversion, plus their page and worker callers. OAuth sign-in, explicit writes/imports, workflow downloads/packages, setup PRs and merge-related verification still need live GitHub access. Release checks already use a database lease and ETag; manifest conversion is a one-time setup operation. Team reconciliation retains saved scope and periodically retries through the shared limiter. These do not turn ordinary page reads into live refreshes.

Saved display data is not execution evidence. Health freshness uses the snapshot's observation timestamp. Installation/user access changes continue to invalidate or deny access. Unused display/directory snapshots expire after seven days.

## Local validation

- Isolated PostgreSQL: display snapshots/webhook race tests, access renewal, source capture/revocation, pipeline retry handling and related authorization tests passed.
- Isolated Valkey: multi-replica deduplication, lease fencing, budgets, installation isolation and conditional-budget refund tests passed.
- Conditional GET and limiter unit tests passed.
- AI configuration/review suite: 65 passed, including pre-inference deferral, feedback retry preservation and local cancellation polling.
- Browser retry UI: 4 passed, including queued synchronization and cooldown expiration.
- API production build, documentation production build/version checks, and Compose configuration validation passed.
- New schema migrations were exercised in disposable databases; no production database was changed.

No app Compose stack was running locally. Compose configuration and generated documentation downloads were updated; production containers were not restarted. Existing GitHub Apps need event subscriptions updated manually, with GITHUB_EVENTS_ENABLED and a valid webhook secret configured. No commit or push was performed.
