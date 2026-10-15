---
id: connect-github
title: Connect GitHub
sidebar_label: Connect GitHub
description: Create a GitHub App, save it in Preflyt, install it on your organization and create your workspace.
---

# Connect GitHub

Preflyt reads your repositories through a GitHub App that you own. This page connects the App and creates your workspace.

:::note Public URL needed for webhooks
GitHub cannot call `localhost`. You can complete every step below locally and use repository profiles and assessments without webhooks. To receive pull request and CI events you need a public HTTPS URL, either a real deployment or a tunnel you control.
:::

## 1. Create or connect the GitHub App

Sign in as **Super Admin**. On Overview choose **Configure GitHub**, or open **Settings → Configuration → GitHub**.

For a new deployment, choose **Create your GitHub App**:

1. Enter your GitHub organization and public HTTPS API URL. With the bundled web proxy, use `https://preflyt.example.com/api`.
2. Enable **Create setup PRs** if you want Preflyt to propose workflow changes. Enable **Manage GitHub rulesets** only if you want Preflyt-managed protection.
3. Choose **Review App setup**, then **Confirm in GitHub**. GitHub may require a fresh security confirmation (GitHub Mobile, passkey or authenticator). Complete it in the same browser tab, review the App details, and confirm registration. Preflyt supplies the callbacks, permissions and webhook settings.
4. App credentials are stored encrypted automatically, and installation continues in GitHub. The API and worker refresh without a restart. Merge protection remains off until explicitly activated.

See [GitHub App setup](../self-hosting/github-app.md) for deployment prerequisites and permissions.

## 2. Existing Apps and local trials

An App already connected to Preflyt does not need to be replaced. Add optional permissions to that same App in GitHub and approve its updated installation.

For an App created manually, expand **Connect an existing App or edit advanced settings**. Save its App ID, client ID, client secret, private key, webhook secret and exact callbacks. Enable GitHub sign-in and event ingestion as needed. Saved GitHub connection changes refresh automatically; no routine restart is needed.

The **Public Preflyt API URL** must be reachable by GitHub Actions and webhooks. Localhost works for a profiles-only trial, but cannot receive GitHub's webhook calls. Use a public HTTPS tunnel for live Action tests.

The Quick Start includes distinct `CONFIGURATION_ENCRYPTION_KEY`, `GITHUB_USER_TOKEN_ENCRYPTION_KEY` and `AI_PROVIDER_ENCRYPTION_KEY` values. If an older deployment is missing a key, add it to deployment secrets and run `docker compose up -d api worker` to recreate the services. A plain restart does not reload `.env`.

## 3. Install the App on your organization

After App registration, continue the installation in the same browser. If App credentials were already saved, use **Connect GitHub organization** in Settings or Overview. Pick the organization and its repositories in GitHub. This is the initial repository selection; you do not repeat it in Integrations.

## 4. Confirm ownership and return to your workspace

1. When GitHub requests authorization, confirm with a GitHub **organization owner**. Preflyt uses that authorization only to verify the installation and ownership.
2. Preflyt creates the workspace, imports the selected repositories and opens **Repositories** automatically. Your original admin identity and session remain unchanged. An existing workspace requires the initiating admin to have permission there; an installation is never moved from another workspace automatically.
3. Keep using the admin account. There is no sign-out or separate GitHub sign-in step to finish connection. Ordinary team members can still use **Continue with GitHub** to sign in separately once access is granted.

Other GitHub organization members can sign in once an Owner grants them a role: **Access Control → GitHub members → Assign role**.

:::tip If you use an identity provider instead
Organizations that use OIDC single sign-on follow [Authentication](../self-hosting/authentication.md#single-sign-on-oidc). The **Create legacy workspace** action in **Access Control** remains available for existing identity-provider deployments. The installation flow preserves existing workspaces and their authorized admin session.
:::

## Existing workspace

If your workspace already has repositories and policies, its Owner should use **Access Control → GitHub members → Link GitHub organization** after GitHub sign-in is configured. This preserves the workspace and its history. Do not create a second workspace to migrate an existing one. See [Authentication](../self-hosting/authentication.md#github-sign-in).

## Next

[Manage repositories and start an assessment](select-repositories.md).

For a new self-hosted deployment, the Super Admin can create the App through **Settings → Configuration → GitHub** using the guided registration flow. See [GitHub App setup](../self-hosting/github-app.md). Existing Apps use the same connection flow and do not need to be replaced.
