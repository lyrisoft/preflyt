# Built-in check descriptions — 16 October 2026

## Correction

All five built-in standards previously inherited one of two generic guidance strings. Their check cards did not explain what each control actually assessed. The frontend rendered the catalogue's guidance correctly; the shared catalogue definitions were the source of the problem.

Catalogue version **1.1.1** provides distinct guidance for all **14 unique checks** across the five packs. Repeated instances of the same stable check use the same wording across packs; different check IDs no longer share generic descriptions.

| Check | Specific purpose / limits explained |
| --- | --- |
| CI configuration | Finds workflow configuration at the inspected commit; does not establish execution or success. |
| Required test execution | Requires executed tests and verified JUnit evidence, rather than a script or skipped-only suite. |
| Secret scanning | Credentials/tokens/private keys, SARIF, scanner scope/exclusions, explicit history scope and credential rotation. |
| Dependency lockfiles | Recognized lockfile presence; no claim that manifests match or CI uses it. |
| Static application security | Source analysis, configured rules/languages, SARIF; no running-application test claim. |
| Dependency vulnerability scan | Known dependency vulnerabilities, database freshness, SARIF and integrity/unknown-vulnerability limits. |
| Type checking | Compiler/type-check command, JUnit and distinction from runtime behavior. |
| Lint validation | Configured lint rules, SARIF and distinction from correctness/security proof. |
| Build validation | Build/compilation command, JUnit and distinction from tests/deployment. |
| Timeout and retry controls | Project-specific timeout/retry/failure tests with an explicit command and JUnit result path. |
| Component test execution | Component-level tests with an explicit command and JUnit result path; no line/branch coverage percentage claim. |
| Infrastructure policy checks | Configured static IaC policies, SARIF and distinction from deployed cloud state. |
| Container vulnerability scan | CONTAINER_IMAGE selection, known package vulnerabilities, SARIF and runtime-security limits. |
| Unsafe infrastructure exposures | Declared network/access exposure checks, SARIF and distinction from live cloud scanning. |

“Component test coverage” is renamed **Component test execution** in the new version because this rule consumes JUnit execution results and has no line/branch coverage threshold.

## Version safety

The published **1.0.0** and **1.1.0** definitions remain resolvable with their exact original digests. New descriptions are a new pack version, rather than an in-place rewrite. Existing saved selections, organization standards, policies and assessments are not upgraded or rewritten automatically.

Only guidance and the component-testing display title change in the rules. Rule versions, operators, thresholds, severity, allowed sources, applicability, required profiles and other evaluation requirements remain unchanged. Regression tests compare the requirements digest of every new check with its 1.1.0 counterpart.

## Verification

- Focused catalogue and real API integration suites: **29 passed**.
- API typecheck, Linux production API image build and documentation build passed.
- Full API suite: **1,740 passed across 161 files**, including the published Action contract; API line coverage 83.74%.
- Related standards/skills Chromium suites: **26 passed**. Web typecheck and formatting passed.
- The first full run caught a stale component-check label in AI skill display metadata. That label and its UI fixture were aligned without changing skill instructions; skill/Markdown consistency tests and the final full suite pass.
- Live authenticated library check on the documentation Compose: five v1.1.1 packs, 14 distinct descriptions, accurate component-testing title and no generic fallback text.
- HTTP/auth/origin/protected-route smoke passed. API and worker are healthy; the worker was idle before replacement. No connected-repository code or assessment was run for this check.

Only the local reduced API/worker image was rebuilt. Migration, scanner and web images, settings and volumes were preserved. The local candidate image is `preflyt-local/preflyt-api:check-guidance-20261016-arm64`, content ID `sha256:ae17ba831c0d59bacd290906f70f0852fd3538fc17756da5102abb827a051d94`. It is selected by the existing optimized local tag for the port-8081 documentation deployment. The separate port-8080 deployment was untouched. During the final check the local project dependencies were no longer present, so an API-only start could not reach PostgreSQL. The full documented Compose stack was restored with the existing volumes; the final API/worker and all dependencies are healthy, and live catalogue/authentication smoke passed afterward.

Refresh **Standards → Built-in standards** at `http://localhost:8081` to see the corrected descriptions. Existing pinned old versions retain their historical text; choosing an updated version is explicit.

Private logs and digest/image evidence: `/private/tmp/preflyt-check-guidance-20261016`. No commit, push, registry publication or workflow run was triggered.
