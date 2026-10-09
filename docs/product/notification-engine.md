# Preflyt Notification Engine

**Status:** P1 assessment in-app inbox implemented behind `NOTIFICATIONS_ENABLED`; P2 policy-publication notices and opt-in SMTP delivery are implemented. Confirmed automatic blocked/incomplete readiness checks and managed ruleset activation, rollback and detected drift now create durable notices. Exception events remain pending until an exception workflow is implemented. **Phase order unchanged:** P1 in-app, P2 email and governance, P3 security, P4 AI, later SDLC and channels.

## Purpose and channels

Deliver actionable, repository-scoped engineering events to authorized recipients. MVP supports **in-app notifications** and **email**, alongside existing GitHub Checks (which remain authoritative quality-gate outputs, not notification delivery). Slack, Teams and signed outbound webhooks are later integrations.

## Architecture

Domain events → transactional outbox (PostgreSQL) → BullMQ delivery workers (Redis) → tenant-aware recipient resolution → policy/preferences/deduplication → in-app inbox and email adapters → delivery status and audit.

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

Recipients are resolved from current RBAC, resource scope and explicit subscriptions. No cross-tenant leakage. Avoid sending restricted finding details to users lacking evidence permission. Self-approval of exceptions remains prohibited.

## Dashboard experience

- Top-bar notification bell shows unread count **from actual persisted events**.
- Panel: event title, severity, repository, time, status, deep link, mark-read; supports loading/empty/error.
- `/notifications`: filter by unread, severity, repository, type and date; pagination, bulk mark-read and preferences.
- Preferences: per-user channel/event selection, digest/frequency and quiet hours when supported; mandatory security/governance notices cannot be disabled except by authorized organization policy.
- Email uses configured SMTP or supported provider credentials from server secrets, with templates, unsubscribe controls for optional events, and no secret-bearing payloads.

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

## Current P1 implementation

Assessment creation saves a redacted event in the same PostgreSQL transaction. The existing Redis worker dispatches and delivers the in-app event, deduplicated by assessment and recipient. Organization Owners/Admins, repository-assigned Engineering Leads, the manual assessment requester, and linked GitHub PR authors are eligible only when their current membership and repository grant permit assessment access. CI-only commits without a matching signed author observation notify the authorized leads; Preflyt never guesses authors from email or usernames.

The bell, `/notifications` filters/pagination, individual and bulk mark-read, and optional per-user assessment notification preference are functional. Every inbox/count/read request rechecks current repository access, including the bounded GitHub user-access checks used elsewhere. Preferences suppress future assessment alerts; they do not delete existing alerts. Policy publication also saves a transactionally linked event. Owners/Admins and repository-scoped Policy Managers receive it when current policy access allows it, even if optional assessment alerts are muted. Opt-in email sends a generic inbox link to identities with valid email addresses, after fresh authorization and preference checks. Inbox entries show email status and attempt counts. Digests, quiet hours, other mandatory governance/security notices and an operator replay UI remain future work.

Imported CI failure, missing required evidence, and a saved assessment are separate updates. None claims that tests ran successfully or that a PR may merge. Historical assessments are not backfilled and assessments created while the flag is off emit no events. See [setup and retry recovery](../operations/notifications.md).


### Confirmed readiness and ruleset notices

Automatic publication records blocked/incomplete notices in the same PostgreSQL transaction as the verified publication receipt and audit. IDs deduplicate repeated polling by repository, PR, commit, policy and outcome. Successful readiness checks do not create these alerts. Activation/rollback notices are committed with verified managed deployment receipts. Drift notices require a fresh GitHub read and deduplicate the same observed configuration hash. Unknown provider writes never emit a successful activation notice.

Readiness notices use current assessment access, assigned leads and linked authors; assessment preferences apply. Governance notices use current policy access and authorized Owners/Admins or repository-scoped Policy Managers. Governance notices remain in-app even when optional assessment alerts are muted. Email remains opt-in, generic and freshly authorized. Notifications link to the selected repository's Readiness check or GitHub Rulesets tab. No notification changes a gate or bypasses GitHub protection. Manual refresh and scheduled read-only worker checks discover drift; exception notifications remain pending until the exception workflow is implemented.
