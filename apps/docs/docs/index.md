---
slug: /
id: index
title: Preflyt Documentation
sidebar_label: Welcome
description: Self-hosted Shift Left platform that profiles GitHub repositories, applies versioned engineering standards and records commit-pinned assessments with CI evidence.
---

# Preflyt Documentation

Welcome to the Preflyt documentation. **Preflyt gives engineering teams confidence before production**: it shows which engineering checks apply to each repository, whether the evidence for them is trustworthy, and where the gaps are, at an exact commit.

Preflyt is **self-hosted**. You run it on your own infrastructure with Docker Compose or Kubernetes, and it connects to your GitHub organization through a GitHub App.

:::info Observe mode
Preflyt currently **observes and records**. It reads repository configuration and imports CI results from GitHub; it does not run your tests or scanners as part of the default install, and it does not block merges on its own. [Concepts](concepts/how-preflyt-works.md) explains exactly what that means.
:::

## Features

- **Repository profiles**: languages, frameworks, CI, tests, lockfiles, containers, infrastructure as code and scanner configuration, each backed by file evidence at an exact commit.
- **Engineering standards**: five versioned packs (Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code) with recommendations based on your stack.
- **Commit assessments**: freeze the standards you selected and the CI results GitHub reported for a commit, so you can compare repositories and revisions over time.
- **CI evidence**: signed GitHub pull request, check and workflow events, plus bounded JUnit and SARIF report imports.
- **Contributors**: who works on which repositories, from pull request and commit activity.
- **AI review skills**: optional, advisory reviews you configure per organization. AI never decides a result.
- **Access control**: GitHub or OIDC sign-in, organizations, teams and eight built-in roles.
- **Notifications**: an in-app inbox and email channels for assessment outcomes.

## Quick start

You need Docker with Compose v2. This starts a local demonstration instance on `http://localhost:8080`:

```bash
git clone https://github.com/lyrisoft/preflyt.git
cd preflyt
```

Then follow the [Quick Start](getting-started/quick-start.md) to create the environment file and start the stack.

## Documentation sections

### Getting Started

- [Quick Start](getting-started/quick-start.md): run Preflyt locally in a few minutes.
- [Connect GitHub](getting-started/connect-github.md): register a GitHub App and link it.
- [Select repositories](getting-started/select-repositories.md): choose what Preflyt may see.
- [Your first assessment](getting-started/first-assessment.md): profile a repository, adopt standards and record a snapshot.

### Self-Hosting

- [Introduction](self-hosting/index.md): components and requirements.
- [Docker Compose](self-hosting/docker-compose.md): install, start and verify.
- [Configuration](self-hosting/configuration.md): what lives in environment variables and what lives in Settings.
- [Authentication](self-hosting/authentication.md): Super Admin, single sign-on and GitHub sign-in.
- [GitHub App](self-hosting/github-app.md): permissions, callbacks and installation.
- [Reverse proxy and TLS](self-hosting/reverse-proxy.md), [Upgrades and backups](self-hosting/upgrades-and-backups.md), [Observability](self-hosting/observability.md), [Kubernetes](self-hosting/kubernetes.md) and [Troubleshooting](self-hosting/troubleshooting.md).

### Concepts

- [How Preflyt works](concepts/how-preflyt-works.md), [Evidence and trust](concepts/evidence-and-trust.md) and [Status labels](concepts/status-labels.md).

## Status of this documentation

Pages are marked <span className="badge-status badge-available">Available</span> or <span className="badge-status badge-planned">Planned</span>. Preflyt is under active development; where a capability is not implemented yet, the page says so rather than describing it as if it shipped.

## Quick links

- [GitHub repository](https://github.com/lyrisoft/preflyt)
- [llms.txt](pathname:///preflyt/llms.txt) for AI assistants
