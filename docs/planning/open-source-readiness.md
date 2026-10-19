# Preflyt Community Edition readiness plan

**Status:** Community Edition preparation approved; public release **not ready**.
**Owner:** Lyrisoft Technologies Limited.
**Scope and license decision:** Free, self-hosted Community Edition under **Apache-2.0**, with paid managed Cloud later.
**Historical source audit:** 15 October 2026, working tree based on `9a840b7`. **Current preparation:** 16 October 2026, based on `b9b5bb2` plus uncommitted changes; see below.
**Positioning update:** 16 October 2026. Apache-2.0 reaffirmed; Community launch and website direction below are approved. This copy update is not a new legal/security audit or release qualification.

This plan records the agreed product direction and a source/documentation audit. It does **not** authorize changing repository or package visibility, publishing artifacts, applying migrations, committing or pushing. No such action was performed for this update. Original Preflyt Community code/documentation now has a local Apache-2.0 `LICENSE`, `NOTICE` and license metadata. Third-party licenses remain intact. These local files do not clear ownership/redistribution obligations, qualify a release or authorize publication.

## Current preparation — 16 October 2026

This section supersedes stale preparation statuses below. The earlier audit tables
remain historical evidence, not a claim that today's candidate was fully qualified.
Work is based on `b9b5bb2` plus uncommitted changes.

Implemented and locally checked:

- Apache-2.0, DCO and community policy files remain in place. @iampeters is the
  confirmed sole maintainer/security triage owner; the owner confirmed the support
  mailbox receives reports and that there is no backup. A backup is desirable,
  not an invented mandatory second maintainer. Latest stable Community release
  security support is now defined in `SECURITY.md`.
- GitHub administrator access verified. Default Actions token changed from write
  to read; workflows can no longer approve PR reviews by default. Repository
  remains private. Existing branch rules still do not require DCO/checks.
- Hosted workflows are now manual locally to conserve runner minutes. Preflyt
  Action invocations are commented out. Separate development/main publication
  workflows build and publish without running tests; local full regression is
  required before dispatch. DCO and community checks remain available manually,
  with no automatic PR enforcement. See [manual CI](../deployment/branch-ci.md).
  These changes have not been pushed; remote automation is unchanged until then.
- The `braces` stack-exhaustion advisory is fixed locally with a lockfile-pinned
  depth guard and exploit/normal-pattern regressions. The raw registry audit still
  reports 3.0.3 because it cannot inspect local patch contents. See
  [dependency patch evidence](../operations/dependency-security-patches.md).
- Inspected the actual Semgrep 1.179.0 scanner archive and found an unused
  proprietary binary. Removed it from the final standalone/bundled scanner
  filesystem and its shipped layers. CE generated-source fixtures pass. Scanner
  cache exports now retain only final layers; prior caches remain private and
  need review before public access.
- Added pinned scanner licenses/source attribution and generated installed Node
  dependency notice bundles. Missing texts remain visible for upstream review.
  See [scanner licensing](../operations/scanner-licensing.md). This does not certify
  all corresponding-source/data redistribution obligations complete.
- Prepared the [repository launch/transfer runbook](../operations/community-repository-launch.md).
  Current canonical repository remains `lyrisoft/preflyt`. A transfer to an
  owner-controlled `preflytlabs/preflyt` is recommended for branding; no second
  mirror, namespace change or transfer has been performed.

Still requiring clearance or final acceptance:

1. Original-code/assets rights sign-off, exact final binary dependency/source
   obligations, missing upstream notice texts and Trivy data-provider terms.
   Owning Lyrisoft does not relicense third-party scanners. Restricted Semgrep
   Registry packs/Pro are not approved for redistribution or Cloud use.
2. Final candidate privacy/exposure review including screenshots and prior
   registry caches/layers, final AMD64/ARM64 installation/recovery qualification,
   and live GitHub onboarding/PR/coverage/BYOK acceptance. Prior local suites do
   not replace this evidence.
