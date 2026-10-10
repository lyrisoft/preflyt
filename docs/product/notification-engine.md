# Preflyt Notification Engine

**Status:** P1 assessment in-app inbox implemented behind `NOTIFICATIONS_ENABLED`; P2 policy-publication notices, opt-in personal SMTP delivery and organization-wide email channels are implemented. Confirmed automatic blocked/incomplete readiness checks and managed ruleset activation, rollback and detected drift now create durable notices. P3 admitted execution failure notices and P4 sustained model outage / daily review budget notices use the same transactional outbox. Exception events remain pending until an exception workflow is implemented. **Phase order unchanged:** P1 in-app, P2 email and governance, P3 security, P4 AI, later SDLC and channels.

## Purpose and channels

Deliver actionable, repository-scoped engineering events to authorized recipients. MVP supports **in-app notifications**, optional personal email and **organization-wide email channels** managed by an Owner or Admin in Settings → Notifications, alongside existing GitHub Checks (which remain authoritative quality-gate outputs, not notification delivery). Slack, Teams and signed outbound webhooks are later integrations.

## Architecture

Domain events → transactional outbox (PostgreSQL) → BullMQ delivery workers (Redis) → tenant-aware recipient resolution → policy/preferences/deduplication → in-app inbox, personal email and organization channel email adapters → delivery status and audit.

Event schema: immutable event ID, organization ID, type, severity, source resource/revision, actor, occurred_at, schema version, idempotency key and redacted payload. Never place secrets, full source snippets or unrestricted evidence in notifications.

Notification record: recipient, channel, event reference, read_at, delivered_at, attempts, next retry, failure classification and deep link. Use outbox idempotency, exponential backoff, bounded retries and dead-letter/replay controls. Event producers must not block quality gates on email outages.

## Events and recipients

| Event | Default recipient | Phase |
| --- | --- | --- |
| Assessment completed/failed/incomplete | PR author and authorized repository lead | P1 |
| Gate BLOCK or required evidence missing | PR author, repository lead | P2 |
| Policy publication, ruleset drift, exception request/expiry | Policy managers, authorized approvers | P2 |
| Critical verified security finding or execution failure | Security engineer, repository owner | P3 |
| Sustained AI provider outage or budget threshold | Organization admin | P4 |
| QA/performance threshold failures | Authorized test owner and repository lead | P6–P9 |
| Production incident correlation | Authorized operational owners | P10 |

Personal recipients are resolved from current RBAC, resource scope and explicit subscriptions. Organization email channels use addresses explicitly saved by an Owner or Admin and receive generic updates from the organization’s currently selected repositories. No cross-tenant leakage. Avoid sending restricted finding details to users lacking evidence permission. Self-approval of exceptions remains prohibited.

## Dashboard experience

- Top-bar notification bell shows unread count **from actual persisted events**.
- Panel: event title, severity, repository, time, status, deep link, mark-read; supports loading/empty/error.
- `/notifications`: filter by unread, severity, repository, type and date; pagination, bulk mark-read and preferences.
- Preferences: per-user channel/event selection, digest/frequency and quiet hours when supported; mandatory security/governance notices cannot be disabled except by authorized organization policy.
- Personal email is an opt-in inbox preference and requires an available sign-in email address. Organization channels are separate: admins save named email destinations and recipients for the whole organization, even when their own sign-in account has no email address.
- Super Admin configures the shared SMTP transport in Settings → Configuration. Email contains only a generic authorized-inbox link; no repository name, commit, finding or source is included.

## Organization notification channels

**Settings → Notifications** lets current organization Owners and Admins connect multiple named email channels, edit recipients, pause or resume delivery, remove a channel and send a test. Email is the first supported type; Slack, Teams and webhooks are not shown as functional channels. Each organization can have up to ten channels, each with one to twenty normalized, distinct addresses. Distribution-list addresses are supported. Channel names are unique within the organization, ignoring case.

The API grants only Owner and Admin `notifications.manage`. It resolves the organization from the active session, verifies current membership and fresh provider access, and binds requests to the organization displayed when the action started. A workspace switch cannot silently apply an edit to a different organization. Recipient addresses are not exposed to other roles. Saving settings does not require a working SMTP transport; sending a test requires notifications and email to be enabled, valid transport settings, an enabled channel and the current channel revision.

**Test queued** means one durable message per recipient was scheduled, not that it reached a mailbox. Repeated tests are limited to one per channel per minute. Workers recheck the requesting admin’s current authority for test messages and the current channel, recipient list and source organization for every send. The latest recorded delivery is shown with attempt count and a static failure code, together with the total number of messages still queued across all recipients. **Email sent** means SMTP accepted that message; it does not prove inbox arrival.

Channels receive new supported events independently of personal preferences. Saving a channel does not replay already delivered history, subscribe addresses as Preflyt identities, grant access or change a gate. Opening the email link still requires current Preflyt authorization. Channel changes and tests are audited without raw recipient addresses. Pausing or removing a channel cancels pending messages transactionally; removing an address cancels its pending messages. A message already in flight to SMTP cannot be recalled. Personal inbox and optional personal email preferences remain separate.

## Phase-aligned deliverables

