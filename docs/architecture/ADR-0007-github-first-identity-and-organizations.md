# ADR-0007: GitHub-first login and organization onboarding

**Status:** Accepted; GitHub login, owner onboarding and username grants implemented behind a deployment flag. Explicit proof-based legacy identity linking, owner recovery and bounded provider synchronization are implemented; clean deployment and release acceptance remain required.
**Date:** 2026-10-09
**Decision owner:** Product / Engineering
**Supersedes:** ADR-0003's OIDC-only routine login, manual member provisioning and first-owner onboarding for GitHub-connected workspaces. Existing OIDC deployments remain supported during migration; session security and separate local Super Admin recovery remain required.
**Related:** [PRD](../PRD.md), [RBAC](../product/rbac-and-authorization.md), [MVP experience](../product/mvp-product-experience.md), [delivery plan](../roadmap/incremental-delivery.md).

## Context

Preflyt's initial users already work in GitHub organizations. The current application requires a separately configured OIDC provider, manually created Preflyt organizations and user IDs copied from that provider. This creates unnecessary onboarding work.

GitHub login, verified organization-owner onboarding, username-based access grants and repository authorization evidence are implemented behind `GITHUB_LOGIN_ENABLED`. The Access Control UI separates People, GitHub members, Roles & permissions and Activity. Organization roles are predefined and enforced by the API. Existing OIDC and local Super Admin sign-in remain supported.

The current slice requires an existing organization installation and expiring user tokens. Sessions are capped at eight hours and the user-token expiry; expiring tokens refresh while the absolute Preflyt session remains valid; expired refresh grants require sign-in again. Token refresh uses a database row lock to consume each rotating token once across API/worker instances. Signed `github_app_authorization` revocation deletes provider credentials, pending challenges and authorization evidence while preserving local sessions and historical identity records. Bounded periodic reconciliation refreshes expired authorization evidence without extending Preflyt sessions. Signed organization/team/member relationship events invalidate cached provider access and mark imported teams stale; fresh bounded reconciliation rechecks authority rather than trusting event payloads. Owner recovery claims require explicit selection, fresh verified GitHub organization-owner proof and no active Preflyt Owner. Legacy identity linking requires recent proof of both accounts and an explicit access preview. Authorization evidence expires after five minutes, with fresh checks for privileged changes. Existing installation callbacks cannot create login sessions or move installations across organizations.

## Decision

Use **Continue with GitHub** as the primary routine login for GitHub-connected workspaces. Create the matching Preflyt workspace from a verified GitHub organization installation. Admins add existing GitHub organization members by selecting them from a searchable directory or entering their GitHub username, then assign a Preflyt role and repository access. No separate organization creation or OIDC subject entry is required for this flow.

GitHub identifies the account and organization membership. Preflyt determines what that person may do inside Preflyt. Installing the App, authorizing GitHub login or appearing in contributor activity does not by itself grant access.

## Login and session contract

- Use the GitHub App's user authorization flow, with a server-owned, expiring, single-use transaction, browser-bound state, S256 PKCE, registered callback and an allowlisted local return path. Keep login and installation setup transactions distinct; a setup callback cannot create a user session without completing login verification.
- Exchange the authorization code on the API and fetch the authenticated GitHub account using the resulting user token. Never accept a browser-supplied username, account ID or organization ID as identity proof.
- Identify accounts by **GitHub host + numeric user ID**. Usernames, display names and avatars are display data and can change. Identify organizations by **GitHub host + numeric organization ID**; renames do not create new workspaces. GitHub.com is the initial supported host; Enterprise Server support needs an explicitly configured host and separate verification.
- New-workspace onboarding may use a short-lived restricted transaction to verify the account and installation before a Preflyt grant exists. It grants no workspace data or management access; only the verified first-owner claim can create the initial grant.
- Before issuing an organization session, verify an active supported installation, active GitHub membership, an active Preflyt access grant and the user's repository access. A verified account with no grant sees “Your administrator has not granted you access yet.” It receives no organization data access.
- Preserve opaque server-managed sessions, hashed session tokens in PostgreSQL, secure HttpOnly/SameSite cookies, CSRF/origin checks, login rate limits and restart persistence. Routine sessions retain the existing eight-hour absolute expiry; Super Admin retains 24 hours. Provider token refresh does not extend a Preflyt session.
- Enable expiring GitHub user tokens. Store only the user/refresh tokens needed for ongoing access checks, encrypted server-side with bounded retention and refresh locking. Never put them in browser storage, URLs, logs, prompts, jobs or repository execution environments. Remove retained credentials on disconnect or revocation; expired or revoked credentials require reauthorization.
- Call this **GitHub login**, not OIDC or SAML login. For organizations using GitHub SAML SSO, explain GitHub's authorization requirements and link to the provider's guidance rather than bypassing them.

