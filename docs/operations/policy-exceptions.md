# Reviewed policy exceptions

Organization users with `policy.exception.request` can request a temporary exception from **Policies → published policy → Policy exceptions**. Choose a saved commit, the required checks needing an exception, a reason and an expiry. The default is 24 hours; requests are limited to seven days and ten checks. At least one required execution check must remain without an exception.

Owners, Admins and Policy Managers can approve or reject another person's request with `policy.exception.approve`. Developers, Engineering Leads and Security Engineers can request exceptions within their current repository grants. A requester can withdraw or revoke their own exception; authorized approvers can revoke others' exceptions. Viewers and Auditors retain scoped read-only access. Local Super Admin sessions do not bypass these permissions or independent review. Explicitly linked historical identity IDs count as one person.

An approval binds the organization, repository, published policy hash, branch, full commit SHA, check IDs, reason, requester and expiry. A changed policy, standard selection, inherited team source or commit needs another review. The approval does not edit the policy or original assessment, grant repository access, remove a repository from a team's scope, or authorize AI to waive checks.

## Merge review behavior

Exceptions can authorize an allowed result only while automatic check publication is enabled for the deployment and repository, so an expiring result has an automatic refresh owner. Manual publication with automatic refresh disabled retains the original BLOCK/INCOMPLETE result. Every publication plan rechecks the requester and approver's current role, repository grant and provider access. Missing authority or expired/revoked approval cannot authorize an allowed result. Each excepted check retains its original outcome and reasons; the evaluation identifies the reviewed exception and digest. A qualified result is `PASS_WITH_EXCEPTION`, displayed as **Allowed with exception**, rather than a verified passing check. At least one other required execution check must independently pass. Failed or missing checks without an applicable exception retain BLOCK/INCOMPLETE. Advisory warnings retain their existing behavior.

The normal publisher re-evaluates checks at least once per minute. It stops issuing allowed exception results in the final minute before expiry, and schedules its next evaluation for that cutoff when earlier than the normal refresh. Revocation wakes matching PR tasks immediately. The worker records expiry with a durable, deduplicated event. GitHub check results do not have a native TTL: keep the worker healthy, and monitor its heartbeat and publication failures. A worker/provider outage can delay updating an already published GitHub result; Preflyt never treats a stale approval as valid in a new evaluation.

## Notifications and audit

Request, approval, rejection, revocation and expiry write audit and notification outbox records in the same database transaction. Current Owners/Admins/Policy Managers and the scoped requester receive in-app governance notices, even when optional assessment notifications are muted. Emails use the existing opt-in organization/personal delivery settings and link-only template. Recipient access is checked again before reads and delivery. Notifications link to repository policies.

## Deployment

Run the additive `20261010150000_reviewed_policy_exceptions` migration with the migration image before upgrading API and worker. It creates one table and indexes, preserves existing rows and prevents deleting referenced policy/repository/organization history. Save and verify a protected database backup before applying migrations. The API and worker must run the same release; the worker directly provisions the exception service and uses the existing database-backed publication and notification machinery.

Validation uses randomly named disposable databases with all migrations applied. Application databases and volumes are never reset by acceptance tests. Local verification does not constitute production deployment acceptance.
