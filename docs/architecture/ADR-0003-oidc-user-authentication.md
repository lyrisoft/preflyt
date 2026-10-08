# ADR-0003: OIDC user authentication for self-hosted Preflyt

**Status:** Accepted for MVP planning; implementation pending  
**Date:** 2026-10-08  
**Decision owner:** Product / Engineering  
**Related:** [Product Requirements](../PRD.md), [TypeScript-first architecture](ADR-0001-typescript-first-stack.md)

## Context

The PRD left the first-deployment human authentication mechanism unresolved. Preflyt's MVP is a self-hosted, single-organization installation with Owner, Admin, Developer and Viewer roles. Repository authorization already uses a separate GitHub App installation. Human identity and SCM integration identity must remain distinct.

## Decision

Use the installation's configured OpenID Connect (OIDC) provider for all routine human sign-in in MVP. Do not add a standing local-password login or use GitHub App credentials as user credentials.

### Sign-in and session flow

1. An operator configures one OIDC issuer for the installation and stores the client secret through deployment-managed secrets.
2. The web application starts the Authorization Code flow with PKCE. Preflyt binds the authorization transaction to the browser and validates transaction state/nonce and the ID-token signature, issuer, audience and expiry before accepting the identity.
3. The NestJS API identifies a user by the exact issuer + subject pair and requires an active Preflyt membership. A valid OIDC identity alone does not confer organization access or a role.
4. The API issues an opaque, server-managed session in a `Secure`, `HttpOnly`, `SameSite` cookie. Browser code never stores ID/access/refresh tokens in local storage. Logout revokes the server session.
5. Preflyt roles and membership are local authorization state: Owner, Admin, Developer, Viewer. IdP group/role claims do not silently grant or elevate Preflyt privileges in MVP.

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
- Fail closed if issuer metadata or signing keys cannot be safely validated. Do not silently fall back to local passwords or another provider.
- Separate identity authentication from Preflyt membership, authorization, repository selection and GitHub App permissions.

## Acceptance criteria

- [ ] A valid provisioned OIDC user can sign in and receives only the local Preflyt role assigned by an authorized Owner/Admin.
- [ ] Invalid issuer/signature/audience/expiry/state/nonce, replayed transactions and unprovisioned users are denied and audited.
- [ ] Browser storage, URLs, application logs and sandbox environments contain no OIDC client secret or identity/access/refresh token.
- [ ] Session cookie flags, CSRF defense, logout revocation, suspension/role-change invalidation and rate limits are verified.
- [ ] The first Owner can be created only with a valid out-of-band, expiring, single-use token while no Owner exists; successful use consumes it and permanently disables bootstrap.
- [ ] GitHub login cannot authenticate a Preflyt user, and GitHub App credentials cannot be used as an interactive user session.
- [ ] IdP outage/misconfiguration blocks new sign-ins clearly and never falls back to local-password authentication. Documented administrator recovery is required before beta.

## Deferred

- SAML, multiple identity providers per installation, SCIM, automatic IdP group-to-role mapping, and local-password login.
- The operator recovery procedure after loss or misconfiguration of the configured IdP; define and security-review it before beta.
