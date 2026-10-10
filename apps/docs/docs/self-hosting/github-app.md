---
id: github-app
title: GitHub App
sidebar_label: GitHub App
description: Create and configure the GitHub App Preflyt uses to read repositories, receive webhooks and sign users in.
---

# GitHub App

Preflyt connects to GitHub through a **GitHub App** that you create and own. The App decides what Preflyt can see. Preflyt never asks for a personal access token.

:::note One App for assessment
This page describes the **assessment App**. Production policy enforcement (rulesets and automatic check publication) uses a **separate, more privileged governance App**. That setup is covered in the [GitHub governance runbook](https://github.com/lyrisoft/preflyt/blob/development/docs/deployment/github-governance-production.md) and is optional.
:::

## 1. Create the App

In GitHub, open your organization's **Settings → Developer settings → GitHub Apps → New GitHub App**, then set:

| Field | Value |
| --- | --- |
| GitHub App name | A name you choose, for example `Preflyt (Acme)` |
| Homepage URL | Your `WEB_ORIGIN` |
| Callback URL | `<WEB_ORIGIN>/api/github/oauth/callback` and, to allow GitHub sign-in, `<WEB_ORIGIN>/api/auth/github/callback` |
| Expire user authorization tokens | **Enabled** (needed for GitHub sign-in) |
| Request user authorization (OAuth) during installation | **Disabled** |
| Setup URL | `<WEB_ORIGIN>/api/github/setup/callback` |
| Webhook: Active | **Enabled** |
| Webhook URL | `<WEB_ORIGIN>/api/github/webhooks` |
| Webhook secret | A random string of at least 32 characters: `openssl rand -hex 32` |

:::warning Leave "Request user authorization during installation" off
Preflyt runs its own state- and PKCE-bound authorization step after installation and checks that the installing GitHub user can access the installation. Enabling GitHub's option interferes with that flow.
:::

GitHub cannot deliver webhooks to `localhost`. For local trials, expose your instance through an HTTPS tunnel you control, or skip webhooks and use repository profiles and manual evidence.

## 2. Set permissions

**Repository permissions**

| Permission | Access | Used for |
| --- | --- | --- |
| Metadata | Read-only | Required by GitHub. Repository discovery. |
| Contents | Read-only | Repository profiles and file evidence. |
| Pull requests | Read-only | Pull request events. |
| Checks | Read-only | Check run results as CI evidence. |
| Actions | Read-only | Workflow run results as CI evidence. |

**Organization permissions**

| Permission | Access | Used for |
| --- | --- | --- |
| Members | Read-only | The member directory, GitHub sign-in and role grants. |

**Optional**: grant **Checks: Read and write** if you want Preflyt to publish a readiness check on pull requests. No write permission is needed for profiles, assessments or CI evidence.

Preflyt uses short-lived installation tokens scoped to what each action needs. Installation tokens are never stored in the database or sent to the browser.

## 3. Subscribe to events

Under **Subscribe to events**, select:

- **Pull request**
- **Check run**
- **Workflow run**

Preflyt accepts these actions: pull requests (opened, reopened, synchronize, edited, closed, ready for review), check runs (created, completed, rerequested) and workflow runs (requested, in progress, completed). Other events are acknowledged and not retained.

## 4. Generate credentials

On the App page, note the **App ID** and **Client ID**, create a **client secret**, and **generate a private key** (a PEM file). You will paste these into Preflyt.

## 5. Save them in Preflyt

Sign in as Super Admin and open **Settings → Configuration → GitHub**:

1. Enter the App ID, client ID, client secret and the private key. A multi-line PEM can be pasted directly into the secret field.
2. Enter the webhook secret you chose above.
3. Confirm the installation and login callbacks match what you registered in GitHub **exactly**.
4. Turn on **GitHub event ingestion** to start recording webhooks.
5. Save, then **restart the API and worker**.

Callback defaults are derived from `WEB_ORIGIN` only for the one-time import of legacy values. Saved callbacks must match the deployed origin and the App registration.

## 6. Install the App

Install the App on your organization, then continue with [Connect GitHub](../getting-started/connect-github.md) and [Select repositories](../getting-started/select-repositories.md).

## How webhook deliveries are handled

Every delivery is verified with HMAC-SHA256 over the original bytes before anything else happens, and stored before Preflyt answers.

| Response | Meaning |
| --- | --- |
| `202` accepted | Verified and recorded. |
| `202` with `accepted:false` | Unsupported event or action, or a repository that is not selected. Not retained. |
| `401` | Invalid signature. Check that the webhook secret matches on both sides. |
| `409` | A delivery ID was reused with different bytes. |
| `413` | Body over 1 MiB. |
| `503` | Event ingestion is off or not configured. |

Preflyt keeps identifiers, the exact head commit, status, timestamps, the delivery ID and payload digest. It discards raw bodies, pull request text, CI logs, sender details, tokens and arbitrary URLs.
