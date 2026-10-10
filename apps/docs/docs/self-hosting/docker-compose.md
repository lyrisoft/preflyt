---
id: docker-compose
title: Docker Compose
sidebar_label: Docker Compose
description: Install, start and verify Preflyt with Docker Compose.
---

# Docker Compose

This page installs Preflyt on one host. For a throwaway local trial, use the shorter [Quick Start](../getting-started/quick-start.md).

## 1. Get the source

Use a dedicated checkout and keep the same Compose project name (`preflyt` by default) on every upgrade.

```bash
git clone https://github.com/lyrisoft/preflyt.git
cd preflyt
```

## 2. Create the environment file

```bash
cp .env.example .env
chmod 600 .env
```

Set these values in `.env`. Keep the file out of version control.

| Variable | Value |
| --- | --- |
| `POSTGRES_PASSWORD` | A random hexadecimal string: `openssl rand -hex 24` |
| `DATABASE_APP_PASSWORD` | A **different** random hexadecimal string. Hexadecimal avoids URL-encoding problems in database URLs. |
| `CONFIGURATION_ENCRYPTION_KEY` | 32 random bytes, base64: `openssl rand -base64 32`. Back it up separately from the database. |
| `WEB_ORIGIN` | The public origin, with no trailing slash or path, for example `https://preflyt.example.com`. |
| `PREFLYT_IMAGE_REGISTRY` | `preflyt-local` when building from source. |
| `PREFLYT_VERSION` | The exact commit or release you are building. |
| `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD` | Recovery credentials. The password must be 24 to 128 characters. See [Authentication](authentication.md). |

:::warning Keep the encryption key safe
`CONFIGURATION_ENCRYPTION_KEY` decrypts the credentials you save in **Settings → Configuration**. If you lose or replace it, those credentials cannot be decrypted. Preflyt has no key rotation. Restore the original key and restart.
:::

The full variable list is in [Configuration](configuration.md).

## 3. Build and start

```bash
docker compose --env-file .env build
docker compose --env-file .env up -d --wait --wait-timeout 180
docker compose --env-file .env ps
```

Startup is ordered by health checks: PostgreSQL becomes healthy, the `migrate` job completes, the API becomes ready, then the web service starts. The worker starts after migration and waits for the API's configuration initialization. A migration failure prevents the API and web from starting.

## 4. Verify

```bash
node --env-file=.env scripts/deploy/smoke.mjs
```

The smoke utility needs Node 24. It checks:

- direct navigation to application routes,
- web and API health,
- anonymous and unselected-repository access,
- origin rejection,
- Super Admin login, session and logout,
- protection of dotfiles.

It does **not** test a browser, live GitHub discovery or your external TLS, OIDC and GitHub callbacks. Verify those yourself after [connecting GitHub](../getting-started/connect-github.md).

## Local trial override

For a local demonstration only, set `WEB_ORIGIN=http://localhost:8080`, leave the OIDC fields empty, configure the Super Admin credentials, and add the loopback override:

```bash
docker compose --env-file .env -f docker-compose.yaml -f compose.local.yaml up -d --build --wait --wait-timeout 180
```

Then open `http://localhost:8080/super-admin/login`. The override turns off secure cookies. Never use it for a deployment others can reach.

## Persistence

| Data | Where it lives |
| --- | --- |
| Database | The `postgres_data` named volume. `docker compose stop` and `down` keep it. |
| Job queue | The `queue_data` volume (AOF every second). |
| Cache | Memory only. Safe to lose. |

:::danger Do not delete the volume
Do not run `docker compose down --volumes` on an installation whose data you need. Environment passwords only initialize database roles on a **fresh** volume; changing them later does not rotate existing PostgreSQL passwords.
:::

The containers run as non-root with read-only filesystems, dropped capabilities and `no-new-privileges`. The runtime database role has data access only, with no superuser, role-creation or database-creation privileges.

## Next steps

- [Authentication](authentication.md)
- [GitHub App](github-app.md)
- [Reverse proxy and TLS](reverse-proxy.md)
- [Upgrades and backups](upgrades-and-backups.md)
