---
id: upgrades-and-backups
title: Upgrades and backups
sidebar_label: Upgrades and backups
description: Back up, restore, upgrade and roll back a Docker Compose installation of Preflyt.
---

# Upgrades and backups

This page covers a single-instance Docker Compose installation. Plan upgrades as a short maintenance window.

## Back up

The backup tool writes a custom-format PostgreSQL snapshot with restrictive file permissions and refuses to overwrite an existing file.

```bash
sh scripts/deploy/backup.sh backups/before-upgrade.dump
```

- Set `PREFLYT_ENV_FILE` if your environment file is not `.env`.
- Export `COMPOSE_PROJECT_NAME` if you use a custom project name.
- The database name defaults to `preflyt`. Pass the current name explicitly if you changed it.

:::warning Protect your backups
Backups contain sensitive application records and are **not encrypted** by these tools. Store them outside the Docker host with appropriate access control. Also back up your three [encryption keys](configuration.md#the-three-encryption-keys) separately, because without `CONFIGURATION_ENCRYPTION_KEY` the saved credentials in a restored database cannot be decrypted.
:::

## Restore (rehearsal)

Restore never touches your original database. It always creates a **new** database named `preflyt_restore_...`, restores transactionally and grants the runtime role access. It fails if the target exists, and a failed restore leaves the target in place for diagnosis. Use a fresh name for the next attempt.

```bash
sh scripts/deploy/restore.sh backups/before-upgrade.dump preflyt_restore_rehearsal
```

Before you rely on a backup, check the restored database for identities, repository selections, profiles, audit records and migration history.

### Recovery cutover

To switch to a restored database:

1. Stop `web`, `api` and `worker`.
2. Restore into a new database as above.
3. Set `PREFLYT_DATABASE=preflyt_restore_<name>` in `.env`.
4. Start a compatible image version with migrations and readiness checks.
5. Keep the original database and the backup until recovery is verified.

A restore returns data to the snapshot time. Later writes are not in it.

## Upgrade

1. **Record** the running source revision, the immutable image IDs or tags, and the database name. Keep the old images. Never overwrite a release tag with a different build.
2. **Review** the new migrations and whether the old and new application versions are compatible.
3. **Stop** the application, take a backup, and rehearse a restore into a new target.
4. **Update** the source and set `PREFLYT_VERSION` to the new unique revision or release tag.
5. **Migrate** explicitly, and continue only if it succeeds.
6. **Start** with readiness checks and run the smoke utility.

```bash
dc() { docker compose --env-file .env "$@"; }   # add -f compose.local.yaml for local use
dc stop web api worker
sh scripts/deploy/backup.sh backups/before-upgrade.dump
# Update the reviewed source and PREFLYT_VERSION here, keeping the old images.
# For published releases:  dc pull
# For source builds:
dc build
dc run --rm migrate
dc up -d --no-build --wait --wait-timeout 180
node --env-file=.env scripts/deploy/smoke.mjs
```

Running migrations again is safe: applied migrations are not repeated. PostgreSQL and its volume stay in place throughout.

If a migration or startup fails:

- keep the application stopped,
- read the logs for `migrate`, `api` and `worker`,
- preserve both the backup and the volume.

Do **not** edit applied migration files, run `migrate reset`, delete the volume or mark a failed migration as successful.

## Roll back

Migrations are never reversed automatically.

- If the previous images are compatible with the current schema, start them with `--no-build`.
- If compatibility is uncertain, restore the pre-upgrade backup into a **new** database, point `PREFLYT_DATABASE` at it and start the previous images. This keeps the current database for diagnosis and avoids a destructive in-place rollback.

## Maintenance you own

- **Base images.** Image digests for Node, nginx, PostgreSQL, Valkey and the collector are pinned for reproducibility. Applying patch updates is your task.
- **Resource limits.** The shipped memory and CPU limits are starting points, not capacity guarantees. Check usage before raising workloads.
- **Webhook inbox growth.** Retention of the webhook inbox is operator-managed. Account for it in storage planning and back up PostgreSQL.
- **PostgreSQL credentials.** Credentials in `.env` initialize roles on a fresh volume only. Rotating them needs a planned database-role change coordinated with the API and migration environment.
