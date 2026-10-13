# Preflyt Open-Source Readiness Plan

**Status:** Deferred / future planning document — **not authorization to make the repository public**
**Owner:** Lyrisoft Technologies Limited
**Target:** A secure, legally compliant, maintainable public-source release when explicitly approved.

## Objective

Prepare Preflyt for eventual public open-source development and self-hosted distribution without disrupting ongoing P0–P12 delivery. **Do not change GitHub repository visibility, publish artifacts, rotate production secrets, or alter licenses based solely on this plan.** All such actions require a separate review and authorization.

## 1. Licensing and intellectual property

- Evaluate Apache-2.0 (preferred candidate), MIT and AGPL-3.0 against adoption and commercial strategy; obtain appropriate ownership/legal approval before selecting.
- Verify Lyrisoft owns or has appropriate rights to license original code, contributions, documentation, marks and product assets.
- Audit imported Shadcn Admin source at the pinned upstream revision, customized components, assets, fonts, license notices and third-party redistribution obligations.
- Add `LICENSE` and `NOTICE` where required. Document license and attribution for vendored source.
- Decide DCO versus CLA and any future open-core boundaries before accepting outside contributions.

## 2. Security and privacy release gate

- Scan **current files and full Git history**, including reachable branches/tags and public references, for credentials, private keys, GitHub App secrets, OIDC client secrets, AI provider keys, internal endpoints and confidential content.
- Revoke/rotate exposed secrets immediately through the relevant provider; history rewriting is not a substitute for revocation and may not remove external copies.
- Audit `.env.example`, Docker Compose, build logs, fixtures, screenshots, documentation and telemetry defaults for leakage.
- Review GitHub Actions/workflows, permissions, forked PR execution, artifact publishing, dependency supply chain, container privileges and sandbox boundaries.
- Establish `SECURITY.md`, private vulnerability disclosure and patch/incident response ownership.
- Record findings, severity, responsible owner, mitigation evidence and an explicit go/no-go decision.

## 3. Community and governance files

Prepare:

- `CONTRIBUTING.md`: setup, build/test, issue/PR workflow, engineering policies, code review.
- `CODE_OF_CONDUCT.md`: community conduct and reporting.
- `SECURITY.md`: supported versions, responsible disclosure and security contacts.
- `GOVERNANCE.md`: maintainer roles, decision process, releases and contribution rights.
- `SUPPORT.md`: community vs commercial support expectations.
- `CHANGELOG.md`, release notes, `.github/CODEOWNERS`, issue templates and PR template.
- Accurate README distinguishing implemented features from P0–P12 plans; never market unimplemented CLI, Operator, k6 or AI capabilities as released.

## 4. Self-hosting and distribution

- Validate a clean deployment using published, pinned versioned images, `.env.example` and `docker compose up -d`, with no Node/Postgres/Redis host installation.
- Document external GitHub App, OIDC and model credentials, migration, persistence, backups, upgrades, rollback, observability and troubleshooting.
- Publish container images and verify unauthenticated public pull access, SBOM/provenance, vulnerability scans and reproducible builds.
- Publish Helm/Operator installation instructions **only after those components are actually implemented and tested**.
- Ensure open-source evaluation works without paid AI models; explain which external credentials are needed.

## 5. Public development process

- Protect `main` and `development`; require PR review and passing checks; restrict publish/release credentials.
- Define versioning, release tags, signed artifacts where practical, maintainer ownership and security response process.
- Triage public issues and document support scope, roadmap governance and acceptable contribution standards.
- Consider public development release **before** stable MVP only after audit approval, with accurate alpha/beta labels.
- Consider stable MVP release after P0–P3 acceptance, not as a prerequisite to making source public.

## 6. Optional commercial strategy

Assess a genuinely useful Apache-licensed core and optional managed hosting, support, SLAs or separately defined enterprise features. Do not remove already-promised open-source core features without an explicit product/license decision. Avoid describing a source-available, use-restricted license as OSI-approved open source.

## 7. Readiness checklist

- [ ] License and intellectual-property ownership approved.
- [ ] Imported source and all bundled assets/dependencies license-audited.
- [ ] Current repository and history security-reviewed; exposures rotated/remediated.
- [ ] CI for untrusted public contributions and publishing permissions hardened.
- [ ] Security disclosure and community governance documents published.
- [ ] Clean self-hosted installation and upgrade/rollback tested.
- [ ] Public container image access, provenance and security scans validated.
- [ ] Documentation accurately separates shipped vs planned capabilities.
- [ ] Maintainers, contribution process and support expectations assigned.
- [ ] Explicit owner-approved go/no-go decision recorded **before** repository visibility changes.

## Future execution workflow

1. Create an **Open-Source Readiness Audit** issue when leadership authorizes preparation.
2. Review the actual current repository, dependencies, vendored source, Git history, workflows and distribution pipeline; document evidence-backed gaps.
3. Create separate remediation issues/PRs for findings; do not combine public visibility changes with security remediation.
4. Validate the full checklist and obtain legal/security/maintainer sign-off.
5. Only then authorize repository visibility change and public release communication.

**Current status:** Planning only. No audit has been performed by creating this document.