3. A chosen/controlled launch namespace and final source SHA/image digests, then
   an explicit owner go/no-go. Nothing here authorizes public launch.

### Still needing publication after approval

- Commit and push the reviewed source/community/workflow changes; publish the
  approved canonical Community repository. No commit/push/visibility change is
  authorized by the current request.
- Publish versioned AMD64/ARM64 API, migration, web, Health scanner and optional
  controller images with complete notices, SBOMs, provenance and verified image
  digests; test anonymous GHCR pulls on both platforms.
- Publish release notes, installation downloads, digest/platform inventory,
  compatible Preflyt Action version, supported versions and known limits.
- Deploy the website/docs changes: Community Edition positioning, Cloud coming
  soon/pricing, guides, current release/license badges and community links.
- Run the published contribution workflows on a real fork PR, then require DCO,
  Community checks and successful branch verification in GitHub. Verify reporting
  options and branch protections in the actual launch repository.
- Publish a new Preflyt Action Marketplace version only if that separate
  repository changes or compatibility requires it; its existing release is not
  republished automatically by a Preflyt application release.

Publication follows technical/redistribution clearance. It cannot stand in for a
missing test, license/source obligation or owner sign-off. See the
[execution record](../acceptance/2026-10-16-community-readiness.md).

## 1. Community product commitment

Community must provide a complete engineering assurance workflow, not a restricted trial:

| Included in Community Edition | Boundary |
| --- | --- |
| Unlimited self-hosted repositories | No subscription, license key or artificial repository-count cap. Practical capacity depends on the operator's infrastructure. |
| GitHub App integration | Admin connects the installation; repositories selected in GitHub load into the workspace; the original Preflyt admin identity/session is preserved. Explicit local repository exclusions remain possible. |
| Repository discovery and profiles | Branch/commit context and recorded stack/configuration evidence. |
| Repository Health | Supported secret, static security, dependency, reliability, maintainability, duplication and infrastructure checks; honest analysis scope and completeness. |
| Standards and branch policies | Versioned standards, supported checks, policy review/approval/publication and reusable requirements. |
| GitHub Actions integration and PR feedback | Verified CI evidence, same-run supported coverage reporting, deterministic readiness and actionable missing-evidence results. The public Action remains separately MIT-licensed. |
| Basic merge protection | Approved requirements and explicit GitHub ruleset activation; GitHub decides merge permission. |
| Findings and assessments | Source context, evidence, saved reports and comparable assessment history. |
| Teams and access controls | Existing organization/repository authorization, built-in roles and relevant identity integration; basic security is not a paid add-on. |
| Audit history and notifications | Useful activity history, in-app notices and configured email support. |
| BYOK AI reviews and review skills | Optional and advisory. Deterministic checks and basic evaluation must work without an AI provider or paid model. |
| Existing contributor views | Recorded activity/evidence with its current scope and limitations. |

Do not remove currently implemented core governance, identity or evidence-security features merely to create a future paid tier. Any future commercial module needs an explicit boundary review before its code is first published. Existing Apache-licensed releases retain their granted rights.

### Cloud and future Enterprise

**Revised edition boundary (18 October 2026):** repository-aware security reviews and their issue #97 / P4.RI context foundation are planned for Apache-2.0 Community Edition. This supersedes the 16 October Cloud-only boundary for that capability. The [local Strix Repo Health prototype](../operations/strix-repo-health.md) is opt-in and awaits execution qualification; it does not add a prerequisite to the current Community release. Managed remediation/draft PRs remain private Cloud scope.

