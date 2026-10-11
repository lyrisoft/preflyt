---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
description: Run Preflyt on your machine with Docker Compose, with no source code needed.
---

import Tabs from '@theme/Tabs'
import TabItem from '@theme/TabItem'
import { CurlDownload } from '@site/src/components/Download'
import ComposeYaml from '../_generated/compose-yaml.md'
import EnvSnippet from '../_generated/env-local.md'

# Quick Start

Run Preflyt on your own machine with Docker Compose. You download one file, create one settings file and start it. You do **not** need the Preflyt source code.

This is a **local trial** on `http://localhost:8080`. For a deployment other people use, follow [Docker Compose](../self-hosting/docker-compose.md).

## Before you start

You need:

- **Docker with Compose 2.23.1 or later.** Check with `docker compose version`.
- **`curl` and `openssl`**, which macOS and Linux include.
- **Access to the Preflyt images.** They are stored privately at `ghcr.io/lyrisoft`. You need a GitHub account that has been given read access to those packages, and a personal access token (classic) with the `read:packages` permission. If you do not have access, ask Lyrisoft.
- **The release to run.** Use a published stable version such as `vX.Y.Z`, or a development build identified by `sha-` followed by the 40-character commit ID. Choose an existing tag from the release you were given.

## 1. Sign in to the image registry

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
# Paste your read:packages token at the Password prompt.
```

You should see `Login Succeeded`.

## 2. Add the compose file

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
WEB_ORIGIN=http://localhost:8080
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=$(openssl rand -hex 20)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DATABASE_APP_PASSWORD=$(openssl rand -hex 24)
CONFIGURATION_ENCRYPTION_KEY=$(openssl rand -base64 32)
GITHUB_USER_TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)
PREFLYT_NODE_ENV=development
PREFLYT_COOKIE_SECURE=false
EOF
chmod 600 .env
```

Read your sign-in password with `grep SUPER_ADMIN_PASSWORD .env`.

</TabItem>
</Tabs>

Set `PREFLYT_VERSION` to the release you were given.

:::warning Keep this file safe
`CONFIGURATION_ENCRYPTION_KEY` protects the credentials you save in Settings later. If you lose it, those credentials cannot be recovered. Keep a copy somewhere safe, apart from the database.
:::

:::danger Local trial only
`PREFLYT_NODE_ENV=development` and `PREFLYT_COOKIE_SECURE=false` let Preflyt run over plain `http://localhost`. Never use them on a deployment other people can reach.
:::

## 4. Start Preflyt

```bash
docker compose up -d --wait
```

The first start pulls the images, which can take a few minutes. When it finishes, check that every service is healthy:

```bash
docker compose ps
```

`api`, `worker`, `web`, `db`, `cache` and `queue` should all show `healthy`.

## 5. Sign in

Open [http://localhost:8080](http://localhost:8080). On a fresh install the page says **Set up Preflyt**. Choose **Start setup** and sign in with `admin` and the password from your `.env`.

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
| `error from registry: unauthorized` while pulling | You are not signed in, or the account cannot read the Preflyt packages. Repeat step 1 with a token that has `read:packages`. Docker shows this message for a wrong release ID too, so check both. |
| An error that mentions `configs` or `content` | Your Docker Compose is older than 2.23.1. Update Docker. |
| A service is `unhealthy` | Run `docker compose logs api worker` and see [Troubleshooting](../self-hosting/troubleshooting.md). |

## Next

[Connect GitHub](connect-github.md).
