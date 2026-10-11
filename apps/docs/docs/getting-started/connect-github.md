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
4. Return to Preflyt. App credentials are stored encrypted automatically, and the API and worker refresh without a restart. Merge protection remains off until explicitly activated.

See [GitHub App setup](../self-hosting/github-app.md) for deployment prerequisites and permissions.

## 2. Existing Apps and local trials

An App already connected to Preflyt does not need to be replaced. Add optional permissions to that same App in GitHub and approve its updated installation.

For an App created manually, expand **Connect an existing App or edit advanced settings**. Save its App ID, client ID, client secret, private key, webhook secret and exact callbacks. Enable GitHub sign-in and event ingestion as needed. Saved GitHub connection changes refresh automatically; no routine restart is needed.

The **Public Preflyt API URL** must be reachable by GitHub Actions and webhooks. Localhost works for a profiles-only trial, but cannot receive GitHub's webhook calls. Use a public HTTPS tunnel for live Action tests.

The Quick Start includes distinct `CONFIGURATION_ENCRYPTION_KEY` and `GITHUB_USER_TOKEN_ENCRYPTION_KEY` values. If an older deployment is missing either key, add it to deployment secrets and run `docker compose up -d api worker` to recreate the services. A plain restart does not reload `.env`.

## 3. Install the App on your organization

In GitHub, open your App's page and choose **Install App**, then pick your organization. You can give it all repositories or a chosen set. Preflyt only works with repositories you additionally **select** inside Preflyt.

## 4. Sign in with GitHub and create the workspace

1. Open Preflyt and sign out of Super Admin.
2. On the sign-in page, choose **Continue with GitHub**.
3. On **Choose your organization**, choose **Connect organization** for your organization. A GitHub **organization owner** can connect a new workspace. Preflyt verifies that you own the organization.
4. After verification succeeds, Preflyt opens the workspace with your **Owner** role.

Other GitHub organization members can sign in once an Owner grants them a role: **Access Control → GitHub members → Assign role**.

:::tip If you use an identity provider instead
Organizations that use OIDC single sign-on follow [Authentication](../self-hosting/authentication.md#single-sign-on-oidc). The **Create legacy workspace** action in **Access Control** exists for existing identity-provider deployments. GitHub workspaces are created through the verified onboarding above.
:::

## Existing workspace

If your workspace already has repositories and policies, its Owner should use **Access Control → GitHub members → Link GitHub organization** after GitHub sign-in is configured. This preserves the workspace and its history. Do not create a second workspace to migrate an existing one. See [Authentication](../self-hosting/authentication.md#github-sign-in).

## Next

[Select repositories](select-repositories.md).

For a new self-hosted deployment, the Super Admin can create the App through **Settings → Configuration → GitHub** using the guided registration flow. See [GitHub App setup](../self-hosting/github-app.md). Existing Apps use the same connection flow and do not need to be replaced.