- Cloud is a later managed service with connected remediation: one-click notification and issue-tracker integrations, agentic AI investigation and draft fix PRs, owner routing and escalation, cross-repository campaigns, scheduled portfolio/evidence reports, managed AI/scanner capacity and operations. AI cannot waive checks or authorize merges. These capabilities are planned, not shipped by the Community release.
- **Cloud remediation decision — 16 October 2026:** Complement Dependabot with finding/CI-failure investigation, proposed fixes, independent verification against frozen standards and human-approved draft PR creation. Human review and GitHub merge controls remain authoritative. See the [Cloud remediation roadmap and implementation plan](cloud-remediation-roadmap.md) for scope, architecture gates, fixture qualification and pilot acceptance. Keep implementation in private Cloud code; this does not add a Community feature or release dependency.
- Billing, hosted free-plan repository limits and subscription enforcement are **not prerequisites** for Community.
- Enterprise remains an option driven by customer demand, not a required separate codebase now. Potential advanced integrations, organizational controls and contractual support must not undermine the Community commitment above.
- Proposed prices and hosted repository allowances are unvalidated hypotheses; this plan does not approve a price list.
- Apache-2.0 permits commercial reuse, including competing hosting. Keep product trademarks/branding policy separate from copyright licensing; do not add commercial-use restrictions while calling the result Apache-2.0.

#### Cloud differentiation and proposed delivery order

The pricing page labels Community Edition **Open source** and Cloud **Coming soon**. Its Cloud capabilities describe a direction, not launch entitlements. This is a commercial planning sequence; it does not reorder the approved product implementation phases.

| Priority | Planned capability | Customer value and completion boundary |
| --- | --- | --- |
| Foundation | Managed hosting, isolated scanner capacity, upgrades, monitoring and recoverable backups | Remove deployment operations. Qualify tenant isolation, restore procedures and operational ownership before availability claims. |
| First workflow | One-click Slack, Microsoft Teams and email notifications; Jira/Linear issue creation and bidirectional status sync | Carry commit, evidence and owner context into existing tools. Use administrator-approved connections, destination routing, deduplication, delivery retries and revocation. One click starts connection; it never bypasses provider consent. |
| First workflow | Assignment, reminders, escalation and cross-repository remediation campaigns | Coordinate recurring fixes and overdue work across teams. Closing a ticket does not mark a finding resolved; fresh comparable evidence must support resolution. |
| Differentiator | Managed agentic investigation and draft fix PRs | Help a team move from a finding or CI failure to a reviewable change. Require approved source access, isolated execution, explicit change authorization, traceable steps and fresh checks. AI cannot override gates or merge. |
| Expansion | Portfolio reports and scheduled evidence packs | Give engineering leaders cross-team trends and reviewers source-linked evidence. Preserve authorization, revision, coverage and freshness; do not imply compliance certification. |
| Service | Managed AI usage/spending visibility, team limits, guided onboarding and priority support | Make hosted usage and operating costs predictable. Existing Community provider configuration and budget controls stay included; publish commercial limits and response commitments only when defined. |

Do not make SSO, basic RBAC, audit history, core scanners, existing email or existing AI configuration paid-only to manufacture differentiation. Dedicated environments, regional residency and contractual SLAs remain demand-led options outside current launch promises. Keep Community independently useful and compatible with its Apache-2.0 license.

### Optional native execution

The bundled **Health scanner** is part of the normal Compose installation. Optional **native command execution** is a different capability and requires a separately reviewed runtime. Keep it disabled by default and clearly qualified; do not market it as a production-ready substitute for CI. Its incomplete production qualification need not block Community if it remains accurately documented and inaccessible without its prerequisites. The supported Health/Actions workflow must independently pass acceptance.

## 2. Audit method and status meanings

**Verification update:** The subsequently authorized [local legal/security audit and execution report](../acceptance/2026-10-15-community-audit.md) records passing functional suites and a healthy local-image documentation deployment. Historical preparation-only statements below describe the earlier audit, not the latest execution. Public release remains on hold for the findings in that report.

This audit inspected tracked source/configuration, pending local changes, workflows, deployment scripts, vendor inventories and recorded acceptance reports. It did **not** run tests/builds, scan Git history, inspect real secret values, change external settings or perform a fresh deployment. Earlier acceptance reports are historical evidence at their stated revisions, not proof that the current working tree passes.

- **Present:** implementation/document exists; remaining release verification may still apply.
- **Partial:** useful work/evidence exists, but the release criterion is not met.
- **Local / unverified:** pending implementation has not completed verification or shipped.
- **Missing:** required artifact was absent from the inspected location.
- **Not verified:** external/live state or evidence was outside this audit.

