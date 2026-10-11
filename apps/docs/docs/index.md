---
slug: /
id: index
title: Preflyt Documentation
hide_title: true
sidebar_label: Welcome
description: Preflyt is a self-hosted engineering assessment and governance platform that helps software teams identify security, quality and infrastructure risks before production.
---

import DocsHero from '@site/src/components/DocsHero'

<DocsHero />

![Preflyt Engineering Overview showing repository coverage, pull request assessments, adopted standards and assessment activity.](/img/engineering-overview.png)

Preflyt helps engineering teams identify security, software quality and infrastructure risks earlier in development. It connects the requirements your team defines to the checks your pipeline runs, then provides actionable findings and a traceable readiness result for each assessed commit.

## Why teams use Preflyt

CI pipelines and scanners produce results, but results alone do not establish whether a change meets your team's requirements. Checks can be missing, apply to a different revision, or vary across repositories and branches.

Preflyt gives teams a consistent way to define engineering standards, apply branch-specific policies, verify CI evidence and review issues before release. Developers receive feedback on pull requests; engineering and platform teams gain visibility into unmet requirements and the evidence behind each decision.

You run Preflyt on your own infrastructure with Docker Compose or the Kubernetes application bundle. A GitHub App connects the repositories you select. Your GitHub Actions workflows run the tests and scanners; optional AI reviews use the models and review instructions your organization chooses.

## Features

- **Repository profiles**: languages, frameworks, CI, tests, lockfiles, containers, infrastructure as code and scanner configuration, each backed by file evidence at an exact commit.
- **Engineering standards**: five versioned packs (Baseline Engineering, Application Security, Backend Services, Frontend Applications and Infrastructure as Code) with recommendations based on your stack.
- **Commit assessments**: freeze the standards you selected and the CI results GitHub reported for a commit, so you can compare repositories and revisions over time.
- **CI evidence**: signed GitHub pull request, check and workflow events, plus bounded JUnit and SARIF reports submitted automatically by the Action.
- **Contributors**: who works on which repositories, from pull request and commit activity.
- **AI review skills**: optional, advisory reviews you configure per organization. AI never decides a result.
- **Access control**: GitHub or OIDC sign-in, organizations, teams and eight built-in roles.
- **Notifications**: an in-app inbox and email channels for assessment outcomes.


## From standards to pull request results

Select repositories, review recommended standards, publish a policy for the target branch, and add the Preflyt Action to your workflow. Preflyt evaluates the resulting evidence and publishes **Preflyt / Engineering Readiness** on the pull request. Development and main can have different requirements.

You can begin with inspection and assessments, then enable PR checks and optional merge protection. GitHub blocks merges only when its rules require the check. AI feedback remains advisory and cannot waive a required engineering check.

See [How Preflyt works](concepts/how-preflyt-works.md) for the complete workflow and [Getting Started](getting-started/index.md) to set up your first repository.

## Documentation sections

### Getting Started

- [Quick Start](getting-started/quick-start.md): run Preflyt locally in a few minutes.
- [Connect GitHub](getting-started/connect-github.md): register a GitHub App and link it.
- [Select repositories](getting-started/select-repositories.md): choose what Preflyt may see.
- [Your first report](getting-started/first-assessment.md): see which checks pass, fail or still need results.

### User Guide

- [Overview](user-guide/index.md): how standards, policies, pull request checks and merge protection fit together.
- [Standards](user-guide/standards.md) and [Policies](user-guide/policies.md): decide what your code must meet.
- [Pull request checks](user-guide/pull-request-checks.md) and [Merge Protection](user-guide/merge-protection.md): check every pull request and make GitHub require it.
- [Native execution](user-guide/native-execution.md): optional reviewed execution, with current coverage and acceptance limits.
- [Audit log](user-guide/audit-log.md): paginated activity with scoped actor details and filters.
- [Findings](user-guide/findings.md), [Teams](user-guide/teams.md), [Access Control](user-guide/access-control.md), [AI reviews](user-guide/ai-reviews.md), [Notifications](user-guide/notifications.md) and [Contributors](user-guide/contributors.md).

### Self-Hosting

- [Introduction](self-hosting/index.md): components and requirements.
- [Docker Compose](self-hosting/docker-compose.md): install and run Preflyt with no source code needed.
- [Configuration](self-hosting/configuration.md): what lives in environment variables and what lives in Settings.
- [Authentication](self-hosting/authentication.md): Super Admin, single sign-on and GitHub sign-in.
- [GitHub App](self-hosting/github-app.md): permissions, callbacks and installation.
- [Reverse proxy and TLS](self-hosting/reverse-proxy.md), [Upgrades and backups](self-hosting/upgrades-and-backups.md), [Observability](self-hosting/observability.md), [Kubernetes](self-hosting/kubernetes.md) and [Troubleshooting](self-hosting/troubleshooting.md).

### Concepts

- [How Preflyt works](concepts/how-preflyt-works.md), [Evidence and trust](concepts/evidence-and-trust.md) and [Status labels](concepts/status-labels.md).

## Status of this documentation

Preflyt is under active development. When a capability is not implemented yet, its page says so.
