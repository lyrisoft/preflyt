# ADR-0003: OIDC user authentication for self-hosted Preflyt

**Status:** Accepted; initial API and web authentication slice implemented, full acceptance criteria pending
**Date:** 2026-10-08  
**Decision owner:** Product / Engineering  
**Related:** [Product Requirements](../PRD.md), [TypeScript-first architecture](ADR-0001-typescript-first-stack.md)

## Context

The PRD left the first-deployment human authentication mechanism unresolved. Preflyt's MVP is a self-hosted, single-organization installation with Owner, Admin, Developer and Viewer roles. Repository authorization already uses a separate GitHub App installation. Human identity and SCM integration identity must remain distinct.

## Decision

Use the installation's configured OpenID Connect (OIDC) provider for routine human sign-in in MVP. Permit one deployment-configured local **Super Admin** credential as a separate break-glass path. This is not a general local-password system, an OIDC fallback for regular users, or a GitHub login.

### Sign-in and session flow

1. An operator configures one OIDC issuer for the installation and stores the client secret through deployment-managed secrets.
2. The web application starts the Authorization Code flow with PKCE. Preflyt binds the authorization transaction to the browser and validates transaction state/nonce and the ID-token signature, issuer, audience and expiry before accepting the identity.
3. The NestJS API identifies a user by the exact issuer + subject pair and requires an active Preflyt membership. A valid OIDC identity alone does not confer organization access or a role.
4. The API issues an opaque, server-managed session in a `Secure`, `HttpOnly`, `SameSite` cookie. Browser code never stores ID/access/refresh tokens in local storage. Logout revokes the server session.
5. Preflyt roles and membership are local authorization state: Owner, Admin, Developer, Viewer. IdP group/role claims do not silently grant or elevate Preflyt privileges in MVP.

### Local Super Admin break-glass access

- The local Super Admin uses a distinct `/super-admin/login` page and `/auth/super-admin/login` API endpoint; ordinary `/sign-in` remains organization OIDC.
- The operator configures exactly one username (1–320 non-whitespace characters) and password through deployment-managed `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD` settings. On startup, Preflyt seeds the reserved local identity, `SUPER_ADMIN` membership and a salted scrypt password hash; the raw password is never stored in the database or returned to the browser. There is no self-registration, reset flow or user-selectable role.
- Super Admin receives the same server-managed session cookie with a one-hour expiry and passes Owner/Admin authorization checks. Removing the environment settings disables the credential and revokes its sessions at startup.
- Passwords must be 24–128 characters. Use scrypt with N=32768, r=8, p=1 and a random salt. Rate-limit attempts by both source IP and normalized username, compare derived hashes in constant time, return generic credential errors and audit allowed/denied attempts.
- When all OIDC settings are absent and a Super Admin username/password are configured, the API starts in Super Admin-only mode. Organization OIDC sign-in and first-owner bootstrap return unavailable until OIDC is configured. Partial OIDC configuration is rejected, and fully configured OIDC must pass normal discovery and issuer validation at startup.
- Local credentials never become an automatic fallback for organization users. To recover from an IdP outage that prevents startup, an operator must explicitly remove all OIDC settings, retain the Super Admin settings, restart Preflyt, and restore valid OIDC settings before enabling routine user sign-in.

### Initial owner bootstrap and membership

- The operator supplies an out-of-band, short-lived, single-use bootstrap token to establish the first Owner. The token is secret, compared safely, audited without logging its value, consumed atomically, and invalidated after successful bootstrap or expiry.
- Bootstrap is available only while no Owner exists. It cannot be reused or act as a later login or recovery bypass; bootstrap is closed after first-owner creation.
- Further users must be explicitly invited or provisioned by an authorized Owner/Admin. Preflyt then links the accepted OIDC issuer + subject to that membership. Email/domain matching alone never grants access.
- Authentication and membership actions, including successful/failed login, logout, bootstrap, invitation, provisioning, role change, suspension and session revocation, are audited without persisting provider tokens.

### GitHub identity boundary

The GitHub App installation is solely for repository integration and receives only the selected repository scope and provider permissions required for the configured workflow. Connecting GitHub does not sign a person in to Preflyt. Human OIDC sessions authorize user actions; the server-side GitHub App integration authorizes repository API calls. The two credentials and audit actors remain separate.

## Security requirements

- Use the OIDC Authorization Code flow with PKCE (S256) and transaction-specific state/nonce, following the [OAuth 2.0 Security Best Current Practice (RFC 9700)](https://www.rfc-editor.org/rfc/rfc9700.html) and [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html); reject issuer mismatch, invalid signature, audience, expiry, nonce, redirect URI and replay cases.
- Keep OIDC client credentials server-side in the configured secret provider; do not expose tokens/secrets to the browser, sandbox jobs, prompts, or standard logs.
- Protect cookie-authenticated state-changing requests against CSRF, enforce TLS in deployment, rotate/revoke sessions on logout, suspension and role changes, and rate-limit sign-in and bootstrap endpoints.
- Restrict the configured issuer to a valid HTTPS issuer administrator-set out of band. Do not accept arbitrary issuers or user-controlled discovery URLs on login requests.
- Fail closed if issuer metadata or signing keys cannot be safely validated. Do not silently fall back to local credentials for regular users; the separate Super Admin endpoint is the only local-password path.
- Separate identity authentication from Preflyt membership, authorization, repository selection and GitHub App permissions.

## Acceptance criteria

The initial implementation covers OIDC Authorization Code + PKCE, signature/issuer/audience/nonce validation, first-Owner bootstrap, hashed server-side sessions, and denial of unprovisioned identities. Remaining criteria below still require implementation or broader verification before this ADR's MVP requirements are complete.

- [ ] A valid provisioned OIDC user can sign in and receives only the local Preflyt role assigned by an authorized Owner/Admin.
- [ ] Invalid issuer/signature/audience/expiry/state/nonce, replayed transactions and unprovisioned users are denied and audited.
- [ ] Browser storage, URLs, application logs and sandbox environments contain no OIDC client secret or identity/access/refresh token.
- [ ] Session cookie flags, CSRF defense, logout revocation, suspension/role-change invalidation and rate limits are verified.
- [ ] The first Owner can be created only with a valid out-of-band, expiring, single-use token while no Owner exists; successful use consumes it and permanently disables bootstrap.
- [ ] GitHub login cannot authenticate a Preflyt user, and GitHub App credentials cannot be used as an interactive user session.
- [ ] The configured Super Admin can authenticate only through the separate local route; invalid attempts are rate-limited, audited, and do not reveal whether the username exists.
- [ ] Super Admin credentials are seeded from deployment-managed settings, only the scrypt password hash is stored in the database, and login produces a one-hour hashed server-side session.
- [ ] IdP outage/misconfiguration never falls back to local credentials for regular users. Super Admin-only mode is enabled only when all OIDC settings are explicitly absent and the deployment has configured the local account.
- [ ] Partial OIDC configuration and failed discovery remain fail-closed. Organization sign-in and owner bootstrap remain unavailable in Super Admin-only mode.

## Deferred

- SAML, multiple identity providers per installation, SCIM, automatic IdP group-to-role mapping, and local-password login for organization members.
- Automated detection and recovery from IdP outages; recovery requires an operator to explicitly select Super Admin-only mode by removing all OIDC settings.
