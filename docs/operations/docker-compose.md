# Self-hosted Docker Compose deployment

This packages the current Preflyt UI, authentication, GitHub onboarding and repository profiles, webhook ingestion, a queue worker, separate cache/queue services, and vendor-neutral OpenTelemetry. It does not add repository execution, scanners, agents or Kubernetes deployment. The frontend theme is unchanged.

## Configuration and first start

Requirements: Docker Engine/Desktop with Compose v2 or later; Node 24 for the optional HTTP smoke utility. Commands run from the repository root. Use a dedicated deployment checkout and retain the same Compose project name on every upgrade; the default is `preflyt`.

```sh
cp .env.example .env
chmod 600 .env
```

Set `POSTGRES_PASSWORD` and `DATABASE_APP_PASSWORD` to distinct random hexadecimal values (for example, generate each with `openssl rand -hex 24`). Hexadecimal avoids URL-encoding errors in database connection strings. Set `PREFLYT_IMAGE_REGISTRY=preflyt-local` for source builds. Published images use `ghcr.io/lyrisoft` and `PREFLYT_VERSION=sha-<full-commit-sha>`; the publishing workflow creates API, migration and web images together on a release tag or manual dispatch. No public image release is claimed until that workflow has succeeded and package access is configured. Set `WEB_ORIGIN` to the public origin without a trailing slash or path, and set `PREFLYT_VERSION` to the exact source commit/release being built. Keep this file outside version control; the Docker build context excludes dotenv files, keys, generated clients, build output and backups.

Choose authentication:

- **Super Admin only:** configure `SUPER_ADMIN_USERNAME` and a unique 24–128 character `SUPER_ADMIN_PASSWORD`; leave all four OIDC fields empty. The API seeds the recovery identity at startup. Sign in at `/super-admin/login`.
- **Organization SSO:** configure all four OIDC fields, with `OIDC_REDIRECT_URI=<WEB_ORIGIN>/api/auth/callback`, and the SHA-256 `BOOTSTRAP_TOKEN_SHA256` for your out-of-band first-Owner token. Partial OIDC configuration or failed discovery blocks startup. A recovery Super Admin can also be configured.

To enable GitHub, configure the App ID, client ID/secret and PEM private key. The App Setup URL is `<WEB_ORIGIN>/api/github/setup/callback`; its OAuth callback is `<WEB_ORIGIN>/api/github/oauth/callback`. Leave GitHub's “Request user authorization during installation” disabled as described in the [README](../../README.md#development-status). The API's callback environment is derived from `WEB_ORIGIN` in Compose. Multiline PEM may be provided as single-quoted text with literal `\n` escapes. No API/GitHub/SSO secrets are baked into the web image.

For production, place your host's HTTPS reverse proxy in front of `127.0.0.1:8080` (or `PREFLYT_HTTP_PORT`), forwarding the entire public origin. Only this loopback web port is published; the API and database have no host ports. Production forces secure cookies and requires HTTPS OIDC endpoints/callbacks. The stack does not install a TLS certificate or reverse proxy for your domain. The nginx web service serves the SPA and forwards `/api/` to the API on the same origin; its access logs omit query strings that may contain OAuth codes or setup state.

For a source checkout, build once before startup:

```sh
docker compose --env-file .env build
docker compose --env-file .env up -d --wait --wait-timeout 180
docker compose --env-file .env ps
node --env-file=.env scripts/deploy/smoke.mjs
```

For an available published release, set its registry/version in root `.env`, then run `docker compose pull` followed by `docker compose up -d --wait --wait-timeout 180`. With images already available, `docker compose up -d` starts every service required by the current release. No host Node.js, pnpm, PostgreSQL or Redis is required; the Node smoke utility is optional. The default root dotenv location is picked up by Compose automatically; the explicit `--env-file .env` below is equivalent.

For a local demonstration only, set `WEB_ORIGIN=http://localhost:8080`, keep OIDC fields empty and configure Super Admin credentials. Use the explicit override:

```sh
docker compose --env-file .env -f compose.yaml -f compose.local.yaml up -d --build --wait --wait-timeout 180
```

Open `http://localhost:8080/super-admin/login`. This override uses development cookie settings and still binds only to loopback; do not use it for an external deployment. Do not restart the standalone `pnpm dev:api` process for a Compose deployment.