GitHub documents the user authorization flow, PKCE and user tokens in [Generating a user access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app). App user tokens are bounded by both user access and App permissions: [Authenticating on behalf of a user](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user).

## Organizations and first Owner

1. A user signs in with GitHub and starts connecting an organization, or follows the App installation setup flow and completes GitHub login.
2. The API verifies the installation belongs to the configured App and its account is a GitHub **Organization**. A personal-account installation is not an organization workspace in this release.
3. For a new workspace, verify the signed-in account is an active GitHub organization owner (membership role `admin`). Installation access or permission to install an App alone is insufficient. A non-owner installer must ask an organization owner to complete onboarding.
4. Atomically create the internal workspace, link the stable GitHub organization/installation IDs and grant that verified owner the initial Preflyt Owner role. Duplicate/concurrent callbacks cannot create duplicate workspaces or extra owners. A later installation callback cannot claim or reassign an existing workspace.
5. The Owner selects repositories and grants other members Preflyt access. The organization switcher shows only connected organizations the user is authorized to enter.

Internal organization records remain necessary for settings, policies, memberships and audit history. Their provider identity comes from GitHub. The normal GitHub flow removes the standalone “Create organization” form; it does not delete tenant boundaries. Multiple organizations remain isolated, even when installed under the same App. Existing deployments can retain their current organization context until explicitly migrated.

Only a verified initial owner gets automatic bootstrap access. Other GitHub owners/members are not silently assigned Preflyt roles. A missing active Preflyt Owner after GitHub revocation blocks privileged changes; a verified GitHub organization owner can complete an explicit, audited recovery claim. Local Super Admin can assist recovery but has no implicit customer source access.

## Member selection and permissions

- The Access Control directory lists active members of the connected GitHub organization, with username/avatar, current Preflyt role, assigned repositories and access state. Search and pagination are backed by authorized provider data; partial or unavailable membership data must be visible.
- Username entry resolves the current GitHub account ID and verifies active membership before saving an access grant. Pending GitHub invitations, non-members, bots and outside collaborators are not eligible in the initial flow. A pending Preflyt grant may exist before first login, but it belongs to the verified stable account ID and must be checked again at login.
- “Grant access” means access to **Preflyt**. It does not create GitHub organization invitations, change GitHub membership, send GitHub messages or automatically send email. An admin may share the normal sign-in URL. Outbound invitation notifications are deferred until explicitly designed.
- Retain existing Preflyt roles and independent policy approval. Owners/Admins manage members within their workspace; only Preflyt Owners assign/change Owner or Admin roles. Users cannot grant themselves additional access. Policy definition approval requires another publisher, except an active local Super Admin may approve its own definition with an explicit audited approval marker; organization/repository permissions still apply. Exception and enforcement-bypass approval rules are unchanged.
- A user's repository visibility and actions require the intersection of **their GitHub repository access**, **the installed/selected repository scope**, and **Preflyt permissions/grants**. Organization-wide Preflyt Owner/Admin roles do not expose private repositories the user cannot access in GitHub. Installation tokens used by workers cannot bypass this boundary in user-facing reads, summaries, downloads or writes.
- Grant management, login denials, owner claims, organization links, permission changes and provider revocation are audited using stable identities, without secrets. Preserve historical actors on assessments and approvals when identities are linked.

