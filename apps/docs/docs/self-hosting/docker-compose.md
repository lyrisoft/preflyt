---
id: docker-compose
title: Docker Compose
sidebar_label: Docker Compose
description: Install Preflyt on a server with Docker Compose, with no source code needed.
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'
import { CurlDownload } from '@site/src/components/Download'
import ComposeYaml from '../_generated/compose-yaml.md'
import EnvSnippet from '../_generated/env-production.md'

# Docker Compose

This page installs Preflyt on one server for a team to use. You download one compose file, create one settings file and start it. You do **not** need the Preflyt source code.

For a quick look on your own machine first, use the [Quick Start](../getting-started/quick-start.md).

## What you need

- A Linux server (or any host) with **Docker and Compose 2.23.1 or later**. Check with `docker compose version`.
- **Access to the Preflyt images** at `ghcr.io/lyrisoft`. They are private. You need a GitHub account that has been given read access to those packages and a personal access token (classic) with `read:packages`. Ask Lyrisoft if you do not have access.
- **A release to run.** Use a published stable version (`vX.Y.Z`) or a development build (`sha-` plus the 40-character commit ID).
- **A public HTTPS address** for Preflyt, such as `https://preflyt.example.com`, and a reverse proxy that serves it. See [Reverse proxy and TLS](reverse-proxy.md).

## 1. Sign in to the registry

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
# Paste your read:packages token at the Password prompt.
```

## 2. Add the compose file

Choose a permanent folder and run every `docker compose` command from it. The compose file names the installation `preflyt`, so its volumes are called `preflyt_postgres_data` and `preflyt_queue_data` wherever the folder is.

```bash
mkdir -p /opt/preflyt && cd /opt/preflyt
```

<Tabs groupId="compose-source">
<TabItem value="copy" label="Copy and paste" default>

Create a file named `compose.yaml` in that folder and paste the whole block below into it. Use the copy button at the top right of the block: it copies the entire file, not only the part you can see.

<div className="long-code">
<ComposeYaml />
</div>

</TabItem>
<TabItem value="curl" label="Download with curl">

<CurlDownload file="compose.yaml" />

</TabItem>
</Tabs>

This is the only file Preflyt needs besides your settings. Do not edit it: put your changes in `.env`.

## 3. Create your settings

<Tabs groupId="env-source">
<TabItem value="copy" label="Copy and paste" default>

Create a file named `.env` next to `compose.yaml`, paste the block below into it, then replace every value that starts with `REPLACE_`.

<EnvSnippet />

Create the random values with these commands and paste each result in:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD, then again for DATABASE_APP_PASSWORD
openssl rand -hex 20      # a strong SUPER_ADMIN_PASSWORD
openssl rand -base64 32   # CONFIGURATION_ENCRYPTION_KEY, then again for GITHUB_USER_TOKEN_ENCRYPTION_KEY
```

Finally make the file private:

```bash
chmod 600 .env
```

</TabItem>
<TabItem value="generate" label="Generate automatically">

This command writes `.env` for you with freshly generated passwords and keys. Replace `REPLACE_WITH_PUBLISHED_VERSION` with your release first.

```bash
cat > .env <<EOF
PREFLYT_VERSION=REPLACE_WITH_PUBLISHED_VERSION
WEB_ORIGIN=https://preflyt.example.com
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=$(openssl rand -hex 20)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DATABASE_APP_PASSWORD=$(openssl rand -hex 24)
CONFIGURATION_ENCRYPTION_KEY=$(openssl rand -base64 32)
GITHUB_USER_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
EOF
chmod 600 .env
```

Read your sign-in password with `grep SUPER_ADMIN_PASSWORD .env`.

</TabItem>
</Tabs>

Set `PREFLYT_VERSION` to the release you were given, and `WEB_ORIGIN` to your public HTTPS address with no trailing slash and no path.

:::warning Back up your keys now
`CONFIGURATION_ENCRYPTION_KEY` decrypts the credentials you save in **Settings → Configuration**. If you lose or replace it, those credentials cannot be recovered. Preflyt has no key rotation. Copy `.env` to your secret manager before you continue.
:::

:::note Passwords are set once
`POSTGRES_PASSWORD` and `DATABASE_APP_PASSWORD` only take effect when the database is first created. Changing them later does not change the existing database's passwords.
:::

## 4. Start Preflyt

```bash
docker compose up -d --wait
docker compose ps
```

Startup follows health checks:

1. PostgreSQL becomes healthy.
2. The `migrate` job applies the database migrations and exits.
3. The API starts and becomes ready.
4. The worker starts and waits for the API's configuration.
5. The web service starts.

A migration failure stops the API and web from starting. Read `docker compose logs migrate`.

## 5. Put HTTPS in front of it

Preflyt listens only on `127.0.0.1:8080` of the server. Set up your reverse proxy so your public address forwards to it. See [Reverse proxy and TLS](reverse-proxy.md).

## 6. Check it works

1. Open your `WEB_ORIGIN` in a browser. You should see **Set up Preflyt**.
2. Choose **Start setup** and sign in with `admin` and your `SUPER_ADMIN_PASSWORD`.
3. Check the health endpoint: `curl -fsS https://preflyt.example.com/healthz` should print `ok`.

This does not test your GitHub setup. Continue with [Connect GitHub](../getting-started/connect-github.md).

## Where your data lives

| Data | Where |
| --- | --- |
| Database | The `postgres_data` volume |
| Job queue | The `queue_data` volume |
| Cache | Memory only. Safe to lose. |

`docker compose stop` and `docker compose down` keep your data.

:::danger Do not delete the volumes
Never run `docker compose down --volumes` on an installation whose data you need.
:::

Containers run as non-root with read-only filesystems, dropped capabilities and `no-new-privileges`. The runtime database role can read and write data only: it has no superuser, role-creation or database-creation rights.

## Next steps

- [Connect GitHub](../getting-started/connect-github.md)
- [Authentication](authentication.md)
- [Upgrades and backups](upgrades-and-backups.md)
- [Observability](observability.md)


## Shared repository-assessment runner

The separate reviewed Docker controller can serve both Compose and Kubernetes-hosted Preflyt. Download the application-side selector beside your `compose.yaml`:

<CurlDownload file="native-runner.compose.yaml" />

```bash
docker compose -f compose.yaml -f native-runner.compose.yaml config --quiet
```

The selector chooses the Docker backend for API and worker with admission disabled. Deploy the existing dedicated controller separately; the application never receives an engine socket or engine TLS files. Supply the actual reviewed Docker approval, public reviewer keys, analyzer reviews and application-side controller key through the existing deployment configuration. Keep controller signing keys outside API/worker. This configuration does not qualify a runtime or run connected-repository code.