The latest audit found no confirmed credential leaks in the scanned reachable history, candidate files and retained CI evidence, but one unpatched high docs-build advisory, redistribution/ownership clearance and remote protection gaps remain. Local image evaluation is ready; public-release clearance is not complete.

No source-only finding should be promoted to “release ready” without the closure evidence below.

## 3. Local preparation implemented — 15 October 2026

The owner approved **DCO 1.1**, **support@lyrisoft.tech** for private security/conduct reports and **@iampeters** as default CODEOWNERS reviewer. These are recorded decisions; mailbox delivery, reviewer access and remote rule enforcement have not been exercised.

- Canonical Apache-2.0 `LICENSE`, original-code `NOTICE`, third-party notice index and package metadata are added; upstream notices remain. Ownership/third-party clearance remains open.
- `DCO`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `SUPPORT.md`, unreleased `CHANGELOG.md`, issue/PR templates and `.github/CODEOWNERS` are added.
- A read-only, no-checkout DCO workflow checks author-matching sign-off trailers, the full verifiable PR commit range and event head SHA. It grants no write permissions, executes no PR code and does not automatically rewrite history. Remote enforcement is pending.
- All checked-in checkout steps disable persisted credentials. This is a limited source hardening change, not a completed public-contribution security review.
- Application Dockerfiles copy existing project/upstream notices into `/usr/share/licenses/preflyt/`. Original-source license/notice changes now trigger development image qualification. Complete scanner/dependency notices are still pending.
- Application Bake targets explicitly request SBOM and maximum-mode provenance attestations. Regression expectations are updated but **not executed**. Optional native-image attestation export remains open because that publisher loads locally before pushing.
- README, vendor licensing wording and a Community docs page reflect the agreed edition, unlimited repositories and Cloud-later boundary. Private-package requirements remain accurate until public access is authorized and proven.
- [Community release runbook](../operations/community-release.md) and [candidate evidence template](../releases/community-candidate-template.md) define the remaining qualification and sign-off work.

**Verification boundary:** [local preparation record](../acceptance/2026-10-15-community-preparation.md). Only static source/configuration review was performed for these changes. No tests, builds, workflows, migrations, public pulls, commits, pushes or visibility changes were run. All new automation and image packaging changes are unverified until execution is authorized.

## 4. Existing product and distribution foundations

