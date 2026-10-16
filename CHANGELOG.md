# Changelog

## Unreleased — Community Edition preparation

These are local preparation changes, not a public release or a claim that verification passed.

- Adopt Apache-2.0 for original Preflyt Community Edition code/documentation, retaining upstream licenses and notices.
- Define unlimited self-hosted repositories and the complete core assurance workflow; managed Cloud remains a future offering.
- Add DCO contribution sign-off, governance, security/support contacts, conduct policy and issue/PR templates.
- Prepare metadata-only DCO checks, disable persisted checkout credentials, package current license notices and request application SBOM/provenance attestations; registry attestation verification remains a release requirement.
- Track ownership, scanner/dependency redistribution, exposure review, public image access and final-release acceptance as release requirements. @iampeters is the sole maintainer; the support mailbox is owner-confirmed.
- Patch excessive recursion in braces 3.0.3 through a frozen, hash-bound pnpm patch, with depth/cycle and normal-glob regressions.
- Exclude the unused proprietary Semgrep engine from final CE scanner layers; retain scanner license/source notices and generate installed runtime/web dependency notice bundles.
- Add read-only fork verification and community/docs checks, plus scheduled dependency updates. Repository Actions defaults are read-only and workflow PR approvals are disabled.

Previously published private release notes remain in [GitHub Releases](https://github.com/lyrisoft/preflyt/releases). Their publication does not imply Community release clearance. Add dated Community release entries only when a qualified release is actually published.
