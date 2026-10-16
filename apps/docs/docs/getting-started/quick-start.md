---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
description: Run Preflyt on your machine with Docker Compose, with no source code needed.
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'
import { CurlDownload } from '@site/src/components/Download'
import {InstallationVersion, GenerateEnvironment} from '@site/src/components/InstallationVersion'
import ComposeYaml from '../_generated/compose-yaml.md'
import EnvSnippet from '../_generated/env-local.md'

# Quick Start

Run Preflyt on your own machine with Docker Compose. You download one file, create one settings file and start it. You do **not** need the Preflyt source code.

This is a **local trial** on `http://localhost:8080`. For a deployment other people use, follow [Docker Compose](../self-hosting/docker-compose.md).

## Before you start

You need:

- **Docker with Compose 2.23.1 or later.** Check with `docker compose version`.
- **`curl` and `openssl`**, which macOS and Linux include.
- **At least 4 CPUs, 8 GiB of Docker memory and 20 GiB of free disk** for the application and scanner images. The bundled scanner engine uses Docker-in-Docker; the host must permit its privileged engine container. No host Docker socket is mounted.
- **The matching release images.** Use the version shown below.

Preflyt's release images are public on `ghcr.io/lyrisoft`. You do not need a GitHub account, registry token or `docker login` to pull them. Use the image tag matching the selected documentation version below.

<InstallationVersion />

## 1. Add the compose file

Create a folder for Preflyt and open it:

```bash
mkdir preflyt && cd preflyt
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

<GenerateEnvironment />

Read your sign-in password with `grep SUPER_ADMIN_PASSWORD .env`.

</TabItem>
</Tabs>

Keep the generated `PREFLYT_VERSION` to match these instructions.

:::warning Keep this file safe
Generate all three encryption keys before the first startup, even if you will configure AI later. `AI_PROVIDER_ENCRYPTION_KEY` protects saved AI provider credentials. Keep each key stable and back up all three apart from the database. Losing or replacing a key makes the credentials encrypted with it unreadable.
:::

:::danger Local trial only
`PREFLYT_NODE_ENV=development` and `PREFLYT_COOKIE_SECURE=false` let Preflyt run over plain `http://localhost`. Never use them on a deployment other people can reach.
:::

## 3. Start Preflyt

```bash
docker compose up -d --wait
```

The first start pulls the application images and prepares the fixed Health scanner images and vulnerability database. Allow up to 30 minutes on the first start; subsequent starts reuse the scanner engine cache. No separate scanner command, certificate setup or connection-file copying is needed. When it finishes, check the services:

```bash
docker compose ps
```

`api`, `worker`, `web`, `db`, `cache`, `queue`, `health-engine` and `health-scanner` should all show `healthy`. The one-shot `migrate` and `health-init` services finish successfully and exit.

The Health scanner is included. After you connect GitHub and select a repository, Health can run its applicable static analyzers automatically. Repository tests and coverage still come from CI. See [Repository health](../user-guide/repository-health.md#scanner-service).

## 4. Sign in

Open [http://localhost:8080/sign-in](http://localhost:8080/sign-in). On a fresh install the page says **Set up Preflyt**. Choose **Start setup** and sign in with `admin` and the password from your `.env`.

You land on the **Engineering Overview**, which shows **Connect your organization**. Choose **Configure GitHub** to continue with [Connect GitHub](connect-github.md).

## What the Super Admin account is for

The Super Admin configures the **deployment**: GitHub App credentials, single sign-on, email and feature switches in **Settings → Configuration**.

It is not a member of any workspace. Until a GitHub organization owner creates the workspace, the sidebar shows **Select organization / Organization setup**, and workspace pages such as **Standards** show that you do not have access. That is expected.

## Stop, start and remove

```bash
docker compose stop      # stop, keeping your data
docker compose up -d     # start again
docker compose down      # remove containers, keeping your data
```

Your data lives in Docker volumes and survives all of the above. **Do not** run `docker compose down --volumes` unless you want to delete everything.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `required variable PREFLYT_VERSION is missing a value` | Set `PREFLYT_VERSION` in `.env` to an existing stable version (`vX.Y.Z`) or development SHA tag. |
| `error from registry: unauthorized` while pulling | Confirm `PREFLYT_VERSION` matches a published release and `PREFLYT_IMAGE_REGISTRY` is `ghcr.io/lyrisoft`. Public images do not need a token. If stale GHCR credentials are configured, use `docker logout ghcr.io`, then retry. |
| An error that mentions `configs` or `content` | Your Docker Compose is older than 2.23.1. Update Docker. |
| A service is `unhealthy` | Run `docker compose logs migrate health-init health-engine health-scanner api worker` and see [Troubleshooting](../self-hosting/troubleshooting.md). |

## Next

[Connect GitHub](connect-github.md).