| Area | Audit finding and evidence | Status |
| --- | --- | --- |
| Core Community features | Health, standards, policies, GitHub rulesets, CI processing, findings, teams, access control, audit, notifications and advisory AI implementations exist under `apps/api/src/`; workspace routes exist under `apps/web/src/routes/_authenticated/`. No repository quota/license-key enforcement was found in the scoped source search; unlimited-repository behavior is not load-tested by that search. | Present; full release acceptance pending |
| Compose distribution | `docker-compose.yaml`, `compose.local.yaml`, `deploy/`, generated docs downloads and self-hosting guides exist. The stack includes the scanner, dedicated engine and automatic connection initialization. Engine privilege and host requirements are disclosed. | Present |
| Local image qualification | [Image packaging report](../acceptance/2026-10-15-image-packaging-disk.md) records 22 AMD64/ARM64 image variants and native-tool fixtures, plus Compose/scanner acceptance. AMD64 used emulation; these results predate later uncommitted onboarding/Health changes. | Partial release evidence |
| Persistence and recovery | `scripts/deploy/backup.sh`, `restore.sh`, deployment guides and restart/restore acceptance exist. [Bundled Health acceptance](../acceptance/2026-10-14-bundled-health-compose.md) records migration/restart behavior and explicitly excludes live external integrations. | Present; final-release recovery exercise pending |
| Versioned image release tooling | `.github/workflows/publish-images.yml`, `scripts/ci/publish-release.mjs` and `create-release.mjs` build native architectures, check manifests, preserve release digests and create main releases after published-image acceptance. Workflow existence is not a new successful run. | Present |
| Deployment acceptance workflow | `.github/workflows/compose-acceptance.yml` checks login/origins/protected routes and scanner readiness; main adds analyzer smoke, migration replay, backup/restore and restart. Published pulls currently authenticate, so this does not demonstrate anonymous access. | Present; public-install gap |
| CI foundations | Pinned actions, scoped publication, same-repository policy submission/final gate, disabled checkout credentials and new metadata-only DCO workflow. New changes are unexecuted; remote protections and fork/cache/artifact trust still require review. | Partial |
| Third-party inventory | Upstream license files/inventories remain, and root `THIRD_PARTY_NOTICES.md` indexes them. Final artifact-specific rights/notices review is not complete. | Partial |
| Scanner inputs | `deploy/api.Dockerfile` pins scanner bases; `docs/deployment/native-runner/config/semgrep.yaml` contains Preflyt-authored rules. This does not establish the license/content of every upstream image, embedded rule, database or bundled binary. | Partial |
| Documentation and screenshots | Getting Started, self-hosting, feature guides, operational docs and 14 actual-app User Guide captures exist. [Capture notes](../operations/documentation-screenshots.md) distinguish v0.1.1 screenshots from pending code and disabled features. Release badges are local changes. | Present; CE release wording/update pending |
| Installation encryption keys | `.env.example`, `deploy/.env.example`, generated-download source and startup guides include `AI_PROVIDER_ENCRYPTION_KEY` with initial encryption settings. A fresh installation exercising these changes remains pending. | Local / unverified |
| Admin GitHub connection | New service/controller, one-time session-bound transaction schema/migration, repository sync behavior, UI and regression cases exist. [Acceptance note](../acceptance/2026-10-15-github-admin-installation.md) explicitly says migration not applied and verification not run. | Local / unverified |
| Missing-workspace setup | Shared organization boundary and regressions exist. [Earlier acceptance](../acceptance/2026-10-15-organization-setup-state.md) records successful checks; subsequent GitHub-flow changes require renewed verification. | Partial |
| Health completeness and badge fixes | `health-analysis-completion.ts`, `health-report.ts`, API regressions and web Health/badge changes are pending. Current published-app captures still show the old completeness behavior. | Local; final verification/release pending |

## 5. Release blockers and closure evidence

Every blocker needs a named accountable person and dated evidence against the final candidate commit/image digest. Functional owners below are proposed responsibilities, **not assigned individuals**.

