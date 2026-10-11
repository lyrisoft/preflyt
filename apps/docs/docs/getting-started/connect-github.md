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

## 1. Create the GitHub App

Follow [GitHub App](../self-hosting/github-app.md) to create the App with the right callbacks, permissions and events. Keep these handy:

- App ID,
- Client ID and a client secret,
- the private key (a `.pem` file),
- the webhook secret you chose.

## 2. Save the App in Preflyt

1. Sign in as Super Admin. On the Overview, choose **Configure GitHub**, or open **Settings → Configuration**.
2. In the **GitHub** section, fill in **App ID**, **Client ID**, **Client secret**, **Private key** and **Webhook secret**.
3. Check that **Installation callback URL** and **Login callback URL** match the URLs registered in GitHub.
4. Turn on **GitHub sign-in**. Turn on **GitHub event ingestion** if you have a public URL for webhooks.
5. Choose **Save changes**.
6. Restart the API and worker so they use the new connection:

   ```bash
   docker compose --env-file .env -f docker-compose.yaml -f compose.local.yaml restart api worker
   ```

Secret fields never show a saved value. Leaving one empty keeps what you saved.

**Public Preflyt API URL** is optional at this stage. It is the public HTTPS address of your Preflyt API that GitHub Actions runners use when Preflyt gives you a workflow snippet. GitHub runners cannot reach `localhost`, so leave it empty for a local trial. It applies without a restart.

For GitHub sign-in you also need `GITHUB_USER_TOKEN_ENCRYPTION_KEY` in `.env`. See [Authentication](../self-hosting/authentication.md#github-sign-in).

## 3. Install the App on your organization

In GitHub, open your App's page and choose **Install App**, then pick your organization. You can give it all repositories or a chosen set. Preflyt only works with repositories you additionally **select** inside Preflyt.

## 4. Sign in with GitHub and create the workspace

1. Open Preflyt and sign out of Super Admin.
2. On the sign-in page, choose **Continue with GitHub**.
3. On **Choose your organization**, pick your organization. A GitHub **organization owner** can connect a new workspace. Preflyt verifies that you own the organization.
4. Confirm. You are now the workspace **Owner**.

Other GitHub organization members can sign in once an Owner grants them a role: **Access Control → GitHub members → Assign role**.

:::tip If you use an identity provider instead
Organizations that use OIDC single sign-on follow [Authentication](../self-hosting/authentication.md#single-sign-on-oidc). The **Create legacy workspace** action in **Access Control** exists for existing identity-provider deployments. GitHub workspaces are created through the verified onboarding above.
:::

## Next

[Select repositories](select-repositories.md).
