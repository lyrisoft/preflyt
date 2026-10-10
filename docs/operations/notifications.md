# Engineering notifications

Application connections and feature switches are now provisioned in **Settings → Configuration** by Super Admin. Environment names below describe the legacy import contract; once stored, database values take precedence. See [deployment configuration](deployment-configuration.md). Infrastructure and execution trust controls remain deployment-managed.

## Enable

1. Apply database migrations: `pnpm --filter @preflyt/api prisma:migrate` from the repository root. Compose runs migrations through its existing migrate service.
2. As Super Admin, enable **Workspace notifications** in **Settings → Configuration**. The API and worker load the same database setting and refresh it within five seconds. Legacy `NOTIFICATIONS_ENABLED` values are used only on the first configuration import. Keep API and worker on the same database and persistent queue prefix; `QUEUE_REDIS_URL` remains deployment-managed.
3. Start the API and worker with their documented deployment commands. A notification switch change does not require restart; connection changes, including SMTP, require restarting both processes. See [deployment configuration](deployment-configuration.md).
4. Create a new assessment, or let a signed PR/CI delivery produce one. The worker reconciles pending events every five seconds. The bell checks for updates every thirty seconds; Refresh fetches immediately.

The bell stays visible between Search and the theme toggle. Its panel explains when notifications are disabled. Existing assessments are not backfilled. No historical or fabricated alerts are generated.

## Recipients and permissions

Active organization Owners/Admins, repository-assigned Engineering Leads, the manual requester and linked GitHub PR authors can receive an alert. Each recipient needs assessment access. Signed contributor observations at the same repository commit establish GitHub authorship. Every inbox read, count and read action rechecks current repository scope; membership/grant/provider-access revocation hides prior alerts. GitHub access evidence uses the existing five-minute maximum freshness contract.

The inbox supports repository search, unread/severity/event/date filters, 25 items per page, read actions and an assessment-alert switch. The switch affects future alerts only. Policy-publication notices go to currently authorized Owners/Admins and repository Policy Managers. Muting optional assessment alerts does not suppress governance, critical finding, native execution failure or AI administration notices. Scoped Security Engineers also receive critical finding and native failure notices. These inbox notices still require current repository access; email remains separately opt-in.

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

Focused integration tests cover the actual assessment producer, duplicate/concurrent delivery, source-transaction rollback, recipient isolation, grant/member revocation, read persistence, filters, session/origin checks, preferences, bounded retries, queue outage and real Redis/BullMQ recovery after a transient error. Browser interactions and a live GitHub webhook were not verified. Policy publication, opt-in delivery and retry states are tested with PostgreSQL, Redis and local SMTP. A production SMTP provider has not been exercised. Confirmed automatic blocked/incomplete readiness and managed ruleset activation/rollback/drift producers are implemented, as described below. Exception producers, subscriptions beyond default recipients, digests, quiet hours and a replay UI remain unimplemented.

## Optional email setup

As Super Admin, enable email notifications and configure SMTP host, port (default 587), sender and any required credentials in **Settings → Configuration**. These credentials are encrypted in the database and masked in the browser. Keep `WEB_ORIGIN` in deployment configuration; production requires HTTPS. Workspace notifications must also be enabled. Restart both API and worker after SMTP connection changes; the email switch itself refreshes live.

SMTP requires TLS. Development can use `SMTP_ALLOW_INSECURE_LOCAL=true` only with a loopback SMTP server; production ignores this exception. Delivery requires each user to enable **Email updates** in inbox preferences and have a valid email address. GitHub-backed recipients require the worker's GitHub App and encrypted-user-token configuration for fresh authorization checks.

Emails contain only a generic link to `/notifications`, with no repository names, SHAs or report details. Opening the inbox still requires current authorization. SMTP acceptance is recorded as **Email sent**; it does not prove arrival in the recipient's mailbox.

