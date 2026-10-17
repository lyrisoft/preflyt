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

## Release notifications and What’s new

The installed app shows its build version in the sidebar. Select it to open **What’s new**, read published release notes and follow the upgrade guide. Administrators see an amber indicator when a newer qualified release is available. Opening the panel marks the current notes as read for your user; it does not dismiss an available upgrade.

Preflyt checks GitHub’s public release metadata at startup and every 12 hours. Results are cached in the installation database and shared by API replicas. Checks send no installation identifier, user details, repository details, source code or findings. They require outbound HTTPS access to `api.github.com`. Offline installations keep the last successful result and display the check time and failure state. A private release repository cannot be checked anonymously.

Workspace Owners and Admins can choose **Check for updates**. Manual requests share a one-minute cooldown; failed checks back off for one hour. Deployment administrators can open **Update preferences** to disable automatic checks or include prereleases. Stable releases are selected by default. Release notes are available to all signed-in users.

Upgrade notices require a published release marked ready by Preflyt’s production publication workflow after all required images are verified. A tag or an unqualified release alone does not produce an upgrade notice. Existing releases without that marker can still appear as release notes. Local images and development builds are labeled **Development**, with the source commit when available, and do not claim to be an installed stable release.

Upgrades remain manual. Review the release notes, back up your database and follow the installation/upgrade instructions before replacing images. The panel never runs Docker commands or applies database changes.

## Optional installation reporting

Reporting is enabled by default and disclosed to deployment administrators, who can turn it off in **Settings → Configuration → Installation reporting**. To prevent the first report, set `PREFLYT_INSTALLATION_REPORTING_ENABLED=false` before startup. Reports contain only a random installation ID, Preflyt version, deployment type and schema version; no names, emails, repository identities, source code or findings are included. No report is sent until a receiver URL is configured. This is independent of the release checker and OpenTelemetry. See the [configuration reference](configuration.md#optional-installation-reporting) for details and retention.

Country-level installation reporting is a separate administrator setting under **Settings → Configuration → Installation reporting** and is off by default. If enabled, the receiver uses a local database to keep only the country code, without storing the IP address. Set `PREFLYT_INSTALLATION_COUNTRY_REPORTING_ENABLED=false` to enforce off before startup. Unknown countries remain unknown. Turning it off clears the stored country on the next accepted report; if all reporting is disabled, previous collected data expires after 90 days of inactivity.