| ID | Requirement / current gap | Owner role | Required closure evidence |
| --- | --- | --- | --- |
| CE-01 | **Apache-2.0 files implemented locally; ownership clearance pending.** Canonical `LICENSE`, `NOTICE`, metadata, README terms and DCO are present. | Product owner + legal/IP reviewer | Confirm rights to original code, contributions, docs and assets; review retained upstream exceptions, notice completeness and trademarks before public distribution. |
| CE-02 | **Third-party redistribution clearance.** Inventories are useful but not final legal clearance. | Release engineering + license reviewer | Exact-version/image-digest inventory of application dependencies, scanners, rules, databases, fonts and assets; obligations/notices satisfied. Inspect actual Semgrep image contents and Preflyt rule origins instead of assuming all rules share the engine license. Record cleared/replaced/excluded components. Separate cloud-use review where terms differ. |
| CE-03 | **Exposure/security audit executed locally.** Reachable history, candidate files and retained CI logs/artifacts scanned and triaged; registry-layer, screenshot/privacy and independent exploit qualification remain. | Security + repository administrator | Scan current files and all reachable branches/tags/history; inspect logs/artifacts, registry caches, fixtures, screenshots, internal/customer data, docs and telemetry. Record sanitized findings and remediation. Any exposed credentials must be revoked/rotated; rewriting history alone is insufficient. Review whether publishing a sanitized release repository is preferable to exposing existing history. |
| CE-04 | **Public contribution CI safety.** Safe foundations exist, but a full review is outstanding. | CI maintainer + security | Review untrusted code execution, workflow triggers, OIDC audiences/trust, reusable/local actions, caches, artifacts, environment protections and publishing credentials. Demonstrate fork PR checks without access to credentials/private API or a path to publishing. Verify branch protection and required checks remotely; local YAML does not prove settings. |
| CE-05 | **Anonymous image distribution.** Docs describe private GHCR packages; authenticated acceptance cannot prove public pulls. Live package visibility was not rechecked here. | Release engineering | After separately authorized visibility/publication changes, pull every normal-stack image and required base by release tag/digest with clean Docker credentials on AMD64 and ARM64. Include scanner preparation/startup. No PAT/package-access request in the public quick start. Optional native images need their own qualification if offered. |
| CE-06 | **One clean installation through first value.** Earlier Compose acceptance does not include the new GitHub flow or all pending fixes. | Product + API/web maintainers | On the final candidate, from an empty supported host: follow only public docs, generate initial keys, start Compose, sign in as admin, configure HTTPS reachability, register/connect/install GitHub App, retain admin identity, import installation-selected repos once, assess and inspect a real repository. Confirm local exclusions and no repeat selection requirement. Apply/test migration in an isolated database first. |
| CE-07 | **Useful CI assurance without AI.** Source exists; complete current-release external acceptance is not established here. | Integration maintainer | A real PR uses a documented published Action version compatible with required coverage inputs, produces same-run test coverage and verified CI evidence, and publishes readiness. Test missing/failed evidence, explicit basic merge protection and success; AI disabled must not prevent the deterministic path. Test BYOK AI separately, including provider failure and bounded waiting. |
| CE-08 | **Health and setup correctness verified in local suites.** Full API/browser regressions pass; current ARM64 documentation Compose is healthy. Real external integration and final published-candidate acceptance remain. | API/web maintainers | Run focused regressions and applicable full local suites when authorized, then final-candidate live acceptance. Prove complete supported scopes report accurately; partial/failed/unknown scopes remain incomplete; completed badges are green; missing organization shows setup rather than access errors. Refresh affected screenshots. |
| CE-09 | **Recovery and upgrade.** Scripts/historical acceptance exist, not final-candidate proof. | Release engineering | Retained logs for clean migration, supported previous-version upgrade, persistent-data restart, backup/restore and documented rollback boundaries. Do not promise an image downgrade reverses a database migration. Verify least-privilege roles and stable encryption/scanner identities across restart. |
| CE-10 | **Artifact evidence requested, not verified.** Application Bake targets now explicitly request SBOM/max provenance and Dockerfiles include current legal notices. Existing tags are not retroactively attested; optional native export, signing, vulnerability gates and reproducibility remain open. | Release engineering + security | Execute qualified builds when authorized; inspect per-platform attestations, subjects and digest preservation, complete license bundles, define signing/verification and retain vulnerability/rebuild evidence. |
| CE-11 | **Community policies and sole-maintainer ownership prepared.** @iampeters administrator access verified; owner confirmed working support mailbox and no backup. Latest stable Community security-support policy defined. | @iampeters | Publish prepared workflows/policies, verify a fork PR and enforce required DCO/checks in the chosen launch repository. Record single-maintainer availability honestly; a backup appointment remains optional. |
| CE-12 | **Community scope/licensing docs implemented locally.** README and new Community docs distinguish Apache original code, upstream licenses, unlimited self-hosting and planned Cloud. Existing private-image instructions remain accurate. | Docs + product | Validate final release versions, public access, external prerequisites, screenshots/privacy, assets/fonts/outbound requests and native limits; refresh affected captures. Do not advertise public availability before it is proven. |
| CE-13 | **Explicit release go/no-go.** No Community public release is authorized by this task. | Product owner + security/legal + release maintainer | Named sign-offs for blockers, final source SHA and all image digests, supported platforms, release notes/known limits, rollback/support contacts and separate explicit authorization for repository/package visibility and public publication. |

## 6. Work order

