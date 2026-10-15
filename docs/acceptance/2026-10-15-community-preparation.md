# Community Edition local preparation — 15 October 2026

## Authorized decisions

The owner selected Apache-2.0 for original Community code/documentation, DCO 1.1 contributions, support@lyrisoft.tech for private security/conduct reports and @iampeters as default CODEOWNERS reviewer. Community is self-hosted with unlimited repositories and the agreed core assurance features; Cloud remains a later service.

## Implemented locally

- Canonical Apache license and DCO text, NOTICE, third-party notice index and package license metadata. Existing upstream licenses are preserved.
- Contribution instructions with per-commit author-matching sign-off, security/conduct/support policies, governance, unreleased changelog, issue forms, PR template and CODEOWNERS.
- Metadata-only DCO workflow with read permissions, no checkout, commit-range and PR-head checks. No automatic sign-off, history rewrite, push or bot exemption.
- Explicit `persist-credentials: false` on checked-in checkout steps.
- Existing notices copied into API-derived and web image definitions. Legal-file changes now count as development image inputs.
- Application Bake targets request SBOM and maximum-mode provenance through `attest`; existing automation regression expectations updated, not run. Optional native publishing retains its existing load/push behavior, with attestation preservation documented as pending.
- Community README/docs page and sidebar entry, source licensing wording, updated readiness tracker, release runbook and candidate evidence template.

Official text sources: https://www.apache.org/licenses/LICENSE-2.0.txt and https://developercertificate.org/. Application attestation configuration follows https://docs.docker.com/build/bake/reference/#targetattest.

## Verification boundary

Static review only: package JSON parsed, embedded DCO Python parsed without execution, and diff whitespace reviewed. No test suite, build, scanner, Docker deployment, workflow or migration ran. No commit, push, publication, repository/package visibility change, branch-rule change or outbound message occurred. New automation and image changes remain unverified by execution. Earlier local product fixes remain in the working tree and are not certified by this preparation.

## Remaining release requirements

Ownership and exact third-party redistribution clearance; full reachable-history/current-tree/log/artifact/cache exposure review; public-contribution CI trust audit; mailbox delivery/triage and backup maintainer; reviewer permissions and required DCO/code-owner rules; supported security versions; final-candidate local/live onboarding, Health, CI/coverage, optional BYOK, upgrade/recovery acceptance; actual attestation/vulnerability/signing evidence; anonymous image access on both platforms after separately authorized publication; and owner-approved public launch.

The [readiness plan](../planning/open-source-readiness.md) remains the closure tracker. Local files do not make these requirements complete.
