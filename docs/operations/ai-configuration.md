# Organization AI configuration

## Current delivery

Owner/Admin users can open **AI Intelligence → Connections / Model routing**. The API supports multiple organization-scoped provider connections, encrypted write-only keys, metadata-only connection tests, optimistic revisions and stage-specific primary/fallback routing. Auditors can read configuration through the API; developers cannot change provider keys or routes.

This increment **does not run inference**. `executionAvailable` is false. Daily budgets and token limits are saved configuration; spending reservations/enforcement, usage telemetry, cancellation, read-only intelligence jobs, validated evidence references, multi-skill review and optional PR feedback remain to be implemented. Saving a route never changes a deterministic gate or sends repository code.

## Deployment defaults

Apply the additive Prisma migrations and regenerate the client. Preserve a protected database backup first. Set:

- `AI_CONFIGURATION_ENABLED=false` by default. Turn on only to expose connection setup.
- `AI_PROVIDER_ENCRYPTION_KEY`: a separate persistent base64-encoded 32-byte key (`openssl rand -base64 32`). Store it in your deployment secret manager. Do not reuse the GitHub token key, commit it or replace it casually: existing keys cannot be decrypted after replacement. Retain it with protected backups.
- `AI_APPROVED_ENDPOINTS`: an explicit JSON array of operator-reviewed OpenAI-compatible endpoints. No provider is included implicitly.

Example (contains no secret):

```json
[{"id":"internal-gateway","name":"Internal gateway","baseUrl":"http://litellm:4000/v1","locality":"local","requiresKey":true,"models":["approved-model"]}]
```

Hosted endpoints require HTTPS. Local HTTP is allowed only through an explicit reviewed definition. Base URLs exclude `/models`, credentials, query parameters and fragments. A test sends only a GET to `/models` with the configured authorization header; it rejects redirects and bounds response size/time. Do not configure untrusted endpoints. Enforce reviewed destinations with deployment network/egress controls in production; the current configuration allowlist is not a network firewall. LiteLLM container deployment and inference transport remain a later part of P4.

## Key and routing behavior

Keys are AES-256-GCM encrypted and bound to organization, connection identity and endpoint transport definition. They are never returned in API responses or audit metadata. Replacing an endpoint's address, locality or key requirement invalidates the credential binding, even if its ID remains unchanged; enter a new key before testing. Model inventory changes require a new connection test. Edits reset test readiness. Connection tests are limited to 12 per organization per ten-minute window.

A route can be configured separately for local development, repository, pull requests, QA, performance and production. Connections, routes and source sharing start disabled. Enabling a route requires its selected primary and optional fallback connections to be enabled and tested against the current model/endpoint/revision within 24 hours. A routing preview rechecks freshness and can select a ready fallback. It reports unavailable/source-sharing/token-limit states without generating a model request. Source-sharing permission does not authorize a future request to include credentials or unrelated repositories.

All reads and writes are checked against current organization membership. Mutations validate origin and reject unknown fields. Concurrent edits cannot overwrite a newer revision. Configuration and test audits exclude keys/upstream error bodies. Organization foreign keys use `RESTRICT`, preserving connections/routes if someone attempts to delete their organization.

## Verification and rollback

Unit and disposable-database API tests cover authenticated encryption, endpoint changes, organization isolation, RBAC, CSRF, stale/concurrent edits, revoked access, provider failures, throttling, routing defaults and freshness. Tests create a local UUID database before any writes and drop only that database; they never truncate the application database. Chromium tests cover page access, separate tabs, failure states and default-off forms. No real provider credentials or repository source are sent during these tests.

Rollback: disable `AI_CONFIGURATION_ENABLED` and retain tables, audits and encryption secrets. Do not drop organization/application tables, reset the database or rotate the encryption key to roll back the UI. P4 is not complete until evidence-linked inference, enforced budgets/cancellation and negative gate-independence acceptance pass.