Email delivery uses a separate Redis queue and a PostgreSQL lease, up to five attempts with exponential retry delay. Preference and current repository access are checked immediately before each send. Opt-out or revoked access skips delivery. The inbox shows delivery status and an attempt-count tooltip. Static failure codes avoid exposing transport errors.

```sql
SELECT id, state, attempts, "nextAttemptAt", "leaseUntil", "failureCode"
FROM "NotificationEmailDelivery"
WHERE state IN ('PENDING', 'FAILED')
ORDER BY "createdAt";
```

`DELIVERY_UNAVAILABLE` means transport/configuration could not complete; `DELIVERY_UNCONFIRMED` means the final delivery state could not be confirmed. A known SMTP acceptance followed by a database acknowledgement failure stops automatic resends. A process crash or connection loss around SMTP acceptance can still cause duplicates after lease recovery: SMTP does not provide exactly-once delivery. Stable message IDs help trace attempts but do not guarantee provider deduplication.

After investigating the cause and possible prior acceptance, an operator can reset one reviewed failed delivery:

```sql
UPDATE "NotificationEmailDelivery"
SET state = 'PENDING', attempts = 0, "leaseUntil" = NULL,
    "nextAttemptAt" = NOW(), "failureCode" = NULL
WHERE id = '<reviewed-delivery-id>' AND state = 'FAILED';
```

The next reconciliation retries it with fresh authorization. Never replay unconfirmed deliveries without considering duplicate email. Outbox and inbox state stay intact when SMTP is unavailable.


Confirmed automatic BLOCK/INCOMPLETE publication, managed activation/rollback and GitHub drift verification use the existing notification outbox and email worker. Repeated polling does not duplicate the same PR/head/policy/result notice. Unknown or failed deployment writes never appear as successful activation notices. Keep `NOTIFICATIONS_ENABLED=true` on API and worker for recording and delivery; optional SMTP configuration and opt-in still apply. The inbox links open the relevant Quality Gates tab. Manual **Verify GitHub** discovers drift; the worker also performs bounded, read-only verification of due managed deployments. It never repairs or disables an externally changed protection automatically.

## Critical reports and human triage

New assessments with current repository/install/commit-bound imported evidence that reports an unsuppressed critical finding enqueue `CRITICAL_FINDINGS_REPORTED` through the existing transactional outbox. Notification payloads contain links and identifiers, not report text. Scoped Security Engineers join the existing authorized recipients. Current access is required; optional assessment mute does not suppress these security notices, while email remains opt-in. A reported critical finding is not an independently confirmed vulnerability.

Findings supports assignment, In review and Resolved against the saved finding digest and commit. Resolution requires a note; optimistic revisions reject conflicting edits. Changing triage never rewrites an assessment, suppresses source evidence, waives a requirement or changes a gate conclusion. New commits require fresh triage.


## Native execution and AI availability

An admitted native attempt that fails, times out or cannot provide its completion proof records **Check execution failed** in the same transaction as its terminal state. One event per request/attempt prevents retry and assessment-creation duplicates. Explicit user cancellation and blocked admission do not create failure alerts. Check conclusions and partial evidence remain unchanged. The alert opens the repository's Assessments tab and contains no scanner logs, source text or secrets.

AI model availability notices target only current organization Owners/Admins who retain repository and model-configuration access. Three distinct review requests with actual network, deadline or upstream availability failures within ten minutes, spanning at least one minute since the latest successful inference, produce an alert. A connection revision has a thirty-minute cooldown; retries do not create repeated signals. Invalid output, rejected endpoint addresses, provider configuration changes, revoked access and user cancellation do not count as provider outages. A successful inference resets the failure sequence. The notice opens **AI Intelligence → Models**.

A review rejected by the configured daily reservation limit records one **AI review budget reached** notice per route revision and UTC day. The rejected request reserves nothing and sends no model request. This is an estimated admission reservation limit, not billed provider spend. The notice opens **AI Intelligence → Model router**. No provider response, key, prompt or review source is stored in these notification payloads. Optional assessment mute does not suppress AI administration notices; email remains opt-in and rechecks current role and access.
