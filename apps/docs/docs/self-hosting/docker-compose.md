---
id: docker-compose
title: Docker Compose
sidebar_label: Docker Compose
description: Install Preflyt on a server with Docker Compose, with no source code needed.
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'
import { CurlDownload } from '@site/src/components/Download'
import {InstallationVersion, GenerateEnvironment} from '@site/src/components/InstallationVersion'
import ComposeYaml from '../_generated/compose-yaml.md'
import EnvSnippet from '../_generated/env-production.md'

# Docker Compose

This page installs Preflyt on one server for a team to use. You download one compose file, create one settings file and start it. You do **not** need the Preflyt source code.

For a quick look on your own machine first, use the [Quick Start](../getting-started/quick-start.md).

## What you need

- A Linux server (or Docker Desktop host) with **Docker and Compose 2.23.1 or later**, at least **4 CPUs, 8 GiB of Docker memory and 20 GiB of free disk**. Check with `docker compose version`. The host must permit the bundled Docker-in-Docker engine container to run privileged.
- **The matching release images.** Use the version shown below.
- **A public HTTPS address** for Preflyt, such as `https://preflyt.example.com`, and a reverse proxy that serves it. See [Reverse proxy and TLS](reverse-proxy.md).

## Repository Health scanner

The Compose file includes the Health scanner and a separate TLS-protected Docker engine. Startup initializes private storage, generates engine certificates and the scanner identity, prepares the fixed analyzer images, and shares only the scanner connection file with the API and worker. No additional scanner settings, commands or manual certificate copying are required.

