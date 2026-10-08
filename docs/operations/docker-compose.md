# Self-hosted Docker Compose deployment

This packages the current Preflyt UI, authentication, GitHub onboarding and repository profiles. It does not add repository execution, scanners, agents, Kubernetes deployment or full OpenTelemetry/SigNoz instrumentation. The frontend theme is unchanged.

## Configuration and first start

Requirements: Docker Engine/Desktop with Compose v2 or later; Node 24 for the optional HTTP smoke utility. Commands run from the repository root. Use a dedicated deployment checkout and retain the same Compose project name on every upgrade; the default is `preflyt`.

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Set `POSTGRES_PASSWORD` and `DATABASE_APP_PASSWORD` to distinct random hexadecimal values (for example, generate each with `openssl rand -hex 24`). Hexadecimal avoids URL-encoding errors in database connection strings. Set `WEB_ORIGIN` to the public origin without a trailing slash or path, and set `PREFLYT_VERSION` to the exact source commit/release being built. Keep this file outside version control; the Docker build context excludes dotenv files, keys, generated clients, build output and backups.

Choose authentication:

- **Super Admin only:** configure `SUPER_ADMIN_USERNAME` and a unique 24–128 character `SUPER_ADMIN_PASSWORD`; leave all four OIDC fields empty. The API seeds the recovery identity at startup. Sign in at `/super-admin/login`.
- **Organization SSO:** configure all four OIDC fields, with `OIDC_REDIRECT_URI=<WEB_ORIGIN>/api/auth/callback`, and the SHA-256 `BOOTSTRAP_TOKEN_SHA256` for your out-of-band first-Owner token. Partial OIDC configuration or failed discovery blocks startup. A recovery Super Admin can also be configured.

To enable GitHub, configure the App ID, client ID/secret and PEM private key. The App Setup URL is `<WEB_ORIGIN>/api/github/setup/callback`; its OAuth callback is `<WEB_ORIGIN>/api/github/oauth/callback`. Leave GitHub's “Request user authorization during installation” disabled as described in the [README](../../README.md#development-status). The API's callback environment is derived from `WEB_ORIGIN` in Compose. Multiline PEM may be provided as single-quoted text with literal `\n` escapes. No API/GitHub/SSO secrets are baked into the web image.

For production, place your host's HTTPS reverse proxy in front of `127.0.0.1:8080` (or `PREFLYT_HTTP_PORT`), forwarding the entire public origin. Only this loopback web port is published; the API and database have no host ports. Production forces secure cookies and requires HTTPS OIDC endpoints/callbacks. The stack does not install a TLS certificate or reverse proxy for your domain. The nginx web service serves the SPA and forwards `/api/` to the API on the same origin; its access logs omit query strings that may contain OAuth codes or setup state.

```sh
docker compose --env-file deploy/.env build
docker compose --env-file deploy/.env up -d --wait --wait-timeout 180
docker compose --env-file deploy/.env ps
node --env-file=deploy/.env scripts/deploy/smoke.mjs
```

For a local demonstration only, set `WEB_ORIGIN=http://localhost:8080`, keep OIDC fields empty and configure Super Admin credentials. Use the explicit override:

```sh
docker compose --env-file deploy/.env -f compose.yaml -f compose.local.yaml up -d --build --wait --wait-timeout 180
```

Open `http://localhost:8080/super-admin/login`. This override uses development cookie settings and still binds only to loopback; do not use it for an external deployment. Do not restart the standalone `pnpm dev:api` process for a Compose deployment.

## Startup and persistence

PostgreSQL health gates the one-time migration service; successful `prisma migrate deploy` gates API startup; API readiness gates web startup. A migration error prevents the new API/web from starting. API/web/migration run as non-root users with read-only filesystems, a temporary `/tmp`, dropped capabilities and no-new-privileges. The runtime API database role has CRUD access without superuser, role creation or database creation privileges; owner credentials are limited to PostgreSQL and migrations. PostgreSQL's private network is internal; the API has a separate egress network for GitHub/OIDC.

PostgreSQL data uses the project-scoped `postgres_data` named volume. `docker compose stop` and `docker compose down` preserve it. Do not use `down --volumes` for an installation whose data you need. Environment credentials initialize database roles only on a fresh volume; changing them in dotenv does not rotate existing PostgreSQL passwords. Credential rotation requires a separately planned database-role change coordinated with the API/migration environment.

