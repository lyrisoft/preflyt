---
id: community-edition
title: Community Edition
sidebar_label: Community Edition
description: Open source, self-hosted engineering assurance with Apache-2.0 licensing and unlimited repositories.
---

# Preflyt Community Edition

Preflyt Community Edition is open source and self-hosted, with **unlimited repositories** subject to your infrastructure capacity. Original Preflyt code and documentation use Apache-2.0; third-party components retain their own licenses and notices. The separate Preflyt Action is MIT-licensed. The license does not grant product trademark or endorsement rights.

Install Community Edition with the [Quick Start](../getting-started/quick-start.md) or follow the [production Docker Compose guide](docker-compose.md). Container images are distributed through GHCR; no subscription, license key or registry sign-in is required.

## Included scope

- GitHub integration, repository discovery and profiles.
- Built-in Health scanning with recorded scope, completeness and findings.
- Versioned standards, branch policies, verified CI evidence and PR feedback.
- Basic merge protection, explicitly activated in GitHub.
- Findings, source context and saved assessment history.
- Teams, organization/repository access controls, useful audit history and notifications.
- Optional BYOK AI reviews, finding guidance and review skills; a paid model is not required for deterministic assurance.
- Existing contributor activity views and their evidence limits.

Community is not limited to one repository and has no subscription/license-key requirement. Operators provide infrastructure, GitHub App configuration, a reachable HTTPS endpoint for GitHub webhooks/Actions and optional provider credentials. [Docker Compose](docker-compose.md) describes the supported normal installation, including the Health scanner and separate engine.

Optional [native execution](../user-guide/native-execution.md) requires a separately reviewed runtime and is not production-qualified by a successful Health scan. Missing required evidence remains incomplete; AI cannot override checks or authorize merging.

## Cloud

Preflyt Cloud is coming soon. Community Edition remains available for self-hosting.

## Contributing

Contributions use DCO 1.1 sign-off; contributors retain ownership. See the project's [contributing guide](https://github.com/lyrisoft/preflyt/blob/main/CONTRIBUTING.md), [Code of Conduct](https://github.com/lyrisoft/preflyt/blob/main/CODE_OF_CONDUCT.md), [Apache-2.0 license](https://github.com/lyrisoft/preflyt/blob/main/LICENSE) and [third-party notices](https://github.com/lyrisoft/preflyt/blob/main/THIRD_PARTY_NOTICES.md).

Report bugs and propose improvements in [GitHub Issues](https://github.com/lyrisoft/preflyt/issues). Include the Preflyt version, deployment method and steps to reproduce; remove secrets and personal information from logs or screenshots.

## Support and security

Community support is best effort. Security fixes target the latest stable Community release; older releases have no promised backports. See [SECURITY.md](https://github.com/lyrisoft/preflyt/blob/main/SECURITY.md) for the supported-version policy and private reporting process.

Send security vulnerabilities and Code of Conduct reports privately to **support@lyrisoft.tech**. Do not publish sensitive details in issues. Operators remain responsible for infrastructure, upgrades, backups and access controls.