The nested engine is the only privileged service. It has no host Docker socket, host directory mounts or published ports. Scanner jobs run without privileges, networking or application credentials, with read-only source and enforced CPU, memory and PID limits. This is container isolation, not a separate VM; use a dedicated Docker host for a production installation. The API and worker have HTTP access to the scanner and no engine credentials. See [Repository health](../user-guide/repository-health.md#scanner-service).

Preflyt's release images are public on `ghcr.io/lyrisoft`. You do not need a GitHub account, registry token or `docker login` to pull them. Use the image tag matching the selected documentation version below.

<InstallationVersion />

## 1. Add the compose file

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

## 2. Create your settings

<Tabs groupId="env-source">
<TabItem value="copy" label="Copy and paste" default>

Create a file named `.env` next to `compose.yaml`, paste the block below into it, then replace every value that starts with `REPLACE_`.

<EnvSnippet />

Create the random values with these commands and paste each result in:

```bash
openssl rand -hex 24      # POSTGRES_PASSWORD, then again for DATABASE_APP_PASSWORD
openssl rand -hex 20      # a strong SUPER_ADMIN_PASSWORD
openssl rand -base64 32   # CONFIGURATION_ENCRYPTION_KEY
openssl rand -base64 32   # GITHUB_USER_TOKEN_ENCRYPTION_KEY, use a different value
openssl rand -base64 32   # AI_PROVIDER_ENCRYPTION_KEY, use a third different value
```

Finally make the file private:

```bash
chmod 600 .env
```

</TabItem>
<TabItem value="generate" label="Generate automatically">

This command writes `.env` with freshly generated passwords and keys and the matching image version.

<GenerateEnvironment production />

Read your sign-in password with `grep SUPER_ADMIN_PASSWORD .env`.

</TabItem>
</Tabs>

Set `PREFLYT_VERSION` to your selected published stable release, and `WEB_ORIGIN` to your public HTTPS address with no trailing slash and no path.

:::warning Back up your keys now
Generate all three encryption keys before the first startup, even if you will configure AI later. `CONFIGURATION_ENCRYPTION_KEY` decrypts credentials saved in **Settings → Configuration**; `AI_PROVIDER_ENCRYPTION_KEY` decrypts AI provider credentials. Losing or replacing a key makes the credentials encrypted with it unreadable. Preflyt has no key rotation. Copy `.env` to your secret manager before you continue.
:::

:::note Passwords are set once
`POSTGRES_PASSWORD` and `DATABASE_APP_PASSWORD` only take effect when the database is first created. Changing them later does not change the existing database's passwords.
:::

## 3. Start Preflyt

```bash
docker compose up -d --wait
docker compose ps
```

Startup follows health checks:

1. PostgreSQL and the dedicated TLS scanner engine become healthy.
2. `migrate` applies database migrations; `health-init` prepares scanner storage and copies only engine client certificates. Both jobs exit successfully.
3. `health-scanner` prepares its fixed analyzer images and vulnerability database, then verifies its engine controls. The first start can take up to 30 minutes.
4. The API and worker start after scanner readiness. The worker waits for the API's configuration.
5. The web service starts.

`docker compose up -d --wait` waits for scanner preparation too. To follow progress, use `docker compose logs -f health-scanner`. A failed scanner initialization or readiness check prevents the application from starting with an unusable Health service.

A migration failure stops the API and web from starting. Read `docker compose logs migrate`.

## 4. Put HTTPS in front of it

Preflyt listens only on `127.0.0.1:8080` of the server. Set up your reverse proxy so your public address forwards to it. See [Reverse proxy and TLS](reverse-proxy.md).

## 5. Check it works

1. Open `<WEB_ORIGIN>/sign-in` in a browser. You should see **Set up Preflyt**. The root URL serves the public product page.
2. Choose **Start setup** and sign in with `admin` and your `SUPER_ADMIN_PASSWORD`.
3. Check the health endpoint: `curl -fsS https://preflyt.example.com/healthz` should print `ok`.

This does not test your GitHub setup. Continue with [Connect GitHub](../getting-started/connect-github.md).

## Where your data lives

| Data | Where |
| --- | --- |
| Database | The `postgres_data` volume |
| Job queue | The `queue_data` volume |
| Cache | Memory only. Safe to lose. |
| Scanner images and vulnerability database | The `health_engine_data` volume |
| Scanner identity and TLS credentials | The `health_state`, `health_engine_certs` and `health_engine_client` volumes |
| Scanner connection and temporary job state | The `health_connection` and `health_jobs` volumes |

`docker compose stop` and `docker compose down` keep your data.

:::danger Do not delete the volumes
Never run `docker compose down --volumes` on an installation whose data you need.
:::

The API, worker, scanner and web containers run as non-root with read-only filesystems, dropped capabilities and `no-new-privileges`. The one-shot scanner initializer has only the capabilities needed to set private volume ownership; the dedicated nested engine requires privileged mode. Neither receives application credentials. The runtime database role can read and write data only: it has no superuser, role-creation or database-creation rights.

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

## Optional AI security and payment review

Use a release containing `preflyt-strix-runner` and `preflyt-strix-sandbox`. Add
`COMPOSE_PROFILES=ai-security` to your `.env`, then run:

```sh
docker compose pull
docker compose up -d --wait --wait-timeout 1800
docker compose logs --tail 50 strix-runner
```

General Security Review and Payment Risk Review use the same source-only runner.
No host Python or development bridge is required. The profile starts a separate
TLS-protected Docker-in-Docker engine and a non-root controller, with no host socket
or published controller ports. Reserve additional capacity: 16 GiB Docker memory,
8 CPUs and 60 GiB free disk are starting budgets for the combined stack. The first
start also downloads the matching sandbox image into its isolated engine.

Enable AI configuration and reviews in **Settings → Configuration**. In AI
Intelligence, test the model route and permit source sharing. Select the
wanted review profiles explicitly when assessing a repository. Starting the Compose
services does not run a review. Results remain beta AI suggestions requiring human
validation; these profiles do not test live payment systems or decide merge access.
Keep API, worker, controller and sandbox on the same published release. Preserve
the Strix state and connection volumes across upgrades. Restart the controller
before its persisted one-year TLS certificate expires; startup renews certificates
with fewer than seven days remaining. Interrupted reviews fail and need an explicit
new run. Omit the profile to use standard checks alone.