- **P1.N1:** event schema, durable outbox, queue, recipient resolver and functional in-app inbox for assessment events.
- **P2.N1:** quality-gate/policy/exception/ruleset notifications, configured email adapter, delivery history and retry visibility.
- **P3.N1:** critical security and execution failure events with severity-aware routing.
- **P4.N1:** AI provider/budget availability notifications with debounce to avoid alert storms.
- **P6–P11:** QA/performance/production events and optional Slack/Teams/signed webhooks, digests and advanced routing.

Each increment must be independently usable within its existing phase, without invalidating already completed work.

## Acceptance

- [x] A real assessment event creates exactly one inbox entry per eligible recipient despite repeated webhook delivery.
- [x] Unauthorized users cannot retrieve another organization's or repository's notifications.
- [x] Read/unread state persists; unread count reconciles with inbox.
- [x] Configured SMTP sends generic inbox links and records success/failure; delivery outages do not change assessment or policy results.
- [ ] Retry/backoff, dead-letter, preferences, mandatory notice policy and revocation are tested.
- [ ] No fabricated alerts, secret leakage or evidence exposure in UI, email or telemetry.
- [x] Implemented bell remains visible with loading, disabled, error and empty states.
- [x] Organization channel APIs enforce current Owner/Admin access, tenant isolation, displayed-organization binding, trusted request origin, bounded destinations and revision-controlled edits.
- [x] Concurrent duplicate names/channel limits, stale writes, test throttling and cancellation of pending recipient/channel delivery are fixture-tested.

## Current P1 implementation

Assessment creation saves a redacted event in the same PostgreSQL transaction. The existing Redis worker dispatches and delivers the in-app event, deduplicated by assessment and recipient. Organization Owners/Admins, repository-assigned Engineering Leads, the manual assessment requester, and linked GitHub PR authors are eligible only when their current membership and repository grant permit assessment access. CI-only commits without a matching signed author observation notify the authorized leads; Preflyt never guesses authors from email or usernames.

The bell, `/notifications` filters/pagination, individual and bulk mark-read, and optional per-user assessment notification preference are functional. Every inbox/count/read request rechecks current repository access, including the bounded GitHub user-access checks used elsewhere. Preferences suppress future assessment alerts; they do not delete existing alerts. Policy publication also saves a transactionally linked event. Owners/Admins and repository-scoped Policy Managers receive it when current policy access allows it, even if optional assessment alerts are muted. Optional personal email sends a generic inbox link to identities with valid email addresses, after fresh authorization and preference checks. Inbox entries show email status and attempt counts. Critical verified imported-report findings, admitted native execution failures, governance notices and AI availability/budget notices remain in-app when optional assessment alerts are muted. Digests, quiet hours and an operator replay UI remain future work.

Imported CI failure, missing required evidence, and a saved assessment are separate updates. None claims that tests ran successfully or that a PR may merge. Historical assessments are not backfilled and assessments created while the flag is off emit no events. See [setup and retry recovery](../operations/notifications.md).


### Confirmed readiness and ruleset notices

Automatic publication records blocked/incomplete notices in the same PostgreSQL transaction as the verified publication receipt and audit. IDs deduplicate repeated polling by repository, PR, commit, policy and outcome. Successful readiness checks do not create these alerts. Activation/rollback notices are committed with verified managed deployment receipts. Drift notices require a fresh GitHub read and deduplicate the same observed configuration hash. Unknown provider writes never emit a successful activation notice.

Readiness notices use current assessment access, assigned leads and linked authors; assessment preferences apply. Governance notices use current policy access and authorized Owners/Admins or repository-scoped Policy Managers. Governance notices remain in-app even when optional assessment alerts are muted. Personal email remains opt-in, generic and freshly authorized; organization channels use the separate explicit admin configuration described above. Notifications link to the selected repository's Readiness check or GitHub Rulesets tab. No notification changes a gate or bypasses GitHub protection. Manual refresh and scheduled read-only worker checks discover drift; exception notifications remain pending until the exception workflow is implemented.


### Execution failures and AI availability

Admitted native execution failures, missing completion proof, confirmed timeouts and worker interruptions save one redacted notice per controller attempt. A saved native assessment reuses that failure notice; admission denial and explicit user cancellation do not create an execution-failure alert. Native-only failing check results retain failure classification without turning missing evidence into a passing result. Verified critical findings currently come from imported reports; signed native receipts store counts rather than report text, so native finding detail needs a separate reviewed contract.

A sustained model outage requires transport failures from at least three distinct reviews within ten minutes, spanning at least one minute after the most recent successful review. A thirty-minute cooldown applies to each connection revision. Invalid output, endpoint safety rejection, user cancellation, revoked access and configuration changes do not qualify. A daily reservation-limit rejection records one budget notice per model route revision and UTC day, reserves no additional budget and makes no model call. This describes reservation admission, not invoiced provider spending.

AI notices go to current organization Owners/Admins with repository and AI configuration access. Execution failures also include currently authorized Security Engineers. Inbox, read and personal email operations recheck current access; personal email stays opt-in. Organization channels use the same generic email privacy boundary and current channel checks. Model outages link to Models, budget notices to Model router, and execution failures to Assessments. No keys, provider response bodies, prompts, source or scanner logs enter these events.
