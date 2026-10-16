# Community candidate audit and local deployment — 15 October 2026

**Decision: local evaluation is qualified; public release remains on hold.** This audit covers the uncommitted working tree based on `9a840b7`. It does not certify legal ownership or constitute an independent penetration test. No commit, push, publication or visibility change was made.

## Executed checks

| Check | Result |
| --- | --- |
| API generation and isolated database migrations | Passed |
| Full API suite | 1,736 passed; one cross-repository case skipped by the default invocation |
| Exact published Action v2.1.1 contract suite (`f05b72d`) | 4 passed, including that skipped case; 1,737 unique API cases covered across both runs |
| Full Chromium web suite | 609 passed across 85 files; coverage emitted |
| API, web and docs typechecks; web lint and formatting | Passed |
| API build; web build/prerender; docs production build | Passed |
| Node CI automation | 28 passed |
| Python CI automation, including metadata-only DCO workflow regressions | 16 passed |
| Linux OCI packaging regressions | 2 passed using GNU tar in a Linux container |
| Frozen dependency installation | Passed with release-age, strict peers and no-trust-downgrade protections retained |
| Dependency advisory audit | **Not clean:** one high upstream advisory remains, described below |
| Documentation Compose startup with local images and no pulls | Passed; all persistent services healthy, initialization/migration jobs exited successfully |
| Packaged Health scanner acceptance | Passed: eight analyzers, generated finding, signed result verification and source cleanup |
| Live Compose HTTP/auth smoke | Passed: web/API readiness, SPA routing, anonymous restrictions, dotfile rejection, wrong-origin rejection, admin sign-in and logout |

Web coverage: statements 61.99%, branches 60.42%, functions 53.38%, lines 62.57%. Coverage numbers describe this run, not a release threshold or an update to a remote Preflyt assessment.

Verification repaired an invalid alert import, controlled GitHub advanced-settings expansion, and narrowed a historical migration fixture's Prisma selection to columns available at that migration. Formatting changes follow the updated formatter. No test assertion was removed to hide a production failure.

## Exposure and CI audit

The refreshed local Git graph contained 461 reachable commits. Gitleaks inspected all reachable refs with full history and merge diffs (456 commits with file diffs, approximately 56 MiB). All nine matches were historical documentation password placeholders. The candidate-source scan found two intentional, nonfunctional secret-detection fixtures and one documentation placeholder. No live credential was confirmed in those matches. Ignored local operator secrets were excluded from candidate-source publication inventory.

All 156 retained completed workflow logs and 73 unexpired artifacts available to this credential were downloaded and scanned locally with nested archive inspection. Six matches were documentation placeholders and ten were Docker image references. Raw values used for triage were kept private and deleted after classification. This is not a claim about expired/deleted evidence, inaccessible artifacts, unreachable Git objects, registry-layer history, external backups or all screenshot privacy.

Source review covered the session-bound GitHub installation transaction, origin/session checks, repository authorization, scanner receipt/source cleanup boundaries and CI credential separation. Full regression suites exercise these contracts. The DCO workflow reads metadata without checking out or executing PR code; eight dedicated mocked-event tests passed. Checkout steps disable persisted credentials.

Live GitHub settings remain a release gap: the organization ruleset covers main only, code-owner review is not required, the required approving-review count is zero, and no required-status-check rule was present in that ruleset. Development has no legacy protection and was outside the only returned ruleset. Secret scanning and push protection are disabled. No remote settings were changed. A real fork/public-contribution exercise and credential/publishing-environment enforcement review remain necessary.

The Strix skill was consulted, but Strix and a configured provider were unavailable. No source was uploaded and no paid/external exploit scan was run. Deterministic scans, source review and local regression tests do not substitute for an independent exploit assessment.

## Dependency and legal findings

The [reachable dependency inventory](../vendor/community-license-inventory-2026-10-15.json) records 1,958 installed package versions, license-file hashes, dependency categories and the exact lockfile checksum. No required dependency in that graph was unresolved. Optional platform packages and peer-only traversal limits are recorded. License metadata is evidence for review, not a blanket grant covering all distribution artifacts.

Patchable advisories were addressed in the lockfile, including Prisma, serialization, selector parsing and documentation dependencies. Prisma is pinned to 7.9.1 because newer candidates failed the existing publisher-trust policy; that policy was retained. Mermaid is pinned to the compatible 11.17.2 family. Frozen installation and all affected builds passed.

**Open high advisory:** `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm, has no upstream patched version in the audit response. Its identified path is Docusaurus bundler → copy-webpack-plugin → fast-glob → micromatch → braces. This is a documentation build dependency with controlled project glob patterns; no API request-input path was identified. That scoped observation does not mark the advisory fixed. Public-release acceptance or replacement needs an explicit owner decision.

Original-code Apache-2.0 files, DCO 1.1, community policies and upstream notice preservation are present. The following legal/redistribution closure remains:

- Owner confirmation of rights to original code, earlier contributions, documentation, branding and screenshots. Prospective DCO enforcement does not prove historical ownership.
- Artifact-specific third-party notices and corresponding-source obligations, including Semgrep 1.179.0 (LGPL-2.1-or-later), MPL components, EPL elkjs and container/base-image dependencies. Existing project notice copying is not a complete third-party license bundle.
- Review actual scanner binaries/rules/databases and their exact redistribution terms. Preflyt-authored rules must not be confused with separately licensed Semgrep-maintained rules. The packaged Semgrep metadata identifies LGPL licensing but does not itself establish complete distribution compliance.
- Review real-workspace screenshot privacy and external font/asset rights and outbound requests.

Primary license references: [LGPL 2.1](https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html), [MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/), [EPL FAQ](https://www.eclipse.org/legal/epl-2.0/faq.php), [Semgrep rules terms](https://semgrep.dev/legal/rules-license/). Lyrisoft must confirm obligations and rights before public distribution.

## Local documentation deployment

Five current-source ARM64 application images were built and loaded: API, migration, native controller, bundled Health scanner and web. The normal documented Compose uses four distinct application images; worker shares API, initialization shares scanner. All pinned third-party dependencies, including the optional telemetry collector, are cached locally. Optional native execution is separate from the normal Health deployment.

The Git-ignored `work/community-local` folder contains the generated standalone documentation Compose, a mode-600 `.env` with independent initial keys/passwords, image IDs in `images.json`, and usage instructions. Project `preflyt-ce-local` uses port 8081 and separate volumes; the existing port-8080 instance was preserved. No source mounts or build override are required.

```sh
cd /Users/peterschikezie/Documents/GitHub/78/preflyt/work/community-local
docker compose up -d --wait --pull never
```

Open `http://localhost:8081/super-admin/login`, username `admin`. Read the password from the private `.env` locally. Do not share the file. GitHub App/HTTPS reachability and optional AI provider configuration remain normal operator setup; credentials were not copied from the existing instance.

These are local ARM64 candidate images, not published release artifacts or renewed AMD64 qualification. Docker local-image export does not preserve published SBOM/provenance attestations. Clean anonymous multi-architecture pulls, attestation/signing verification, supported-version upgrade/recovery, and a real end-to-end GitHub installation/CI/coverage exercise remain release requirements.

Private execution evidence is under `/private/tmp/preflyt-ce-audit-20261015`; it is not part of the repository or a durable public release record. The candidate is still uncommitted; any later source change requires checks proportionate to that change.
