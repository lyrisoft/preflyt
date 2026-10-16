---
id: github-app
title: GitHub App
sidebar_label: GitHub App
description: Create and configure the GitHub App Preflyt uses to read repositories, receive webhooks and sign users in.
---

# GitHub App

Preflyt connects to GitHub through a **GitHub App** that you create and own. The App decides what Preflyt can see. Preflyt never asks for a personal access token.

:::note One App is enough
Preflyt uses the same App for reading repositories, publishing pull request checks and managing member access. The same App can also manage rulesets when you grant **Organization administration: Read and write** and enable ruleset activation. A second, separately credentialed **governance App** is optional for deployments that want separate credentials and permissions. Normal onboarding does not require it.
:::

## Recommended: create the App from Preflyt

Sign in as **Super Admin** and open **Settings → Configuration → GitHub → Create your GitHub App**.

1. Enter your GitHub organization and the public HTTPS API URL. With the bundled web proxy, use `<WEB_ORIGIN>/api`.
2. Leave optional capabilities off unless you want Preflyt to **Create setup PRs** or **Manage GitHub rulesets**. The default App can read repositories and workflow results, verify organization membership, and publish checks and advisory PR reviews.
3. Choose **Review App setup**, then **Confirm in GitHub**. GitHub registers the App with Preflyt's permissions, callbacks and webhook settings. Preflyt saves the generated credentials encrypted and continues to installation automatically.
4. Choose your organization and repositories once in GitHub. Confirm GitHub organization ownership when prompted. This verifies the connection; it does not sign you into Preflyt as the GitHub user.
5. Preflyt returns you to **Repositories**, using the same admin account and session, with the selected repositories imported. There is no second installation or required repository selection in Integrations. A new workspace is created only after ownership verification; existing workspace connections require that same admin's workspace permission.

For an App whose credentials are already configured, use **Connect GitHub organization** in Settings or Overview. **App credentials saved** means configuration is ready, not that an organization is connected. A connection is tied to the original browser, session and configured App and expires after ten minutes. GitHub verification credentials are revoked after use; they do not create or link a Preflyt login identity.

New connections follow GitHub's installation repository selection. Newly granted repositories are imported during synchronization. Explicit Preflyt exclusions survive reconnects and synchronization; revoked GitHub repositories become unavailable. Existing deployments retain their earlier explicit-selection behavior until an authorized admin reconnects through this flow. An installation is never transferred between workspaces automatically.

The deployment needs distinct `CONFIGURATION_ENCRYPTION_KEY` and `GITHUB_USER_TOKEN_ENCRYPTION_KEY` values and a configured `QUEUE_REDIS_URL` before registration. Generate them during deployment setup; credentials are not returned to the browser. GitHub confirmation is bound to the original administrator session and expires after 30 minutes. If confirmation cannot be saved, check for the registered App in GitHub before retrying.

An existing App is never replaced by this wizard. Use **Connect an existing App or edit advanced settings** for manual configuration. Add optional permissions to the same App in GitHub and approve its updated installation. Merge protection remains off until explicitly activated, and model routing is preserved.

GitHub sign-in requires expiring user authorization tokens; verify that the newly registered App keeps this GitHub setting enabled.

## Manual setup for an existing App

### 1. Configure the App

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

GitHub cannot deliver webhooks to `localhost`. For local trials, expose your instance through an HTTPS tunnel you control, or leave event ingestion off and inspect repository profiles and create assessments. Without reachable webhooks and a public API, this does not exercise automatic PR checks. There is no manual report-import step in onboarding.

### 2. Set permissions

**Repository permissions**

| Permission | Access | Used for |
| --- | --- | --- |
| Metadata | Read-only | Required by GitHub. Repository discovery. |
| Contents | Read-only | Repository profiles and file evidence. |
| Pull requests | Read and write | Reading pull requests, and posting the optional policy summary and AI review comments. Read-only is enough if you turn those off. |
| Actions | Read-only | Verifying completed GitHub Actions runs. |
| Checks | Read and write | Publishing the **Preflyt / Engineering Readiness** check on pull requests, and reading check results. |

**Organization permissions**

| Permission | Access | Used for |
| --- | --- | --- |
| Members | Read-only | The member directory, GitHub sign-in, role grants and team import. |