## Startup and persistence

PostgreSQL health gates the one-time migration service; successful `prisma migrate deploy` gates API startup; API readiness gates web startup. The worker starts by default after migration and queue readiness; webhook acceptance remains opt-in through `GITHUB_EVENTS_ENABLED=true` and a configured signing secret. A migration error prevents the new API/web from starting. API/web/migration run as non-root users with read-only filesystems, a temporary `/tmp`, dropped capabilities and no-new-privileges. The runtime API database role has CRUD access without superuser, role creation or database creation privileges; owner credentials are limited to PostgreSQL and migrations. PostgreSQL's private network is internal; the API has a separate egress network for GitHub/OIDC.

The bundled `cache` uses a 128 MB `allkeys-lru` eviction policy with no persistence. The separate `queue` uses a 256 MB `noeviction` policy and AOF persistence (`everysec`) in `queue_data`; do not use the evicting cache for BullMQ. PostgreSQL remains the accepted-delivery source of truth. Queue readiness controls worker health; cache unavailability leaves requests able to fall back to PostgreSQL. Both Redis services have no published host ports.

PostgreSQL data uses the project-scoped `postgres_data` named volume. `docker compose stop` and `docker compose down` preserve it. Do not use `down --volumes` for an installation whose data you need. Environment credentials initialize database roles only on a fresh volume; changing them in dotenv does not rotate existing PostgreSQL passwords. Credential rotation requires a separately planned database-role change coordinated with the API/migration environment.

The supplied PostgreSQL major version is 16. The image digests are pinned for Node, nginx, PostgreSQL, Valkey and the optional collector; npm/pnpm dependencies use the committed lockfile with install scripts disabled. Pinning makes deployments reproducible, but updating base-image patches/digests remains an operator maintenance task. Current memory/CPU limits are initial defaults, not capacity guarantees. Inspect resource usage before increasing workload.

## Backup and restore rehearsal

The backup tool creates a custom-format PostgreSQL snapshot with restrictive file permissions and refuses to overwrite an existing output. Set `PREFLYT_ENV_FILE` if your environment file is elsewhere, and export `COMPOSE_PROJECT_NAME` if your installation uses a custom project name. Database names default to `preflyt`; pass the current name explicitly if you have switched databases.

```sh
sh scripts/deploy/backup.sh backups/before-upgrade.dump
sh scripts/deploy/restore.sh backups/before-upgrade.dump preflyt_restore_rehearsal
```

Restore always creates a new `preflyt_restore_...` database, fails if it exists, restores transactionally and grants the runtime role access. It never drops or replaces the original database. A failed restore leaves the new target for diagnosis; choose a fresh name for a later attempt. Verify identities, repository selections, profiles, audit records and migration history in the restored database before relying on the backup. Protect and retain backups outside the Docker host; they contain sensitive application records and are not encrypted by these tools.

For a recovery cutover, stop web/API/worker, restore to a new database, and set `PREFLYT_DATABASE=preflyt_restore_<name>` in `.env`. Start the chosen compatible image version with migrations and readiness checks. Preserve the original database and backup until recovery is verified. Backup restoration returns data to the snapshot time; subsequent writes are not present.

## Upgrade and rollback

1. Record the currently running source revision, immutable image IDs/tags and database name. Preserve those images. Never overwrite a release tag with a different build.
2. Review the new migrations and old/new application compatibility. Stop web/API/worker for this initial single-instance upgrade flow; take a database backup and rehearse restore into a new target.
3. Update to the reviewed source revision and change `PREFLYT_VERSION` to its unique revision/release tag. Pull the published images, or build source images locally. PostgreSQL and its volume remain in place.
4. Run the migration service explicitly; proceed only on success. Start services with readiness checks and run the HTTP smoke utility plus a selected-repository profile check.

```sh
# dc refers to the production stack; include the local override for local use.
dc() { docker compose --env-file .env "$@"; }
dc stop web api worker
sh scripts/deploy/backup.sh backups/before-upgrade.dump
# Update the reviewed source and PREFLYT_VERSION here, keeping old images.
# For published releases: dc pull; for source builds:
dc build
dc run --rm migrate
dc up -d --no-build --wait --wait-timeout 180
node --env-file=.env scripts/deploy/smoke.mjs
```

