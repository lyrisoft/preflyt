---
id: community-edition
title: Community Edition
sidebar_label: Community Edition
description: Community scope, licensing, contribution rights and current release preparation status.
---

# Preflyt Community Edition

Preflyt Community Edition is free and self-hosted, with **unlimited repositories** subject to your infrastructure capacity. Original Preflyt code and documentation use Apache-2.0; third-party components retain their own licenses and notices. The separate Preflyt Action is MIT-licensed. The license does not grant product trademark or endorsement rights.

**Public release preparation is in progress.** These source changes have not made the repository or container packages public. Current installation instructions still describe the access needed for the published private images. Do not assume a badge or a license file establishes public package availability or release qualification.

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

## Cloud later

Managed Cloud is planned for later. It would provide managed infrastructure, upgrades, backups, monitoring and support. There is no available Cloud plan, price or SLA promised by this page. Future enterprise modules require a separate scope decision; core security and a useful assurance workflow remain in Community.

## Contributing and support

Contributions use DCO 1.1 sign-off; contributors retain ownership. Read [CONTRIBUTING.md](https://github.com/lyrisoft/preflyt/blob/development/CONTRIBUTING.md), [LICENSE](https://github.com/lyrisoft/preflyt/blob/development/LICENSE), [NOTICE](https://github.com/lyrisoft/preflyt/blob/development/NOTICE) and the [readiness tracker](https://github.com/lyrisoft/preflyt/blob/development/docs/planning/open-source-readiness.md) in the source repository. These links require repository access until public launch and will reflect the files only after these local changes are published.

Community support is best effort. Send private vulnerabilities or conduct reports to **support@lyrisoft.tech**; do not disclose sensitive details in public issues. Supported release ranges and maintainer assignments must be confirmed before launch. No public release/security clearance or contractual support commitment is implied by this preparation.
