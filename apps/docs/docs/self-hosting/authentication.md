---
id: authentication
title: Authentication
sidebar_label: Authentication
description: Sign in to Preflyt with the Super Admin recovery login, OpenID Connect single sign-on or GitHub.
---

# Authentication

Preflyt supports three ways to sign in. You can use any combination.

| Method | Best for | Configured in |
| --- | --- | --- |
| **Super Admin recovery login** | First setup, and recovery if other sign-in breaks | Environment variables |
| **GitHub sign-in** | Teams that already manage access through a GitHub organization | GitHub App plus Settings → Configuration |
| **Single sign-on (OIDC)** | Organizations with an identity provider | Settings → Configuration |

## Super Admin recovery login

Set both values in `.env` before the first start:

```bash
SUPER_ADMIN_USERNAME=admin
SUPER_ADMIN_PASSWORD=<24 to 128 characters>
```

On startup Preflyt seeds one Super Admin account and stores only a salted scrypt hash of the password. Sign in at:

```text
<WEB_ORIGIN>/super-admin/login
```

Properties of this login:

- It is rate-limited and audited.
- A session lasts **24 hours** from sign-in. Activity does not extend it.
- Restarting the API with the same database and credentials keeps existing sessions.
- Changing or removing the configured credentials revokes local sessions.
- Super Admin is the only role that can open **Settings → Configuration**.

:::tip Keep it available
If other sign-in methods are misconfigured, the Super Admin login is how you get back in. Keep the credentials in your secret manager even after you set up GitHub or SSO. If you configure no OIDC and GitHub sign-in is off, Preflyt runs in recovery-only mode.
:::

A fresh install needs this login first, because the settings for the other methods live behind it.

## GitHub sign-in

GitHub sign-in lets verified members of your GitHub organization sign in, and lets an Owner grant roles by GitHub username. Accounts are never matched by email or username, and existing identities are never merged automatically.

Before enabling it:

1. Install the [GitHub App](github-app.md) in your organization with **Organization members: Read-only**.
2. In the App, enable **Expire user authorization tokens** and register the login callback:

   ```text
   <WEB_ORIGIN>/api/auth/github/callback
   ```

3. Generate a separate token key and add it to `.env`:

   ```bash
   openssl rand -base64 32   # set as GITHUB_USER_TOKEN_ENCRYPTION_KEY
   ```

Recreate the API and worker after adding the environment key: `docker compose up -d api worker`. A plain restart does not load changed `.env` values.

4. In **Settings → Configuration → GitHub**, save the App ID, client ID and secret, private key and the exact login callback. Turn on **GitHub sign-in**.
5. Restart the API and the worker.

Then a verified GitHub **organization owner** can sign in and create the matching workspace, and grant members access from **Access Control → GitHub members**.

How GitHub sessions behave:

- A GitHub session has an absolute **eight-hour** maximum. Refreshing GitHub tokens never extends a Preflyt session.
- Access evidence expires after **five minutes**, and privileged changes need fresh verification.
- If GitHub is briefly unavailable, existing credentials and your session are kept. A revoked authorization or an expired refresh token means you must sign in again.
- Turning sign-in off hides it from new users. It does not delete links, grants or audit records.

To link an **existing** workspace to a GitHub organization, use **Access Control → GitHub members → Link GitHub organization**. It checks the current workspace Owner and a GitHub organization owner before confirming, keeps your repositories, policies and history, and records the grant in the audit log.

## Single sign-on (OIDC)

1. In your identity provider, register the callback:

   ```text
   <WEB_ORIGIN>/api/auth/callback
   ```

2. In **Settings → Configuration → Single sign-on**, enter the issuer, client ID and client secret, and the callback. All four fields are required together.
3. Restart the API and the worker.
4. Create the first Owner with an out-of-band token. Generate a high-entropy secret, publish its SHA-256 as `BOOTSTRAP_TOKEN_SHA256` in `.env`, and enter the original token on the setup screen at `<WEB_ORIGIN>/setup`.

:::caution Partial configuration blocks startup
If only some OIDC fields are set, or discovery against the issuer fails, startup is blocked. Provide all fields or none. Production requires HTTPS issuer and callback URLs.
:::

An enabled provider is validated at startup, so a wrong value shows up as a failed API start, not as a broken sign-in page later.

## Sessions and cookies

- Production forces secure cookies. Use the same browser hostname throughout: `localhost` and `127.0.0.1` keep separate cookies.
- If the page cannot confirm your session (for example during an API restart), you see **Reconnect to Preflyt** and a **Retry connection** button. Preflyt sends you to sign-in only after a confirmed sign-out or a 401.
- Session validity and revocation come from PostgreSQL, not Redis.