1. **Record the boundary:** this plan selects the Community scope and Apache-2.0 direction. Identify accountable reviewers; DCO is selected; clear contributor rights and any separately reserved future code before publication.
2. **Finish existing local fixes:** GitHub onboarding/migration, initial keys, Health completeness and setup UX. Local verification was subsequently authorized and executed; preserve the no-commit/no-push/no-publication boundary.
3. **Clear ownership, redistribution and exposure:** CE-01–03. Do not make code/packages public merely to test installation convenience.
4. **Prepare public maintenance and CI:** CE-04 and CE-11. Work locally first; external configuration changes remain separate actions.
5. **Qualify the exact Community release:** CE-05–10 and CE-12. Historical reports guide the work but cannot replace final-candidate acceptance. Public pull checks occur only after authorized artifact publication/visibility changes; perform the remaining checks privately beforehand.
6. **Owner go/no-go:** CE-13, then a separately authorized public launch. Repository visibility and package visibility are distinct settings; validate both.

## 7. Release decision checklist

- [x] Community-first, Cloud-later direction and unlimited self-hosted repository scope agreed.
- [x] Apache-2.0 selected for Community original application code, subject to ownership/third-party clearance and actual license-file implementation.
- [x] Source/documentation readiness audit recorded, with historical vs local/unverified evidence distinguished.
- [x] Local Apache-2.0/DCO files, community policies/templates, CODEOWNERS and release runbook prepared.
- [x] Local notice packaging, metadata-only DCO workflow and explicit application build-attestation configuration prepared; execution pending.
- [ ] CE-01–02: license files, ownership and redistribution clearance complete.
- [ ] CE-03–04: exposure audit and public-contribution CI review complete.
- [ ] CE-05: final release pulls anonymously on both supported architectures.
- [ ] CE-06–08: clean onboarding, real Health/CI/coverage and optional AI acceptance complete.
- [ ] CE-09–10: final-candidate recovery and artifact evidence complete.
- [ ] CE-11–12: public maintenance, security reporting and accurate CE docs complete.
- [ ] CE-13: named owner-approved public-release go/no-go recorded.

**Current decision: hold public launch.** Local Community licensing, contribution/governance files and release-preparation changes are implemented. Ownership/redistribution/exposure clearance, exact-candidate verification and remote enforcement/access remain open. Source presence, earlier green checks and a published private release do not establish Community release clearance. Nothing was committed, pushed or made public.

Latest execution: API 1,737 unique cases across full/Action-contract runs; Chromium 609; Node automation 28; Python automation 16; Linux packaging 2. Typechecks, lint/format and three production builds passed. One dependency advisory remains open. Five application images are loaded locally; see the linked audit report and ignored `work/community-local` instructions. No Git write or publication action was performed.

## 8. Community launch and positioning workstream — 16 October 2026

This section supplements the historical audit above. Its completion does not close CE-01–13. The canonical copy guide is [Product positioning](../product/product-positioning.md).

### What we adopt from SigNoz

