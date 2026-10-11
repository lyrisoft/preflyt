---
id: index
title: Getting Started
sidebar_label: Overview
description: The path from a fresh install to your first commit assessment.
---

# Getting Started

This section takes you from nothing to a first report on one of your repositories.

```mermaid
flowchart LR
  A[1. Run Preflyt] --> B[2. Create and configure<br/>the GitHub App]
  B --> C[3. Install the App<br/>and sign in]
  C --> D[4. Select repositories]
  D --> E[5. Create your<br/>first report]
```

1. [Quick Start](quick-start.md): run a local instance and sign in as Super Admin.
2. [Connect GitHub](connect-github.md): create the GitHub App, save it in Preflyt and sign in with GitHub.
3. [Select repositories](select-repositories.md): choose what Preflyt may read.
4. [Your first report](first-assessment.md): one click from the Overview, or step by step.

:::info Who does what
- A **Super Admin** (the recovery account from your `.env`) configures the deployment: GitHub App credentials, sign-in and notifications.
- A **GitHub organization owner** signs in with GitHub and creates the workspace.
- Workspace **Owners and Admins** select repositories, adopt standards and create assessments.
- Other members can view results.
:::

If you only want to evaluate Preflyt on one machine, follow the pages in order. For a real deployment, do the [Self-Hosting](../self-hosting/index.md) setup first.
