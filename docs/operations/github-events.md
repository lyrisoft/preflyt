# GitHub PR and CI webhook events (P1.1)

This slice records signed, revision-bound GitHub events for selected repositories. It does not import test artifacts, execute code, create assessments or publish a quality gate. Open a selected repository profile to view the latest 50 deliveries, GitHub source state, exact commit and processing status. Older revisions remain history; a late delivery never advances a current PR or changes a verdict.

## Configure

1. Apply migrations: `pnpm --filter @preflyt/api prisma:migrate` and regenerate the Prisma client: `pnpm --filter @preflyt/api prisma:generate`.
2. Set `GITHUB_EVENTS_ENABLED=true` and a strong random `GITHUB_WEBHOOK_SECRET` of at least 32 characters (generate locally with `openssl rand -hex 32`) in `apps/api/.env`. Use that same secret in the GitHub App webhook settings. Keep it out of source control and logs.
3. Set `QUEUE_REDIS_URL=redis://127.0.0.1:6379/1` and a deployment-specific `QUEUE_PREFIX=preflyt:development:queue`. Local Valkey currently uses `noeviction`. Sharing its instance with the cache is acceptable for development only; different Redis database numbers do not isolate memory/eviction. Production queues need a dedicated persistent Redis/Valkey service with `noeviction`, independently of the expendable metadata cache.
4. In GitHub App settings enable the webhook and set its public HTTPS URL to `<API origin>/github/webhooks` for direct API access, or `<web origin>/api/github/webhooks` behind Preflyt's Compose proxy. GitHub cannot deliver to localhost; expose your local API through an HTTPS development tunnel you control.
5. Grant **Pull requests: read**, **Checks: read**, and **Actions: read** when subscribing to those event types, in addition to the existing metadata/contents read permissions. Approve any installation permission update. Subscribe to **Pull request**, **Check run**, and **Workflow run**. No write permission is required.
6. Start the API with `pnpm dev:api` and the separate worker with `pnpm dev:worker`. Open/synchronize a PR or finish a CI run on a repository explicitly selected in Preflyt. The profile's event table refreshes every 10 seconds.

Worker startup needs the database URL, queue URL/prefix and events flag. It needs no GitHub App private key, webhook secret, OIDC settings or model keys. The API needs the webhook secret but no queue connectivity to accept deliveries.

## Deploy, recovery and limits

Set the same settings in `deploy/.env`, using a container-reachable queue address. Start the opt-in worker with `docker compose --env-file deploy/.env --profile events up -d --build`. The default Compose deployment retains P0 behavior with events disabled. Worker health is a heartbeat after successful PostgreSQL reconciliation and Redis queue probe, updated every five seconds. The API's existing readiness still depends only on PostgreSQL.

The API verifies HMAC-SHA256 against the original bytes using a constant-time comparison, before event handling. The JSON body limit is 1 MiB; oversized bodies receive 413. Unsupported event/action combinations and unavailable/unselected repositories return 202 with `accepted:false` and are not retained. `pull_request` supports opened, reopened, synchronize, edited, closed and ready_for_review; `check_run` supports created, completed and rerequested; `workflow_run` supports requested, in_progress and completed. Fork PRs are associated with the installed base repository at the reported head SHA; this grants no execution or source-write authority.

Accepted normalized records are committed to PostgreSQL before 202. Duplicate delivery IDs are no-ops; reuse with different signed bytes/event returns 409. Invalid signatures return 401. Disabled/unconfigured ingestion returns 503. Repository/installation IDs, exact head SHA, source timestamps/status, delivery ID and payload SHA-256 are retained; raw bodies, PR text, CI logs, sender information, tokens and arbitrary URLs are discarded.

The worker reconciles up to 100 pending records every five seconds, using only delivery IDs as queue payloads. Redis outage or lost queue data leaves PostgreSQL records pending and safely re-enqueues them after recovery. Worker retries use exponential backoff, up to five attempts; exhausted processing is shown as failed with a fixed safe reason. Access changes before processing mark the event ignored. Processing and its audit event commit in one transaction; worker replay cannot duplicate the audit. No CI result is interpreted as a Preflyt PASS.

To recover a failed delivery, fix the dependency failure, then have an administrator change its PostgreSQL state from `FAILED` to `RECEIVED` with `reason`/`processedAt` cleared; reconciliation will dispatch it again. This operational repair has no UI action yet. Never flush shared Redis databases. Inbox retention is operator-managed in this first slice; account for event growth and back up PostgreSQL.

Rollback: disable `GITHUB_EVENTS_ENABLED`, stop the worker, and deploy the prior API/web build. Keep the additive inbox table and enum; older application versions ignore them. On re-enabling, pending accepted deliveries resume. No repository/profile records are deleted.

Scoped verification: `pnpm --filter @preflyt/api exec vitest run test/github-webhooks.integration.test.ts test/github-event-queue.test.ts test/github-worker.test.ts`. Queue integration tests use an isolated prefix and obliterate only their own queue after stopping their test worker.

Signature contract: [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries). Queue connection/eviction contract: [BullMQ connections](https://docs.bullmq.io/guide/connections).
