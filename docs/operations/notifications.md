# Assessment notifications

## Enable

1. Apply database migrations: `pnpm --filter @preflyt/api prisma:migrate` from the repository root. Compose runs migrations through its existing migrate service.
2. Set `NOTIFICATIONS_ENABLED=true` for **both API and worker**. For host development, add it to `apps/api/.env`; configure `QUEUE_REDIS_URL` with your local Redis URL, for example `redis://127.0.0.1:6379/0`. Keep API and worker on the same database and queue prefix.
3. Restart the API and worker yourself: `pnpm dev:api` and `pnpm dev:worker`. For Compose, configure the root `.env` and recreate `api` and `worker` services.
4. Create a new assessment, or let a signed PR/CI delivery produce one. The worker reconciles pending events every five seconds. The bell checks for updates every thirty seconds; Refresh fetches immediately.

The bell is hidden when disabled. Existing assessments are not backfilled. No fake alerts or email messages are generated.

## Recipients and permissions

Active organization Owners/Admins, repository-assigned Engineering Leads, the manual requester and linked GitHub PR authors can receive an alert. Each recipient needs assessment access. Signed contributor observations at the same repository commit establish GitHub authorship. Every inbox read, count and read action rechecks current repository scope; membership/grant/provider-access revocation hides prior alerts. GitHub access evidence uses the existing five-minute maximum freshness contract.

The inbox supports repository search, unread/severity/event/date filters, 25 items per page, read actions and an assessment-alert switch. The switch affects future alerts only. Required governance/security notice rules are not part of this P1 slice.

## Delivery and recovery

`NotificationEvent` is the durable PostgreSQL outbox. It contains only resource IDs, repository name, exact SHA, event type, severity and actor reference. Source code, tokens and report bodies are excluded. `InboxNotification` is unique by event/identity, and delivery is transactional. `notification.in_app.delivered` and preference changes are audited.

Redis transport uses a separate `notifications` queue under `QUEUE_PREFIX`, five attempts with exponential backoff starting at one second. Failure counts persist in PostgreSQL across worker/Redis restarts. Events remain pending when Redis is unavailable; deterministic assessment contents never depend on transport availability. After five recorded failures the event is marked `failedAt` and reconciliation stops. Failed-job details must stay in operator-only tooling; do not send raw error details to users.

To inspect pending or failed events, use an authorized database session:

```sql
SELECT id, type, attempts, "createdAt", "failedAt"
FROM "NotificationEvent"
WHERE "deliveredAt" IS NULL
ORDER BY "createdAt";
```

For a reviewed failure after correcting its cause, reset only that event:

```sql
UPDATE "NotificationEvent"
SET attempts = 0, "failedAt" = NULL
WHERE id = '<reviewed-event-id>' AND "deliveredAt" IS NULL;
```

The next reconciliation removes a retained failed/completed transport job and safely requeues the pending event. Successful delivery cannot overwrite a previously read inbox entry. Do not replay broad ranges without reviewing recipient access and the failure cause.

## Upgrade and rollback

This migration is additive. Apply it before enabling the flag. Disable the flag in API/worker and restart them before rolling back application binaries. Keep the tables and stored read state; no destructive rollback is necessary. Re-enable after upgrading to a compatible version. Notifications disabled at creation time cannot be reconstructed automatically.

## Verification and limits

Focused integration tests cover the actual assessment producer, duplicate/concurrent delivery, source-transaction rollback, recipient isolation, grant/member revocation, read persistence, filters, session/origin checks, preferences, bounded retries, queue outage and real Redis/BullMQ recovery after a transient error. Browser interactions and a live GitHub webhook were not verified. Email, policy/gate/exception notifications, subscriptions beyond default assessment recipients, digests, quiet hours and a replay UI are not implemented.