The supplied PostgreSQL major version is 16. The image digests are pinned for Node, nginx and PostgreSQL; npm/pnpm dependencies use the committed lockfile with install scripts disabled. Pinning makes deployments reproducible, but updating base-image patches/digests remains an operator maintenance task. Current memory/CPU limits are initial defaults, not capacity guarantees. Inspect resource usage before increasing workload.

## Backup and restore rehearsal

The backup tool creates a custom-format PostgreSQL snapshot with restrictive file permissions and refuses to overwrite an existing output. Set `PREFLYT_ENV_FILE` if your environment file is elsewhere, and export `COMPOSE_PROJECT_NAME` if your installation uses a custom project name. Database names default to `preflyt`; pass the current name explicitly if you have switched databases.

```sh
sh scripts/deploy/backup.sh backups/before-upgrade.dump
sh scripts/deploy/restore.sh backups/before-upgrade.dump preflyt_restore_rehearsal
```

Restore always creates a new `preflyt_restore_...` database, fails if it exists, restores transactionally and grants the runtime role access. It never drops or replaces the original database. A failed restore leaves the new target for diagnosis; choose a fresh name for a later attempt. Verify identities, repository selections, profiles, audit records and migration history in the restored database before relying on the backup. Protect and retain backups outside the Docker host; they contain sensitive application records and are not encrypted by these tools.

For a recovery cutover, stop web/API, restore to a new database, and set `PREFLYT_DATABASE=preflyt_restore_<name>` in `deploy/.env`. Start the chosen compatible image version with migrations and readiness checks. Preserve the original database and backup until recovery is verified. Backup restoration returns data to the snapshot time; subsequent writes are not present.

## Upgrade and rollback

1. Record the currently running source revision, immutable image IDs/tags and database name. Preserve those images. Never overwrite a release tag with a different build.
2. Review the new migrations and old/new application compatibility. Stop web/API for this initial single-instance upgrade flow; take a database backup and rehearse restore into a new target.
3. Update to the reviewed source revision and change `PREFLYT_VERSION` to its unique revision/release tag. Build the new images. PostgreSQL and its volume remain in place.
4. Run the migration service explicitly; proceed only on success. Start services with readiness checks and run the HTTP smoke utility plus a selected-repository profile check.

```sh
# dc refers to the production stack; include the local override for local use.
dc() { docker compose --env-file deploy/.env "$@"; }
dc stop web api
sh scripts/deploy/backup.sh backups/before-upgrade.dump
# Update the reviewed source and PREFLYT_VERSION here, keeping old images.
dc build
dc run --rm migrate
dc up -d --no-build --wait --wait-timeout 180
node --env-file=deploy/.env scripts/deploy/smoke.mjs
```

Repeated `migrate deploy` is safe: applied migrations are not repeated. If migration/startup fails, keep the application stopped, inspect service logs and preserve both backup and volume. Do not edit applied migration files, run `migrate reset`, delete the volume or automatically mark a failed migration successful.

For application rollback, use previous immutable API/web/migration images with `--no-build` only when that application is compatible with the current schema. Migrations are not automatically reversed. When compatibility is uncertain, restore the pre-upgrade backup into a new target, switch `PREFLYT_DATABASE`, and start the previous images. This preserves the current database for diagnosis and avoids destructive in-place rollback.

## Diagnosis and verification limits

```sh
docker compose --env-file deploy/.env logs --tail=100 migrate api web
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env stop
```

Do not print `docker compose config` or dump container environments when sharing diagnostics; they contain resolved secrets. Use `config --quiet` for validation. Health checks cover service and database readiness. The smoke utility checks direct SPA navigation, web/API health, anonymous and unselected repository access, origin rejection, configured Super Admin login/session/logout, and dotfile protection. It does not test a browser or live GitHub discovery. A release still needs a selected real repository and an operator verification of the configured external TLS/OIDC/GitHub callbacks.

References: [Compose startup dependencies](https://docs.docker.com/compose/how-tos/startup-order/) and [Prisma Docker deployment requirements](https://www.prisma.io/docs/guides/deployment/docker).