The [SigNoz website](https://signoz.io/) uses outcome-led copy, an explicit technical foundation, product views and clear deployment choices. Its [repository](https://github.com/SigNoz/signoz) gives developers a path to installation and participation. Adopt those patterns with Preflyt's own product story. Keep Apache-2.0; do not adopt SigNoz's separate enterprise licensing or reproduce its brand assets, customer proof or pricing.

| Area | Preflyt decision | Current status / next evidence |
| --- | --- | --- |
| Product message | “Know what passed. See what needs attention.” Repository health, standards and verified CI results in one workspace. | Website, README and canonical positioning updated locally. Public descriptor stays “Engineering assurance for GitHub” until launch. |
| Community offer | Free self-hosted core workflow under Apache-2.0, no artificial repository cap, existing access controls/audit included, optional BYOK AI. | Scope retained. Ownership/redistribution clearance and release qualification still required. |
| Managed Cloud | Planned managed integrations, agentic fix assistance, cross-repository remediation and reporting, hosted AI/scanners, operations and support. | Coming soon. Pricing at launch; no invented price list, trial, signup or SLA. Existing Community capabilities stay included; human approval and deterministic checks remain authoritative. Validate demand before defining Enterprise boundaries. |
| First value | Start Compose, create admin, install/connect GitHub App, choose repos once in GitHub, read Health. Add standards and CI afterward. | Website/README describe the current guided flow and bundled scanner. Final-candidate clean onboarding remains CE-06–08 work. |
| Product proof | Show Health, findings and assessment evidence with real product components; keep guide screenshots consistent with the app. | Existing public previews retained, Findings made the first detailed tour view. Capture/review final-release guide images separately; never treat fixture metrics as adoption proof. |
| Entry points | Community install guide plus View on GitHub; clear current access requirements. | Implemented locally. Switch to Install Community Edition and remove access caveats only after anonymous release verification. |
| Contribution | DCO, issue templates, clear support/security contacts and actionable contribution opportunities. | Existing policies retained; contributor guide/issue links surfaced. Confirm external access, enforcement and maintainer permissions at launch. |
| Trust | Accurate release versions, license, supported integrations, documented limits and security reporting. | No invented badges, certifications, customer logos or performance claims. Recheck published versions against the final release. |

### Contribution and maintenance plan

Start with bounded contributions: specific standard/check descriptions, supported JUnit/SARIF integrations, scanner regression fixtures, documentation corrections and advisory review skills. A maintainer should define the expected result and verification for each starter issue before adding a help-wanted label. Preserve source verification and deterministic evaluation rules in contribution review.

Use Issues for reproducible bugs and proposals. Enable Discussions for questions/design conversation only when configured with a named maintainer; do not link a nonexistent forum or create a chat community without capacity to support it. Keep vulnerabilities and conduct reports private at **support@lyrisoft.tech**. **@iampeters** remains the default reviewer; DCO sign-off remains required. These are established policies, not evidence that remote enforcement or mailbox delivery has been verified.

### Launch sequence and measurement

1. Close the existing legal/security, exact-candidate and operational release requirements privately. This branding work does not change their priority.
2. Review the release README, website, install guide and screenshots together. Verify all copy against the same candidate: included scanner, one-time GitHub selection, source/image access, known limits and license notices.
3. Obtain the named owner's release go/no-go and separate publication authorization. Then verify anonymous repository, release, image and documentation links on the supported architectures.
4. Update prelaunch wording, publish the release notes and announce the Community workflow with an actual setup walkthrough. Enable community channels only when staffed.
5. Track opt-in feedback and operationally collected aggregate milestones: successful clean installs, first Health report, first verified CI assessment, setup failures and resolved contributor issues. Define collection/consent before adding telemetry. Do not add tracking as part of this positioning change or use GitHub stars as proof of successful adoption.

**Still open:** public-release clearance, anonymous install verification, final-release screenshots, community channel readiness and a separately scoped Cloud offer. No visibility, registry, CI settings or publication changes are authorized by this update.

### Screenshot privacy correction — 16 October 2026

The audit-log guide image exposed a personal actor name. Replaced the current
asset with a fresh actual-app capture using synthetic workspace/repository/actor
fixtures, removed the original downloadable JPEG and refreshed the local docs
server. All 14 guide images were visually reviewed; no other visible personal
names/emails/individual avatars were found. Older captures still contain publisher
workspace/repository names and should use synthetic fixtures when refreshed.

The exposed JPEG was removed from local Git history on 16 October 2026 with
explicit owner authorization. Only the three affected commits on the working
branch have new IDs; all unrelated branch/tag/tracking refs were restored to their
original IDs. All 1,316 working-file content digests matched the pre-rewrite
snapshot. Reflogs were expired, unreachable objects pruned, and the original JPEG
blob and path were verified absent from local refs/reflogs/object storage. Temporary
recovery copies were removed and Git fsck passed. Nothing was pushed; remote
history/visibility and already downloaded or cached copies are unchanged. CE-11's
broader history, secret and asset review still applies.