Add **Organization Members: Read-only** to the ordinary GitHub App to list/check membership. No Members write permission is needed because Preflyt is not inviting people into GitHub. Repo access discovery uses the authenticated user's accessible installation repositories. The separate privileged governance App for organization ruleset management remains separate; this decision does not add Administration write to the ordinary App.

See GitHub's [organization membership API](https://docs.github.com/en/rest/orgs/members) and [App installation APIs](https://docs.github.com/en/rest/apps/installations).

## Revocation, caching and rate limits

- Verify membership and installation/user repository access freshly at login, owner claim and access grant. Keep local grant checks on every API request; local revocations apply to the next request, including cached reads.
- Use verified membership, repository-access, installation and user-authorization webhook events to invalidate affected authorization caches and grants/sessions. Reject forged or replayed events. Suspension/uninstall disables access to the affected organization; removing one organization membership does not revoke unrelated organization access.
- Reconcile periodically because webhooks may be delayed or missed. Set a maximum **five-minute** age for GitHub membership/repository authorization evidence. Recheck expired evidence before allowing access. Apply fresh provider checks for privileged role changes, policy publication/enforcement and recovery claims.
- Provider outages/rate limits never turn unknown membership into authorization. When required evidence is expired or unavailable, deny organization data/actions with a retryable verification message; preserve the session so a temporary outage does not force repeated login. Do not remove historical membership records just because a fetch failed.
- Read the directory and ordinary pages from PostgreSQL/Redis-backed synchronized data within the authorization freshness limit. Reuse the GitHub request limiter, bounded pagination, deduplicated refresh, webhook invalidation and backoff. Do not query GitHub on every page render or store authorization caches by username alone.

## Migration and compatibility

Existing deployments keep their authentication and organization records until explicitly migrated. Enabling GitHub login does not automatically link existing organizations or identities.

1. Add provider account/organization links and encrypted token storage through additive migrations. Preserve existing organization IDs, grants, sessions, audit actors, installations and repository ownership.
2. Enable GitHub login behind an explicit deployment feature setting. Keep the existing OIDC flow operational during the migration; enabling GitHub login must not require an OIDC provider on a new GitHub-only deployment.
3. Link a legacy organization only after verifying its connected GitHub organization and an authorized existing Preflyt Owner plus the GitHub owner. Ambiguous/multiple organization links require explicit selection and review. Never move installations or private evidence across tenants automatically.
4. Link an OIDC identity to a GitHub account only after proving both accounts through recent authenticated flows. Matching email, username or contributor activity is insufficient. Review imported grants against GitHub access, preserving historical attribution and approval separation.
5. Switch the normal UI to GitHub login/member selection only after migration acceptance passes. Keep OIDC as an explicitly configured compatibility/enterprise option; the local Super Admin route remains separate. No automatic fallback or identity merging.
6. Rollback may disable the new login UI, but must retain provider-linked data and enforce any provider revocations already recorded. It must not restore revoked or wider access through older authorization code.

The API supports GitHub-only startup with valid enabled GitHub configuration, OIDC compatibility and separate Super Admin recovery. Partially configured enabled providers fail closed. Disable the login flag to hide new GitHub sign-in; retain provider-linked data and authorization checks for existing accounts.

## Implementation order and acceptance

Implement within the existing foundational access-control scope; no new product phase is introduced.

1. Add provider identity/organization links, safe migration and scoped authorization evidence.
2. Implement verified GitHub login, organization onboarding and atomic first-owner claim.
3. Ship searchable GitHub member selection, username-based grants and repository permission checks.
4. Add revocation events, reconciliation, cache freshness and operational diagnostics.
5. Complete the end-to-end migration, security and rollback checks before enabling by default.