**Only if you use the guided setup pull request:** Preflyt can open a pull request that adds the Preflyt workflow to a repository. That needs **Contents**, **Workflows** and **Pull requests** set to **Read and write**. Preflyt never edits your default branch directly. If you prefer, copy the workflow yourself and keep Contents read-only.

**Only if Preflyt manages GitHub organization rulesets:** **Organization administration: Read and write**. Leave it off otherwise. See [Merge Protection](../user-guide/merge-protection.md).

Preflyt uses short-lived installation tokens limited to what each action needs. Installation tokens are never stored in the database or sent to the browser.

### 3. Subscribe to events

Under **Subscribe to events**, select:

| Event | Used for |
| --- | --- |
| **Pull request** | Pull requests and their automatic reports |
| **Check run** | CI check results |
| **Workflow run** | GitHub Actions results |
| **Pull request review** | Contributor activity |
| **Push** | Contributor activity |
| **Organization**, **Team** and **Membership** | Keeping imported GitHub teams and access current. Needs Members read access. |

GitHub also sends authorization-revocation events to every App automatically. Preflyt accepts pull request, check run and workflow run actions it supports and acknowledges the rest without keeping them.

### 4. Generate credentials

On the App page, note the **App ID** and **Client ID**, create a **client secret**, and **generate a private key** (a PEM file). You will paste these into Preflyt.

### 5. Save them in Preflyt

Sign in as Super Admin and open **Settings → Configuration → GitHub**:

1. Enter the App ID, client ID, client secret and the private key. A multi-line PEM can be pasted directly into the secret field.
2. Enter the webhook secret you chose above.
3. Confirm the installation and login callbacks match what you registered in GitHub **exactly**.
4. Turn on **GitHub event ingestion** to start recording webhooks.
5. Optionally set **Public Preflyt API URL**: the public HTTPS address of your API that GitHub Actions runners use for Preflyt workflow snippets. With the bundled web proxy, use `<WEB_ORIGIN>/api`, for example `https://preflyt.example.com/api`. Localhost is rejected. This field applies without a restart.
6. Save. GitHub connection changes apply immediately in the API and within five seconds in the worker; no routine restart is needed.

Callback defaults are derived from `WEB_ORIGIN` only for the one-time import of legacy values. Saved callbacks must match the deployed origin and the App registration.

### 6. Install the App

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

## Verify a fresh registration

Use a fresh deployment or an isolated test instance with its own database, queue and encryption keys. Do not clear an existing App connection to test onboarding.

1. Sign in as Super Admin and open **Settings → Configuration → GitHub**. The page must show **Create your GitHub App**.
2. Enter an organization you own, a unique App name and a reachable public HTTPS API URL. Review the optional setup-PR and ruleset permissions before continuing.
3. Choose **Review App setup → Confirm in GitHub**. If GitHub asks to confirm access, complete the Mobile, passkey or authenticator challenge in the same browser session. This is GitHub's security confirmation, not a Preflyt credential-copying step.
4. Confirm App registration in GitHub. The browser must return to Preflyt and show **Connected**. No App private key, client secret or webhook secret should need manual copying.
5. Install the new App on **only the test repository**. Sign in through GitHub, confirm your organization and select that repository in Preflyt. Its file inspection should complete without running repository code.
6. Check a genuine GitHub webhook delivery and a test PR using the generated workflow. Confirm the delivery is accepted, the PR results use its current commit, and any configured AI review uses the existing model route. Protection must remain off unless separately activated.
7. Record the App name, test repository, date, successful stages and any incomplete stages. Keep secrets, authorization codes and session cookies out of screenshots and reports.

Registration alone does not prove repository access, webhook processing or PR publication. Treat those as separate acceptance steps. The manifest confirmation expires after 30 minutes and is bound to the original Super Admin browser session. If it expires, start again from Preflyt. If GitHub already created the App but Preflyt could not save it, inspect that App before retrying; do not create repeated registrations blindly.

### Live acceptance result

Fresh registration was tested on **2026-10-11** with a private test App installed only on the acceptance repository. GitHub confirmation returned to Preflyt; credentials were saved encrypted automatically. The API used the new connection without restarting. GitHub owner sign-in, workspace creation, explicit repository selection, automatic file inspection and processing of two genuine GitHub check events passed.

This result covers registration and onboarding. It does not establish a new AI review or policy-gated PR publication result. The test used a temporary webhook tunnel; production needs a stable public HTTPS API URL. GitHub required Mobile re-authentication before App creation, and separate approval before installing the App on the selected repository.
