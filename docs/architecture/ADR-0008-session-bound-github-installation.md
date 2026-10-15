# ADR-0008: Separate admin installation from GitHub sign-in

Status: Accepted direction, 2026-10-15. Implementation is local and unverified.

## Decision

For deployment setup, the authenticated admin registers or configures the App,
installs it and selects repositories once in GitHub. An OAuth round trip verifies
organization ownership without replacing the original Preflyt identity or session.
After verification, the connection imports the installation selection, activates
the matching workspace on the original session and opens Repositories.

This revises the deployment-admin path in ADR-0007. Ordinary GitHub sign-in,
explicit legacy identity linking, member grants and existing workspace migration
remain distinct operations. Installation is not an identity-linking operation.

## Boundaries

- A persistent, expiring one-time transaction binds both callbacks to the original
  browser, exact active session, actor, configured App and workspace scope. OAuth
  uses PKCE. Verification credentials are revoked and never saved as login tokens.
- Fresh GitHub verification must prove the configured App installation, stable
  organization ID, organization ownership and access to all imported repositories.
- Only a current deployment Super Admin without a workspace can create the first
  workspace. Existing workspaces require an active Owner or Admin membership.
  GitHub ownership alone cannot claim an existing Preflyt workspace. Installations,
  repositories and identities are never moved or merged automatically.
- Import, one-time transaction consumption, membership creation, original-session
  workspace selection and audit recording commit atomically at serializable
  isolation. Verification races or conflicting connections fail closed.
- New admin connections follow the GitHub installation selection. New repository
  grants are imported on sync; explicit Preflyt exclusions survive reconnects.
  Existing installations keep explicit selection until authorized reconnect.
- Connecting imports repository scope. Assessments remain separate user actions;
  connection does not execute repository code or activate policies/merge rules.

## Delivery

The additive migration introduces connection transactions and an installation
tracking mode. Existing setup and sign-in callbacks remain supported. The new
flow reuses the registered installation/OAuth callback URLs with distinct state
and browser cookies. Migration application, automated tests and live GitHub
acceptance remain pending at the user's request to stop tests and keep changes local.
