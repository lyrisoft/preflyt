# Preflyt Community Edition governance

Lyrisoft Technologies Limited stewards Preflyt Community Edition. Community scope is recorded in the [readiness plan](docs/planning/open-source-readiness.md). Managed Cloud is a future offering; Community has no artificial repository cap and does not require a paid AI model.

## Decisions and review

Maintainers review scope, technical design, security, compatibility and license obligations. Contributors can propose changes through issues and pull requests. Discuss substantial architecture/product changes first and record accepted decisions under `docs/architecture/`. Record material Community scope changes publicly when the project launches; do not silently turn promised core features into paid requirements.

A passing CI run does not authorize merging, releasing or changing GitHub rules. Reviews must consider tenant boundaries, commit-bound evidence, isolation and the contribution's rights. Approvers must consider conflicts of interest. Security and conduct matters use the private contacts in their respective policies.

## Contributions and rights

Contributions require the [DCO](DCO) sign-off described in [CONTRIBUTING.md](CONTRIBUTING.md). Contributors keep copyright. No CLA or copyright assignment is required. Original accepted contributions use Apache-2.0; third-party licenses remain applicable. Proprietary future modules must be separately defined without withdrawing rights to already released Community code.

## Maintainers and releases

The project owner selected **@iampeters** as the default CODEOWNERS reviewer on 15 October 2026. Private security and conduct reports go to **support@lyrisoft.tech**. Before public launch, verify the reviewer has the necessary repository access, configure required-review/branch rules, and assign security triage and a backup maintainer/contact. CODEOWNERS names a reviewer; it does not grant GitHub permissions or enforce review by itself.

Release maintainers qualify a specific source revision and image digests, retain verification and license evidence, publish release notes/known limitations, and obtain the [release go/no-go](docs/planning/open-source-readiness.md#7-release-decision-checklist). Public visibility and publication require separate explicit authorization. Security patches and supported-version policy belong in [SECURITY.md](SECURITY.md).

Community contributions are welcome after launch; review turnaround and acceptance are not guaranteed. Paid support or Cloud commitments exist only under separate agreements.