Required acceptance:

- [ ] A verified organization owner connects the App and gets one matching workspace without manually creating an organization; members cannot self-bootstrap or claim existing tenants.
- [ ] Admin selects an active member or enters a username, assigns a scoped role, and the matching GitHub account logs in. Unassigned/non-member/pending/bot/outside-collaborator accounts are denied.
- [ ] Username/organization renames retain identity; reused usernames cannot inherit another account's grants.
- [ ] Invalid state/PKCE, expired/replayed transactions, mismatched App/installation and untrusted return paths are rejected; setup callbacks alone cannot authenticate users.
- [ ] Cross-organization access and private-repository access outside the user's GitHub rights are denied, including cached dashboard/contributor/assessment responses.
- [ ] Local grant removal applies on the next request; verified provider revocation invalidates affected access, and missed events are caught within the five-minute freshness window.
- [ ] Expired provider authorization evidence fails closed during outages/rate limits without discarding a valid Preflyt session or exposing stale private data.
- [ ] No App token/private key becomes a user session; user/refresh tokens remain encrypted server-side; refresh concurrency and revocation are tested.
- [ ] Existing OIDC users, audit actors and evidence migrate without email-based linking, privilege escalation or loss of independent approval. Rollback never restores revoked access.
- [ ] Super Admin recovery remains separate with its 24-hour session; ordinary GitHub sessions preserve restart persistence and their eight-hour expiry.

## Deferred

GitHub organization invitations, automated email delivery, outside-collaborator access, team-to-role mapping, personal-account workspaces, GitHub Enterprise Server, and GitLab login/org onboarding. Existing OIDC compatibility is preserved; broader identity-provider policy requires its own review.

The GitHub members tab loads the active organization member directory, supports search and pagination, and provides **Sync members** and **Assign role** actions. Directory snapshots are cached for up to five minutes in Redis with a bounded local fallback; sync does not create identities or grant access. Assignment verifies active membership again before saving.

For a workspace that already has the GitHub App connected, use **Access Control → GitHub members → Link GitHub organization**. GitHub sign-in must be enabled and its callback registered first. The flow binds the request to the original authenticated workspace Owner session and verifies a GitHub organization owner before confirmation. It reuses the same internal organization and installation, preserves repositories, policies, grants and history, and grants that verified GitHub owner access with an audit record. It never moves an installation between workspaces or merges existing identities automatically.


## Legacy sign-in linking and owner recovery (2026-10-10)

An existing OIDC user starts **Settings → Workspace → GitHub sign-in** within five minutes of signing in. GitHub OAuth is bound to that original browser session. Confirmation rechecks the stable provider user ID, fresh session, exact access preview and single-use challenge in a serializable transaction. Local Super Admin accounts stay separate; matching email, name or contributor activity never links accounts.

The existing OIDC identity retains its approved workspace roles and repository grants. The GitHub-only identity's grants are deactivated rather than combined; its sessions are revoked, while identity, approval and audit records remain intact. Linking cannot remove a workspace's last Owner. A proof-linked pair counts as one person for policy and ruleset approval, including an approval recorded before the link. No transitive or multiple-account linking is supported.

When a linked workspace has no active Preflyt Owner, GitHub organization selection offers **Recover workspace ownership**. Ordinary sign-in never claims ownership implicitly. Recovery freshly verifies GitHub organization ownership, serializes with onboarding and requires the workspace still to have no active Owner. It grants only that verified identity and records a recovery audit event. Existing Owners cannot be replaced through recovery. Unlinked legacy workspaces retain the existing explicit workspace-link and separate Super Admin recovery flow.

Migration `20261010133000_explicit_identity_link` is additive. Rollback can disable new linking while retaining proof links and the same-person approval checks; deploying old approval code that ignores links would weaken separation and is not a safe rollback.
