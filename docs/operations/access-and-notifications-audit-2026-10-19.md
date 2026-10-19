# Access and personal notification audit — 19 October 2026

Scope: the pending Engineering Lead authoring, permission-based navigation,
repository inventory and personal notification email changes. This is a focused
implementation audit, not a full product security assessment.

## Access controls

- Engineering Lead can create skills, standards and policy drafts. Skill approval,
  policy publication, organization membership administration and enforcement retain
  their separate permissions.
- Sidebar, command search and direct page entry follow the API session permissions.
  Forbidden pages do not mount their data requests; API checks remain authoritative.
- Repository inventory, counts, charts and links use readable repository scope.
  Inventory refresh cannot widen that scope. Previously loaded inventory is hidden
  when identity or workspace changes.
- The explicit Add repository dialog uses a separately authorized discovery endpoint
  returning only ID/name metadata. Adoption grants access before reports are opened;
  cross-organization adoption is rejected.

## Personal notification email

- Request, verify and remove operations derive identity and workspace from the
  authenticated session, check fresh permission and validate the request origin.
  Changing a notification address does not alter sign-in identities.
- Codes expire 15 minutes after request; verification has five attempts. Requests
  have a 60-second cooldown and a three-per-hour user/workspace limit.
- The API transaction persists the hash and encrypted delivery payload, then returns
  HTTP 202 without waiting for SMTP. Redis jobs contain only a delivery ID/type.
- Authenticated encryption binds each payload to the delivery, identity, workspace
  and hash. API and worker reuse the same deployment encryption key, with a distinct
  verification context.
- A leased worker retries transient SMTP failures for at most five total attempts.
  Expired, superseded, removed and verified requests stop pending delivery.
  Permission and current verification state are checked before sending.
- Normal alerts recheck opt-in, repository permission and destination before SMTP.
  Generic alert emails contain no report details.
- The settings card shows the address once. Setup and OTP entry use a modal with
  queued/sent/failure recovery, resend cooldown, numeric paste support and explicit
  Verify and enable. Removal shows a spinner and disables email controls.
- Audit corrections: restore focus to the opener after closing the modal; initialize
  the resend clock lazily and update it from events/timer callbacks; describe
  uncertain delivery as unconfirmed rather than a proven non-delivery.

## Verification

After explicit user approval to resume focused tests:

- API and web typechecks passed.
- 133 unique API regressions passed across repository scope, Engineering Lead
  permissions, notification preferences, verification codes, encryption binding,
  bounded retries, revocation and existing channel/SMTP behavior.
- 113 unique browser regressions passed across navigation, forbidden routes, skills,
  repository adoption, inbox/channels and personal email. Modal coverage includes
  focus restoration, pending-removal spinner, queued delivery, resend recovery and
  a 320px viewport.
- Targeted web lint and Git whitespace checks passed.
- The API/worker container image built successfully. Local API, worker and both
  Strix bridges were recreated; all existing Preflyt application services reported
  healthy. Both additive email migrations were applied locally and Prisma generated.
- A real user verification request had zero delivery attempts on the old worker.
  After the worker update, the existing queued request was accepted by SMTP on its
  first attempt and recorded as SENT. No new unsolicited request was generated.

## Limits and deployment

SMTP acceptance does not prove inbox delivery. SMTP cannot guarantee exactly-once
email: a crash after acceptance but before recording SENT can cause a duplicate
with the same Message-ID. A message already in flight cannot be recalled.

The host development web server reads current source. The Compose web image was
not rebuilt in this audit. Before deploying this batch elsewhere, apply both email
migrations and deploy matching API, worker and web versions with the same encryption
key. No remote push, pull request, merge or GitHub workflow was performed for this
batch. Full-suite and production deployment qualification were outside this audit.
