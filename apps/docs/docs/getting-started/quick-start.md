---
id: quick-start
title: Quick Start
sidebar_label: Quick Start
description: Run a local Preflyt instance with Docker Compose and sign in as Super Admin.
---

# Quick Start

This starts a **local, loopback-only** Preflyt instance. It is for evaluation. For a deployment other people use, see [Docker Compose](../self-hosting/docker-compose.md).

**You need:** Docker with Compose v2, `git` and `openssl`. For the optional smoke check, Node 24.

## 1. Get the source

```bash
git clone https://github.com/lyrisoft/preflyt.git
cd preflyt
```

## 2. Create the environment file

```bash
cp .env.example .env
chmod 600 .env
```

Open `.env` and set these values. Everything else can stay as it is.

```bash
POSTGRES_PASSWORD=<output of: openssl rand -hex 24>
DATABASE_APP_PASSWORD=<a different openssl rand -hex 24>
CONFIGURATION_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
WEB_ORIGIN=http://localhost:8080
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=<24 to 128 characters>
```

:::warning Save the encryption key
`CONFIGURATION_ENCRYPTION_KEY` protects the credentials you will save later in Settings. Keep a copy somewhere safe, apart from the database.
:::

## 3. Start Preflyt

```bash
docker compose --env-file .env -f docker-compose.yaml -f compose.local.yaml up -d --build --wait --wait-timeout 600
```

The first build takes several minutes. When it finishes, `docker compose ps` shows `api`, `worker`, `web`, `db`, `cache` and `queue` as healthy.

The `compose.local.yaml` override turns off secure cookies and allows `http://localhost` callback URLs. It still binds only to `127.0.0.1`. **Never use it for an external deployment.**

Optionally, check the stack:

```bash
node --env-file=.env scripts/deploy/smoke.mjs
```

## 4. Sign in

Open [http://localhost:8080](http://localhost:8080). On a fresh install the page says **Set up Preflyt**. Choose **Start setup** and sign in with the Super Admin username and password from `.env`.

You land on the **Engineering Overview**, which shows **Connect your organization**. Choose **Configure GitHub** to continue with [Connect GitHub](connect-github.md).

## What the Super Admin account is for

The Super Admin configures the **deployment**: GitHub App credentials, single sign-on, email and feature switches in **Settings → Configuration**.

It is not a member of any workspace. Until a GitHub organization owner creates the workspace, the sidebar shows **Select organization / Organization setup**, and workspace pages such as **Standards** show that you do not have access. That is expected.

## Stop and start again

```bash
docker compose --env-file .env -f docker-compose.yaml -f compose.local.yaml stop
docker compose --env-file .env -f docker-compose.yaml -f compose.local.yaml up -d
```

Your data lives in the `postgres_data` volume and survives `stop` and `down`. **Do not** use `down --volumes` unless you want to delete everything.

## Next

[Connect GitHub](connect-github.md).