Repeated `migrate deploy` is safe: applied migrations are not repeated. If migration/startup fails, keep the application stopped, inspect service logs and preserve both backup and volume. Do not edit applied migration files, run `migrate reset`, delete the volume or automatically mark a failed migration successful.

For application rollback, use previous immutable API/web/migration images with `--no-build` only when that application is compatible with the current schema. Migrations are not automatically reversed. When compatibility is uncertain, restore the pre-upgrade backup into a new target, switch `PREFLYT_DATABASE`, and start the previous images. This preserves the current database for diagnosis and avoids destructive in-place rollback.

## Diagnosis and verification limits

```sh
docker compose --env-file .env logs --tail=100 migrate api worker cache queue web
docker compose --env-file .env ps
docker compose --env-file .env stop
```

Do not print `docker compose config` or dump container environments when sharing diagnostics; they contain resolved secrets. Use `config --quiet` for validation. Health checks cover service and database readiness. The smoke utility checks direct SPA navigation, web/API health, anonymous and unselected repository access, origin rejection, configured Super Admin login/session/logout, and dotfile protection. It does not test a browser or live GitHub discovery. A release still needs a selected real repository and an operator verification of the configured external TLS/OIDC/GitHub callbacks.

References: [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/) and [Prisma Docker deployment requirements](https://www.prisma.io/docs/guides/deployment/docker).

## OpenTelemetry

Telemetry defaults to disabled (`OTEL_SDK_DISABLED=true`) until an operator supplies an endpoint. API and worker have distinct service names. Enable the three OTLP signals by setting `OTEL_SDK_DISABLED=false`, `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_PROTOCOL` (`http/protobuf` or `grpc`). Signal-specific endpoints, standard encoded headers, sampling and resource metadata are supported. No SigNoz-specific code or mandatory APM stack is bundled. See the [telemetry runbook](../deployment/opentelemetry-env.md).

To use the optional collector, configure `COLLECTOR_UPSTREAM_ENDPOINT` (an OTLP HTTP base URL) and `COLLECTOR_UPSTREAM_HEADERS` (a JSON object, for example `{"Authorization":"Bearer <token>"}`). Set application endpoint `http://otel-collector:4318` for HTTP or `http://otel-collector:4317` for gRPC, enable the SDK, and start `docker compose --profile observability up -d`. Keep application exporter headers empty when only the collector needs upstream authorization. Its ports are private to Compose. The collector's bounded in-memory queue is telemetry buffering, not durable evidence storage.

The nullable `GitHubWebhookDelivery.traceParent` migration preserves all existing deliveries and stores W3C trace context without request bodies or authentication headers. Upgrade with the migration image before starting the new API/worker. Backup/rehearsal instructions above still apply.

## Optional GitHub sign-in

Set `GITHUB_LOGIN_ENABLED=true` with the configured GitHub App ID, client ID, client secret, private key and `GITHUB_USER_TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as base64). Enable expiring user tokens and Organization Members read permission on the App. Compose supplies the separate login callback `${WEB_ORIGIN}/api/auth/github/callback`; register that exact callback in GitHub. Installation setup retains its separate callback. The API validates enabled provider settings at startup, and OIDC fields can be empty for a GitHub-only deployment.

A verified organization owner can onboard an already installed App and grant existing GitHub members a Preflyt role. The GitHub members tab lists and synchronizes organization users; Redis caches directory snapshots for five minutes, while assignments reverify membership. Existing OIDC workspaces can use Link GitHub organization to verify the current workspace Owner and a GitHub organization owner. Existing identities are retained without automatic merging. Retain OIDC for unmigrated users. Disabling the login flag hides new GitHub sign-in without deleting links, grants or audit records; keep authorization enforcement and the encryption key for existing GitHub accounts.

This slice does not implement automatic token refresh or immediate membership/user revocation webhooks. Authorization evidence expires after five minutes, privileged changes require fresh verification, and an expired user token requires sign-in again.

For a workspace that already has the GitHub App connected, use **Access Control → GitHub members → Link GitHub organization**. GitHub sign-in must be enabled and its callback registered first. The flow binds the request to the original authenticated workspace Owner session and verifies a GitHub organization owner before confirmation. It reuses the same internal organization and installation, preserves repositories, policies, grants and history, and grants that verified GitHub owner access with an audit record. It never moves an installation between workspaces or merges existing identities automatically.
