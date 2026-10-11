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

The inbox supports repository search, unread/severity/event/date filters, 25 items per page, read actions and an assessment-alert switch. The switch affects future alerts only. Policy-publication notices go to currently authorized Owners/Admins and repository Policy Managers. Muting optional assessment alerts does not suppress governance, critical finding, native execution failure or AI administration notices. Scoped Security Engineers also receive critical finding and native failure notices. These inbox notices still require current repository access; personal email remains separately opt-in. Organization email channels are managed separately by an Owner or Admin.

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

Focused integration tests cover the actual assessment producer, duplicate/concurrent delivery, source-transaction rollback, recipient isolation, grant/member revocation, read persistence, filters, session/origin checks, preferences, bounded retries, queue outage and real Redis/BullMQ recovery after a transient error. Browser interactions and a live GitHub webhook were not verified. Policy publication, opt-in delivery and retry states are tested with PostgreSQL, Redis and local SMTP. A production SMTP provider has not been exercised. Confirmed automatic blocked/incomplete readiness and managed ruleset activation/rollback/drift producers are implemented, as described below. Exception producers, event-specific subscriptions, digests, quiet hours and a replay UI remain unimplemented. Organization-wide named email channels are implemented; they receive the supported organization events without event-specific filtering.

## Shared email transport setup

As Super Admin, enable email notifications and configure SMTP host, port (default 587), sender and any required credentials in **Settings → Configuration**. These credentials are encrypted in the database and masked in the browser. Keep `WEB_ORIGIN` in deployment configuration; production requires HTTPS. Workspace notifications must also be enabled. Restart both API and worker after SMTP connection changes; the email switch itself refreshes live.

SMTP requires TLS. Development can use `SMTP_ALLOW_INSECURE_LOCAL=true` only with a loopback SMTP server; production ignores this exception. Personal email requires each user to enable **Email updates** in inbox preferences and have a valid sign-in email address. Organization channels do not depend on personal preferences or a sign-in email address; an Owner or Admin explicitly saves their recipients as described below. GitHub-backed personal recipients and administrators requesting tests require the worker's GitHub App and encrypted-user-token configuration for fresh authorization checks.

Emails contain only a generic link to `/notifications`, with no repository names, SHAs or report details. Opening the inbox still requires current authorization. SMTP acceptance is recorded as **Email sent**; it does not prove arrival in the recipient's mailbox.

Email delivery uses a separate Redis queue and a PostgreSQL lease, up to five attempts with exponential retry delay. Personal preference and current repository access are checked immediately before each personal email send. Opt-out or revoked access skips delivery. The inbox shows delivery status and an attempt-count tooltip. Static failure codes avoid exposing transport errors.

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


## Connect organization email channels

1. Switch to the intended GitHub organization, then open **Settings → Notifications** as an organization Owner or Admin.
2. Choose **Add email channel**, give it a clear name (for example, Engineering updates), and enter recipient addresses. Each channel supports one to twenty distinct addresses, including distribution lists. An organization supports up to ten channels. Saving a channel does not create identities or grant inbox access.
3. Save the channel. Settings can be saved while SMTP is unavailable; the page reports deployment delivery availability separately from the channel’s enabled state.
4. After the shared transport is configured, use **Send test**. A successful action reports **Test queued**. The worker sends one generic test email per recipient. Wait for the recorded delivery state; tests are limited to one per channel per minute.
5. Enabled channels receive newly processed supported events for selected repositories in that organization. Already delivered history is not backfilled. Personal inbox and email switches have no effect on organization channels.

Only current Owners/Admins can view recipient lists or manage channels through `notifications.manage`. `GET`, `POST`, `PATCH`, `DELETE` and the test route are under `/notifications/channels`. Requests require `X-Preflyt-Organization` to match the active session organization; a missing or mismatched value returns 409. Edits, removal and tests require the latest `expectedRevision`; stale requests return 409. Writes validate the trusted Origin. The server, not the submitted header, determines the tenant, and fresh provider authorization applies.

A test must pass the current notification/email switches, transport configuration and channel state before it can be queued. Its requesting administrator is reauthorized by the worker before delivery. Event delivery verifies the current channel, recipient and source repository/organization, without exposing repository details in the message. SMTP transport credentials remain deployment-wide and available only in Super Admin configuration; an organization administrator manages destinations rather than sender credentials.

`NotificationChannelDelivery` stores each channel/event/recipient delivery independently. Redis reconciliation resumes pending messages after queue outages; PostgreSQL leases and at most five attempts bound retries. Reprocessing the same event cannot duplicate the same channel/event/recipient row. Test messages have no source event and are separately rate-limited. Audit entries contain IDs, state, counts and revisions, never recipient addresses or raw transport errors.

