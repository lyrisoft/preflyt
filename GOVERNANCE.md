# Preflyt Community Edition governance

Lyrisoft Technologies Limited stewards Preflyt Community Edition. Community scope is recorded in the [readiness plan](docs/planning/open-source-readiness.md). Managed Cloud is a future offering; Community has no artificial repository cap and does not require a paid AI model.

## Decisions and review

Maintainers review scope, technical design, security, compatibility and license obligations. Contributors can propose changes through issues and pull requests. Discuss substantial architecture/product changes first and record accepted decisions under `docs/architecture/`. Record material Community scope changes publicly when the project launches; do not silently turn promised core features into paid requirements.

A passing CI run does not authorize merging, releasing or changing GitHub rules. Reviews must consider tenant boundaries, commit-bound evidence, isolation and the contribution's rights. Approvers must consider conflicts of interest. Security and conduct matters use the private contacts in their respective policies.

## Contributions and rights

Contributions require the [DCO](DCO) sign-off described in [CONTRIBUTING.md](CONTRIBUTING.md). Contributors keep copyright. No CLA or copyright assignment is required. Original accepted contributions use Apache-2.0; third-party licenses remain applicable. Proprietary future modules must be separately defined without withdrawing rights to already released Community code.

## Maintainers and releases

**@iampeters** is the sole maintainer, default CODEOWNERS reviewer and security/conduct triage contact. The owner confirmed on 16 October 2026 that there is no backup maintainer and that **support@lyrisoft.tech** receives reports. GitHub administrator access for @iampeters was verified that day. Community support and security response are best effort and may be delayed when the maintainer is unavailable.

Require DCO and automated checks for contributions and prevent force pushes to release branches. A sole maintainer cannot approve their own PR, so do not claim independent review or configure an impossible self-approval requirement. Contributor PRs should receive maintainer review; maintainer-authored changes must still pass the checks and record their rationale. Add independent required review when another maintainer joins. CODEOWNERS does not grant permissions or enforce review by itself. Required-check enforcement must be verified in the launch repository after the workflows are published.

Release maintainers qualify a specific source revision and image digests, retain verification and license evidence, publish release notes/known limitations, and obtain the [release go/no-go](docs/planning/open-source-readiness.md#7-release-decision-checklist). Public visibility and publication require separate explicit authorization. Security patches and supported-version policy belong in [SECURITY.md](SECURITY.md).

Community contributions are welcome after launch; review turnaround and acceptance are not guaranteed. Paid support or Cloud commitments exist only under separate agreements.
