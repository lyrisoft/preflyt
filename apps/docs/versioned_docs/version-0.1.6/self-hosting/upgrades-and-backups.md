---
id: upgrades-and-backups
title: Upgrades and backups
sidebar_label: Upgrades and backups
description: Back up, restore, upgrade and roll back a Docker Compose installation of Preflyt.
---

import { CurlDownload } from '@site/src/components/Download'

# Upgrades and backups

This page covers a single-instance Docker Compose installation. Plan upgrades as a short maintenance window.

## Get the backup scripts

Two small scripts do the safe thing for you. Download them into the folder that holds `compose.yaml` and `.env`:

```bash
cd /opt/preflyt
```

<CurlDownload file="backup.sh" />

<CurlDownload file="restore.sh" />

```bash
chmod +x backup.sh restore.sh
```

## Back up

The backup script writes a custom-format PostgreSQL snapshot with private permissions and refuses to overwrite an existing file.

```bash
./backup.sh backups/before-upgrade.dump
```

- It runs against the `db` service of the installation in the current folder.
- The database name defaults to `preflyt`. Pass another name as a second argument if you changed it.

:::warning Protect your backups
Backups contain sensitive application records and are **not encrypted**. Store them outside the server with appropriate access control. Also back up your [encryption keys](configuration.md#the-three-encryption-keys) separately, because without `CONFIGURATION_ENCRYPTION_KEY` the saved credentials in a restored database cannot be decrypted.
:::

## Restore (rehearsal)

Restore never touches your original database. It always creates a **new** database named `preflyt_restore_...`, restores in one transaction and grants the runtime role access. It fails if that name already exists. Use a fresh name for each attempt.

```bash
./restore.sh backups/before-upgrade.dump preflyt_restore_rehearsal
```

Before you rely on a backup, check the restored database for identities, repository selections, audit records and migration history.

### Recovery cutover

To switch to a restored database:

1. Stop `web`, `api` and `worker`: `docker compose stop web api worker`.
2. Restore into a new database as above.
3. Add `PREFLYT_DATABASE=preflyt_restore_<name>` to `.env`.
4. Start Preflyt: `docker compose up -d --wait`.
5. Keep the original database and the backup until recovery is verified.

A restore returns data to the snapshot time. Later writes are not in it.

## Upgrade

1. **Record** the running `PREFLYT_VERSION` and the database name. Keep the old images on the server.
2. **Check** with Lyrisoft whether the new release changes the database in a way that stops the old version from running against it.
3. **Stop** the application and **back up**.
4. **Change** `PREFLYT_VERSION` in `.env` to the new release.
5. **Pull and migrate**, and continue only if it succeeds.
6. **Start** and check health.

```bash
docker compose stop web api worker
./backup.sh backups/before-upgrade.dump
# Edit .env: set PREFLYT_VERSION to the new release
docker compose pull
docker compose run --rm migrate
docker compose up -d --wait
docker compose ps
```

Running migrations again is safe: applied migrations are not repeated. PostgreSQL and its volume stay in place throughout.

If a migration or startup fails:

- keep the application stopped,
- read the logs: `docker compose logs migrate api worker`,
- keep both the backup and the volume.

Do **not** edit applied migration files, reset the database, delete the volume or mark a failed migration as successful.

## Roll back

Migrations are never reversed automatically.

- If the previous release is compatible with the current schema, set `PREFLYT_VERSION` back to it and run `docker compose up -d --wait`.
- If compatibility is uncertain, restore the pre-upgrade backup into a **new** database, point `PREFLYT_DATABASE` at it and start the previous release. This keeps the current database for diagnosis and avoids a destructive in-place rollback.

## Maintenance you own

- **Base images.** Image digests for Node, nginx, PostgreSQL, Valkey and the collector are pinned for reproducibility. Applying patch updates is your task.
- **Resource limits.** The shipped memory and CPU limits are starting points, not capacity guarantees. Check usage before raising workloads.
- **Webhook inbox growth.** Retention of the webhook inbox is operator-managed. Account for it in storage planning and back up PostgreSQL.
- **PostgreSQL credentials.** Credentials in `.env` initialize roles on a fresh volume only. Rotating them needs a planned database-role change coordinated with the API and migration environment.

## Automatic image versions

Development builds retain `sha-<full-commit>` image tags. Successful pushes to `main` publish a GitHub release only after the application images and published-image Compose acceptance pass. The first stable version is `v0.1.0`; later releases increment the patch version of the highest stable `vX.Y.Z` Git tag. Release candidates do not advance that stable sequence.

The API, migration, Health scanner, native controller and web images all receive the same version tag, for example `ghcr.io/lyrisoft/preflyt-web:v0.1.0`. These tags reference the verified dual architecture manifests already built for that commit; release creation does not rebuild images. SHA tags remain available for traceability. Retries reuse the version reserved for the commit and refuse to overwrite a version with different image contents. Native scanner images have their own publishing workflow and retain their existing tags.

Set `PREFLYT_VERSION` to the chosen stable version when upgrading. A release publishes images; it does not automatically deploy them to your server. Major and minor version changes require an intentional new stable version tag; ordinary successful main builds increment the patch version automatically.