Pause or remove a channel to cancel its pending deliveries. Removing an address cancels pending messages to that address. Workers recheck saved channel state immediately before SMTP. SMTP already in flight cannot be recalled; an acceptance after a pause is recorded as sent rather than requeued. Existing delivery history and personal preferences remain intact. Email delivery does not decide policy, assessment or merge outcomes.

To inspect a reviewed delivery with an authorized operational database session, use IDs and failure codes instead of logging recipient addresses:

```sql
SELECT id, "channelId", kind, state, attempts, "nextAttemptAt", "leaseUntil", "failureCode"
FROM "NotificationChannelDelivery"
WHERE state IN ('PENDING', 'FAILED')
ORDER BY "createdAt";
```

The SMTP uncertainty and duplicate-delivery limits documented for personal email also apply to organization channels. Production SMTP qualification remains separate from local fixture verification. Apply the additive channel migration before deploying the new API or worker; keep API and worker on matching code and the same database. A code rollback can retain the new tables and channel history without a destructive rollback.


Confirmed automatic BLOCK/INCOMPLETE publication, managed activation/rollback and GitHub drift verification use the existing notification outbox and email worker. Repeated polling does not duplicate the same PR/head/policy/result notice. Unknown or failed deployment writes never appear as successful activation notices. Enable workspace notifications for recording and delivery; the shared SMTP configuration still applies. Personal email is opt-in, while organization channels use their explicit admin-managed destinations. The inbox links open the relevant Quality Gates tab. Manual **Verify GitHub** discovers drift; the worker also performs bounded, read-only verification of due managed deployments. It never repairs or disables an externally changed protection automatically.

## Critical reports and human triage

New assessments with current repository/install/commit-bound imported evidence that reports an unsuppressed critical finding enqueue `CRITICAL_FINDINGS_REPORTED` through the existing transactional outbox. Notification payloads contain links and identifiers, not report text. Scoped Security Engineers join the existing authorized recipients. Current access is required; optional assessment mute does not suppress these security notices, while personal email remains opt-in. A reported critical finding is not an independently confirmed vulnerability.

Findings supports assignment, In review and Resolved against the saved finding digest and commit. Resolution requires a note; optimistic revisions reject conflicting edits. Changing triage never rewrites an assessment, suppresses source evidence, waives a requirement or changes a gate conclusion. New commits require fresh triage.


## Native execution and AI availability

An admitted native attempt that fails, times out or cannot provide its completion proof records **Check execution failed** in the same transaction as its terminal state. One event per request/attempt prevents retry and assessment-creation duplicates. Explicit user cancellation and blocked admission do not create failure alerts. Check conclusions and partial evidence remain unchanged. The alert opens the repository's Assessments tab and contains no scanner logs, source text or secrets.

AI model availability notices target only current organization Owners/Admins who retain repository and model-configuration access. Three distinct review requests with actual network, deadline or upstream availability failures within ten minutes, spanning at least one minute since the latest successful inference, produce an alert. A connection revision has a thirty-minute cooldown; retries do not create repeated signals. Invalid output, rejected endpoint addresses, provider configuration changes, revoked access and user cancellation do not count as provider outages. A successful inference resets the failure sequence. The notice opens **AI Intelligence → Models**.

Token pricing and budget admission have been removed. New reviews create no budget notices; historical notices retain their access controls and display as previous AI settings failures. No provider response, key, prompt or review source is stored in AI notification payloads. Optional assessment mute does not suppress AI administration notices; personal email remains opt-in and rechecks current role and access. Organization channel email uses the separate explicit admin configuration above.

### Local queued-email troubleshooting

A queued message is saved in PostgreSQL and waits for the background worker. Set `QUEUE_REDIS_URL` in the API and worker deployment environment, using persistent Redis/Valkey with `noeviction`, then restart both processes. The local development worker command is `pnpm --filter @preflyt/api start:worker:dev`; this starts real background processing and can send already queued emails. Never reset the database or delete delivery records to unblock the queue. Notification channel tests are unavailable when the queue connection is missing or invalid.

A Super Admin recovery account without an email address cannot receive personal email alerts. Organization channels use explicitly configured recipients and are independent of that account's personal preferences.

### Email presentation

Personal alerts, organization alerts and channel tests share a minimal HTML template: Preflyt branding, a short message and one **View notifications** button. Every message also includes a plain-text alternative. The link uses the deployment’s `WEB_ORIGIN`; email contains no repository names, findings or review contents, and no remote images or tracking pixels. Restart the worker after deploying template changes.
