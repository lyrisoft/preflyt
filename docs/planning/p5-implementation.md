# P5 implementation and acceptance

P5 core implementation is on the current branch. Executed-analysis production acceptance remains pending until an independently qualified runtime is available. Published policies and GitHub protections are preserved.

## Delivered

- Durable repository health targets, immutable revision reports and scoped APIs.
- Explicit repository selections and manual branch reassessments queued through BullMQ with database recovery, bounded claims and cancellation.
- Bounded signed finding projections from approved native adapters. Health results do not create CI gate evidence or satisfy branch policies.
- Repository detail design preserved: **Health** is first and opens by default; **Checks** contains selected checks, detected setup files and CI context. Standards, Assessments and CI activity remain separate.
- A full-width findings-over-time area graph appears above the metric cards. It uses up to 30 completed reports from the assessed branch. New reports compare complete retained findings within measured compatible rule-pack scopes and name those packs; missing, truncated or incompatible scopes are excluded rather than plotted as zero. Older reports retain their complete-report comparison rule.
- Engineering Overview retains its original four-card activity layout and adds a fourth Health tab that swaps the metric row, shows assessment status and priority findings, and honors repository scope; Repositories uses a single inventory with scoped Health status and saved-report links; dedicated finding details pages with exact-revision source and line highlighting, access checks, redaction and immutable GitHub links.
- Report history, scoped notification outbox, help, operator guidance and user documentation.

## Verification on 11 October 2026

| Verification | Result |
| --- | --- |
| Full API regression | 131 files; 1,455 passed, 4 optional tests skipped |
| Full browser regression before the final timeline and Overview refinements | 67 files; 421 passed |
| Final health and native API focus | 91 passed; final health lifecycle, timeline and scoped authorization focus: 38 passed |
| Health browser focus after adding the graph | 9 passed, including timeline placement and report selection, unavailable analysis, Overview summary without the reports table, source locations, branch actions and 320px layout |
| API, web and documentation builds | Passed |
| Changed frontend lint and whitespace checks | Passed |
| Local application database migration | Additive migration applied after a protected database backup; all 55 migrations up to date |

The full browser run emitted a ResizeObserver notification-loop console message but exited successfully with all 421 tests passing. The production web build reports the existing large-chunk advisory.

## Live local acceptance

The local authenticated application assessed `lyrisoft/preflyt`, branch `development`, at commit `7e6ccde909a68808eeeaacf7a770a621698b8d10`.

- Report: `530254f3-995d-4dce-a8a3-9aab456eeb24`.
- Request to saved first report: **12.224 seconds**, from persisted timestamps.
- **954 files inspected**; four applicable analyzers recorded as not run.
- Completed, **partial / inspection only** because the independent runtime review is required.
- Finding counts are unavailable, rather than zero.
- Exactly **one** completion notification event was persisted. Its inbox link opened this report at its original commit.
- Health graph placement above metric cards and its unavailable state were checked in the live browser. Engineering Overview was restored to the original four-card layout, tabs, activity calendar and Evidence overview; small-screen behavior was verified by browser tests.

Live testing also exposed a missing authorization route mapping for the organization health endpoint. The mapping was corrected and covered by authenticated, unauthenticated and repository-scope tests.

This acceptance validates inspection and orchestration. It does not claim that live scanners ran or that the repository is healthy.

## Remaining production acceptance

1. Independently qualify the execution runtime and each analyzer image, version, configuration and applicable analysis scope. Retain the isolation and cleanup evidence required by native execution.
2. Run seeded and clean repository acceptance against the approved analyzers. Verify signed outputs, actual finding locations, redaction, deduplication and truthful partial coverage.
3. Exercise live timeout, cancellation, source-access revocation, runtime failure and cleanup recovery.
4. Measure executed-analysis latency and resource cost; verify production deployment and operator rollback procedures. Local inspection timing is not a production scanner benchmark.

No remote push or GitHub workflow was started for this local implementation and acceptance.

## Full repository assessment completion scope

P5 includes all six dimensions below. Core orchestration alone does not complete this phase. No overall A–E rating is published yet; any future ratings require a versioned, public calculation and an explicit unavailable state for missing evidence.

| Dimension | Required evidence and user outcome | Current implementation / remaining work |
| --- | --- | --- |
| Security | Qualified secrets, code, dependency and infrastructure analysis; revision-bound issues and review guidance | Existing adapters; live execution qualification pending |
| Reliability | Code defects with rule, explanation, commit, file and line | Fixed Semgrep v1 adapter and JS/TS/Python rule pack added; seeded and clean Semgrep 1.179.0 acceptance passed locally; independent execution qualification pending |
| Maintainability | Actionable code issues with the same source drill-down | Fixed Semgrep v1 adapter and JS/TS/Python rule pack added; seeded and clean Semgrep 1.179.0 acceptance passed locally; independent execution qualification pending |
| Duplication | Measured duplicated lines / analyzed lines, matching blocks and source locations | Pinned jscpd adapter, signed unique-line measurement, source block ranges and analysis-coverage display implemented; fixture acceptance passed; independent runtime qualification pending |
| Hotspot review | Review-required locations, explicit human review decisions and reviewed / total percentage | Fixed Semgrep MD5 review rules and scoped durable human decisions implemented; scanner, API and UI acceptance verified; independent runtime qualification remains pending |
| Optional test coverage | Actual isolated test execution and compatible coverage report; covered / executable lines | Explicit opt-in Node built-in JavaScript test execution and signed event-derived loaded-file coverage implemented and fixture-tested; other framework recipes and independent execution qualification remain pending |

First selection must provide the supported static dimensions without CI setup. Unsupported languages and unfinished analyses remain explicitly unavailable. CI supplies ongoing revision results; health results never satisfy merge policies automatically. New tool images and rule configurations require independent qualification before connected repository execution. Completion requires seeded and clean scanner acceptance, source-location drill-down, permission and cancellation checks, report history, measured latency and operator documentation across every dimension.

### Quality adapter verification, 12 October 2026

The local Semgrep fixture image `sha256:ce22a15bc853acbfac5c4f009ce7ac8daf78ed1ade6cf56fe0b23fe5534e86ce` reports Semgrep 1.179.0. `apps/api/scripts/health-quality-fixtures.mjs` scanned generated JS and Python source only, with network disabled, read-only mounts, dropped capabilities and bounded resources. Both rule packs found their two seeded issues with source locations and explanations; both clean fixtures produced no findings. This verifies four rules, not broad repository coverage or production isolation. No connected repository was executed and no review certificate was created.

Focused API verification after the quality adapter addition passed **107 tests across five files**, including signed category attribution, actual health-native dispatch/persistence, no CI gate publication, scoped access and existing runtime/controller invariants. API type checking also passed. These results are local and do not replace the remaining full six-dimension acceptance.

### Duplication acceptance, 12 October 2026

The local image `sha256:409bea323d628fbeb4391be482f4e747f7323d0f3cb10aa160d2a89834480644` passed generated static fixtures: three identical files measured **39/39 unique duplicated physical lines** with three retained source blocks; clean and fixed-excluded-directory cases measured **0/13**. Repository `.jscpd.json` and package settings did not alter execution. No source fragments appeared in the report. The source-verified native wrapper also passed its seeded FAIL and clean PASS fixtures. These are scanner and contract tests only; connected-repository execution qualification remains pending.

Duplication-focused verification passed **112 API tests across six files** and **19 browser tests across two files**, including signed measurement rejection, source-bound reports, preserved finding category and full block highlighting. API and web type checks, changed frontend lint and documentation production build passed. The local saved repository report remains inspection-only; it was not relabeled or replaced with fixture data.

### Hotspot review acceptance, 12 October 2026

Initial JS/TS/Python MD5 hotspot rules passed generated seeded and clean scans using Semgrep 1.179.0. The review workflow has its own additive table and preserves the original assessment and CI evidence. Scoped HTTP tests cover readers vs reviewers, CSRF, rationale, credential rejection, audit, concurrent revisions, revocation and fresh decisions for later assessments. Percentages are withheld for truncated or incomplete output. Local migration was applied after a protected verified database backup. This is functional review acceptance, not broad scanner coverage or independent runtime qualification.

Hotspot verification passed **113 API tests across six files** and **41 browser tests across four files**, plus API/web type checking, changed frontend lint and the documentation build. The rebuilt Semgrep image `sha256:65e39c45b59abe1cb5506da7054910139ea9b43a85262a54231463cdfe111475` passed **13 source-verified native fixtures** spanning hotspot, reliability, maintainability, JavaScript/Python SAST and lint. Migration status confirms all 57 local migrations are applied. No connected repository was executed and no independent runtime qualification certificate was created.

### Optional coverage acceptance, 12 October 2026

The fixed `node-event-coverage-v1` adapter runs actual Node built-in JavaScript tests under source-verified native wrapper control. A generated branch fixture produced measured partial line coverage; failing, skipped, zero-test and test-only cases stayed INCOMPLETE. No connected repository or package script was run. The image is `sha256:cbbfc8d8cdda32d187a8ff036b24fae18b88b8ed0d0355965c0ce0ff5b0b9bc9`. The recipe reports loaded application files only and does not claim whole-repository coverage or support for Vitest/Jest/pytest.

Coverage stays off by default, including existing records via additive migration `20261012030000_health_optional_coverage`. Explicit opt-in is immutable per request, checked in idempotency and pending-scope reuse, and requires current execution permission. The local migration was applied after a protected verified backup. The live browser confirmed coverage unchecked and all six Health dimensions together; the historical report stays inspection-only and contains no fixture data.

Focused acceptance: **121 API tests across seven files**, **30 browser/unit tests across four files**, actual Node wrapper fixtures, API/web type checks and changed frontend lint. Independent runtime qualification, broader scanner/test framework scope and full final regression remain required before declaring P5 complete.

The production web and documentation builds passed after the final six-dimension layout and coverage help updates. All **58 local migrations** are current. The default live view preserves the original saved commit, shows unavailable analysis rather than invented results, and leaves **Run tests for coverage** unchecked.

### Integrated audit and regression, 12 October 2026

Full local regression passed **137 API files / 1,502 tests**, with four optional tests skipped, and **72 browser files / 454 tests**. The browser run emitted the previously observed ResizeObserver notification-loop message but exited successfully. These full runs preceded the final receipt-budget hardening; the subsequent changed-area checks passed **62 API tests across four files** and **19 browser/unit tests across two files**, including a verified signed eight-analyzer receipt, preserved scan outcomes/counters, explicit partial completeness and lower-bound metrics. API/web type and changed frontend lint checks also passed.

A qualification inventory script now records exact available fixture image IDs and configuration hashes without secrets or approval claims. Current authoritative deployment inspection shows Kubernetes selected, no valid independent runtime approval, an empty analyzer review inventory and no dedicated kubeconfig. Local Docker has runc only. The requested runner selection is pending; no connected repository was executed, no trust keys were added and no review certificate was manufactured. Additional target-project analyzer/test coverage and live effective-isolation acceptance still prevent P5 completion.


### Saved finding guidance

New Health reports save Preflyt rule guidance v1 for packaged static security, reliability, maintainability, MD5 hotspot and duplication rules. Finding details show why the pattern was reported, how to address it, and its limits below the affected code. Guidance is advice, separate from signed analyzer evidence. Saved reports retain their guidance text and version. Historical reports and unknown external rules show an explicit unavailable explanation rather than guessed rule semantics. New secret findings now receive general safe remediation guidance; new dependency and infrastructure findings preserve exact matched analyzer descriptions/help when supplied. Missing rule descriptors still have explicit unavailable guidance.


### Exact analyzer scope

New reports retain an analysis-scope description with each analyzer outcome, shown in **Analysis coverage**. The current static security, reliability, maintainability and hotspot packs support JavaScript, TypeScript and Python only, with their specific patterns listed. Java, Go, Ruby, PHP and C# source can participate in duplication analysis but is not covered by these code-rule packs. `.mjs` and `.cjs` files are included in JavaScript applicability. Saved scope descriptions survive report finalization; historical reports are not rewritten to claim broader coverage. Broad language and rule coverage remains required before P5 completion.


### Duplication matching blocks

New duplication findings retain up to three matching file and line ranges, without source fragments. Finding details show **Matching blocks** links pinned to the assessed commit. Primary code remains in the source viewer. Matching locations have the same path and line bounds as other signed evidence; unsafe paths, unsupported categories and secret output cannot add these links. The bounded projection can omit further matches and remains explicitly partial when findings are truncated.

Generated scanner acceptance passed with image `sha256:1bb46d1ca943e996b14ef6e5147b3e8b76cc068c0d93eb0843afb29748493a49`: three identical files reported 39/39 duplicated lines and three linked blocks; clean and excluded-folder cases reported 0/13. Focused API checks passed 61 tests, with a subsequent 50-test receipt/report run verifying signed matching ranges; 12 finding-detail browser tests and API/web types and lint passed. This changed scanner image still requires independent qualification before connected-repository use.


### Expanded code rules and guidance v2

The fixed JavaScript/TypeScript/Python packs now also detect async Promise executors, returns in Python finally blocks, empty list/dictionary defaults, and direct Python f-string SQL statements passed to execute. Each finding records its exact source location and Preflyt guidance v2. Existing saved guidance keeps its original version and text. These targeted patterns do not cover all defects or prove exploitability; scope descriptions identify their limits.

The rebuilt Semgrep candidate `sha256:e8217da7a0302f2ca539aed504276c6acbd7cfd830b8579d84d24363367d35bf` passed all 16 generated scanner cases with image-embedded configuration: JavaScript/Python and typed TypeScript seeded and clean cases for static security, reliability, maintainability and hotspots. Per-rule identity, count, message and source-location assertions passed. Focused guidance/report verification passed 15 API tests; 28 Health/finding browser tests, API/web types and frontend lint passed. This image and its new configurations require independent qualification before connected-repository execution.


### Shared runner preparation decision

The user selected dedicated Docker qualification and required the same runner to work on Kubernetes. Preparation reuses the dedicated Docker controller and gVisor runsc for both Compose and Kubernetes-hosted applications. A separate Kubernetes-native RuntimeClass deployment remains optional and would require its own qualification. See [runner qualification](../operations/p5-runner-qualification.md). The rebuilt Semgrep candidate additionally passed 13 source-verified native-wrapper cases with expected PASS/FAIL outcomes. No connected repository ran.


The shared runner preparation reuses the existing dedicated Docker controller for both Compose and Kubernetes application hosting. A Kubernetes application does not require a second cluster-native runner. Explicit deployment selectors now choose Docker while preserving disabled admission and the existing application security/storage contract. A separate Kubernetes-native launcher remains optional.


Shared application-runner deployment verification passed 10 tests across three files. The actual Kubernetes render contains 18 resources and differs from the base only in the backend selection and disabled admission defaults. The actual Compose render uses disposable placeholder credentials and preserves every other service field. Verification summaries are local artifacts; neither deployment was applied and no runtime approval was created.


### Full regression after shared-runner preparation

Full local regression passed **140 API files / 1,518 tests**, with four optional tests skipped, and **72 browser files / 460 tests**. The browser suite emitted the previously observed ResizeObserver notification-loop message but exited successfully. The documentation production build passed after adding shared-runner downloads. The generated Kubernetes archive now includes the sibling Docker-runner overlay, and the application Compose selector is downloadable without a source checkout. Download extraction/render verification uses a disposable directory and contacts no cluster.

This completes the accumulated-change regression checkpoint, not P5 production acceptance. Live effective-isolation qualification, target-project coverage recipes and broader code-analysis scope remain incomplete. No connected repository was executed, deployment applied, runtime approval fabricated, remote branch pushed or GitHub workflow started.


### Frozen policy evidence context

New Health reports capture the published policy for the selected branch at assessment time: policy ID, revision, definition checksum and selected requirements. Existing exact-commit CI evidence is considered only when its selection, check identities and required flags match that policy and the assessment checksum is intact. The existing historical gate preview supplies outcomes; Health findings are never passed into that evaluator.

The **Policy evidence** section stays separate from file analysis. `historical-policy-evidence-v1` counts historical PASS and BLOCK outcomes as evaluated requirements, divided by the captured requirement count; INCOMPLETE is not covered. A failed requirement can therefore have sufficient historical evidence without passing the policy. The percentage is unavailable without a matching integrity-checked assessment or a nonempty denominator. Configuration-only requirements retain their configuration-only scope. This is not current merge readiness or a GitHub merge decision.

Saved policy context and evidence checksum survive report finalization and later policy changes. Missing published policy, invalid policy and missing historical evidence have explicit states; older reports are not retroactively evaluated. Scanner and CI/policy evidence remain independent. File analysis coverage still needs additional measured per-analyzer accounting and is not inferred from repository file inventory.


### Measured file analysis

New static-security, reliability, maintainability and hotspot scans use image-owned Semgrep file accounting. `semgrep-candidate-files-v1` records eligible JavaScript/TypeScript/Python files up to 1 MiB, the scanner's actual unique scanned paths, and candidate files not scanned. The signed report carries only bounded counters and a file-set checksum, without source fragments or path lists. The counts apply to the fixed recorded rule pack, not whole-repository security, policy compliance or test coverage.

**Files discovered** is repository inventory. Per-analyzer **candidate files analyzed** is measured scanner scope. Duplication and optional test coverage retain their own measured file counts; missing accounting remains unavailable. Parse/processing errors preserve valid findings while withholding successful file coverage. Empty supported scope is incomplete. Policy evidence remains separate.

The strict measured Semgrep image `sha256:ab136eaf5352c9ad2d53ea454fbae762ecf0e634e50e82124bef4bd64e2e8533` passed complete, ignored-file, malformed-Python and empty-scope fixtures, plus 13 source-verified native-wrapper cases. Focused API verification passed 124 tests across six files; Health browser verification passed 18 tests. The publication workflow now checks the negative file-accounting cases before publishing a Semgrep image; it was not run remotely. Effective runtime qualification and additional analyzer accounting remain pending.


### Verified finding locations

The dedicated controller now validates retained native Health file paths and line ranges against the verified assessed source before signing. Duplication matching locations receive the same validation. Invalid rows are quarantined, valid rows and original evidence hashes/counts remain, and the affected analysis is incomplete. Metadata-only findings can remain without invented locations. Focused verification passed 67 API tests across location validation, actual controller signing, Health projection and receipt validation; API typecheck passed. Live isolation qualification remains pending.


### Coverage framework eligibility

The built-in Node coverage recipe does not accept declared Jest/Vitest dependencies, scripts or configuration files. Missing or unreadable package manifests prevent profile-level eligibility. Before running tests, the image-owned wrapper checks the complete verified checkout and requires each selected JavaScript test file to reference `node:test`; otherwise it returns `SUPPORTED_TESTS_REQUIRED` without measured coverage. This recognizes the supported recipe conservatively, not a general-purpose test framework adapter. Dedicated recipes for Jest, Vitest, pytest and TypeScript remain pending.

Verification: 32 focused API tests and API typecheck passed. The rebuilt candidate Node image passed 12 actual disposable source-bound fixture cases, including measured successful tests, failed/skipped/no-source tests and unsupported-framework rejection. These fixtures do not qualify connected-repository execution.


### Versioned measured-scope finding history

New reports capture `findingComparison` version 1 for eligible measured Semgrep rule packs. A pack requires complete retained unsuppressed findings, successful cleanup, a non-incomplete outcome, valid report/tool/config identity, and a nonempty measured file scope without skipped candidates. Comparison binds the native-plan comparison key, pack IDs, tool/configuration and candidate/scanned file-set checksum. The graph explicitly names included packs; unrelated analyzer totals are not added. Overall report completeness and policy coverage are unchanged. Legacy reports preserve their complete-report comparison rule, and legacy/new metadata is not mixed.

Changed tool/configuration/file scope, scan errors, missing accounting and truncated finding sets prevent comparison. This enables truthful trends for the measured fixed packs without claiming complete repository health. Focused verification passed 39 API tests and 18 Health browser tests, with API/web typechecks and frontend lint passing. Other analyzer scope accounting and live qualification remain pending.


### Saved analyzer explanations

New native Health findings can retain plain-text rule descriptions and help from the exact uniquely matched SARIF driver rule. Each field is limited to 500 characters and remains inside the existing 5 KB per-check and 40 KB signed-receipt budgets. Ambiguous or mismatched descriptors, credential-bearing text and extra guidance fields are rejected. The detail page labels this as analyzer-provided advice from the saved report; it does not validate a defect, fetch report URLs or render HTML/Markdown. Truncated finding retention still makes the report partial.

Secret findings never retain scanner-provided explanations or help. They receive saved Preflyt general secret-detection guidance on secure review, revocation/rotation, removal and reassessment; this does not claim the exact detector or credential validity. Other findings without a supplied rule explanation retain the explicit unavailable state. Historical reports are unchanged.


### Regression checkpoint after source validation, scope history and saved guidance

Full API regression passed **143 files / 1,535 tests**, with four optional tests skipped (1,539 total), in 264.45 seconds. Full browser regression passed **72 files / 463 tests** in 93.90 seconds. The browser run emitted the previously observed ResizeObserver notification-loop console message but exited successfully. Production web and documentation builds passed; documentation generation confirmed all 48 example environment variables are documented.

A subsequent display fix keeps valid retained issues visible as lower bounds when their analysis is incomplete, including invalid-location quarantine and scanner processing failures. The affected Health dimension/report focus passed **23 tests** and frontend lint; the production web build includes that fix. Help now explains measured file counts, named comparable rule-pack scopes and the expanded fixed rules.

This verifies accumulated local implementation, not connected-repository execution. Independent deployed runtime/analyzer qualification, broader test recipes, additional scanner scope accounting and bounded full-result retention remain pending. No remote push, workflow publication or deployment was performed.


### Coverage source decision: CI only

The user directed coverage to come from existing CI test runs, avoiding duplicated work. This supersedes the earlier opt-in manual test recipe scope. Health no longer exposes a coverage checkbox, and new `includeCoverage: true` requests receive a validation error. New static assessments do not select test execution. Historical stored choices and measurement evidence remain unchanged and are not called CI evidence.

The attempted Vitest manual-runner expansion was removed. Coverage must now use the existing authenticated GitHub/CI evidence path, ingest an actual bounded coverage report, bind repository/run/SHA and preserve source verification, denominators and history. A GitHub App connection or successful JUnit result does not establish coverage. Until that ingestion is implemented and matching evidence exists, the new card reads Awaiting CI coverage. Focused verification passed 32 API tests, 23 Health browser tests, API/web types and frontend lint. The browser focus was rerun successfully after a transient module import failure.


### Compact metric cards and category drill-down

The hotspot card was removed at the user's request. Five metric cards use matching icons, consistent missing-result dashes and keyboard-accessible links to Findings. Security, reliability, maintainability and duplication drill down to the exact repository/Health report and category. Coverage opens a truthful coverage-evidence view without inventing a code finding or rerunning tests. Findings also supports category filtering for existing CI evidence. Health-origin finding details retain exact source identity and return to the original filtered list. Inspection-only lists withhold zero-issue metrics and explain that analysis has not run.

Automatic hotspot findings, safe explanations and optional review records remain intact; removing the card does not remove scanner evidence. Live local navigation from the Security card to the original inspection-only report's Findings list was verified, including selected Security category and fixed repository scope. Focused verification passed 25 scoped API tests and 41 browser tests across Health navigation, category mapping, Findings and finding details, with API/web types and frontend lint passing. CI coverage ingestion and live analyzer qualification remain pending.


### Inventory pass status

Removed the duplicate Selection badge column, retaining scoped repository selection controls and the final Actions column. `health-assessment-result-v1` derives PASS only for COMPLETED/EXECUTED/COMPLETE reports with complete inspection, a nonempty applicable analysis set, all analysis states PASS, explicit zero reported/retained findings and an empty finding collection. Partial or missing evidence is INCOMPLETE; complete reports with failed analyses or findings are FAIL. The inventory renders PASS as Healthy using the shared green status mapping. This result describes recorded Health analysis, never CI readiness or a GitHub merge authorization. Source SHA/freshness behavior remains unchanged.


### Shared Findings list (2026-10-12)

Findings now combines authorized CI results and retained repository Health analyzer findings in one scoped backend query. Source and Finding type filters apply before metrics and pagination. Results retain their exact repository, commit and saved report identity; Health details use the original analyzer fingerprint. Existing CI detail/source/triage APIs remain CI-only, and Health metric-card links preserve their exact saved-report scope. Inspection-only reports create no invented findings or coverage gaps. Read limits remain explicit: 200 assessments per source, 100 CI artifacts and 2,000 combined results. Live qualified execution and CI coverage ingestion remain pending.


### Overall Health summary (2026-10-12)

Added a versioned deterministic overall status to saved-report and portfolio responses. Known critical/high findings and captured required failed-check limits take precedence over missing analysis. Complete advisory findings need attention; complete clean recorded scope is healthy; partial/missing required results remain incomplete. Portfolio selection follows the selected branch, never a newer assessment from another branch. The repository Health summary and inventory use this same backend result. No numeric average or coverage/duplication percentage targets are fabricated; CI coverage ingestion and live qualification remain pending. Removed the Findings warning banner at the user's request; retained result limits remain available in the footer and Help.


### Contributor UI consistency (2026-10-12)

Converted the remaining seven native app dropdowns to the established styled Select menus. Added a compact Activity sparkline immediately after Contributor in the directory. The API zero-fills the selected UTC period from authorized filtered observations and deduplicates each day's repository/relationship/source-object participations. Only the current page's contributors receive series; activity permission denial returns null. Graphs describe recorded participation, preserve partial-collection limits and do not infer productivity or uncollected GitHub events.


### JUnit traceback source display (2026-10-12)

JUnit projection now enriches missing file/line metadata from bounded Python traceback frames and pytest source coordinates. Explicit attributes take precedence, a matching failing-test frame is preferred, ambiguous or unsafe locations remain unavailable, and failure logs never enter returned evidence. Legacy JUnit fingerprints stay unchanged to preserve finding links and review history. The existing source store verifies commit/tree/blob checksums and coordinates before capturing a redacted excerpt. The original acceptance finding resolves to test_catalogue.py:32 at commit 5266b4a5dcb0dd443eade1ab629262212fddb93d. Focused parsing, source, authorization and integrity tests pass (51 tests).


### Contributor committer-only profile fix (2026-10-12)

Contributor profile commit totals and the daily contribution chart now include both COMMIT_AUTHOR and COMMITTER observations. Stable repository/source-object deduplication counts a commit once across both roles and repeated deliveries. Original relationships remain visible in Activity; a linked commit does not imply authorship. Role filters and repository authorization remain intact. Live web-flow validation for maiguard-api over the selected 30 days shows six linked commits and a populated daily series. Focused API and UI regressions pass (31 API and 12 UI tests).


### Inline finding problem and solution (2026-10-12)

Moved the finding explanation into the affected-code card as an expanded-by-default, keyboard-accessible Problem and solution section. The reported message, saved Preflyt/analyzer explanation, suggested solution and source attribution stay beside the exact-commit excerpt. Missing rule guidance remains explicit; test failures receive general troubleshooting steps without inferring a root cause or patch from a test name. No extra request or AI generation is needed to open the panel.

Validation: finding-details and source-editor browser suites passed (18 tests), including keyboard collapse/reopen, CI and Health guidance, unavailable/denied source, mobile overflow and light/dark themes. Web type-check and changed-file lint passed. Live saved JUnit finding verified with test_catalogue.py:32 at commit 5266b4a5dcb0.


### Finding tooltip and source loading (2026-10-12)

Affected code now exposes the same saved problem, suggested solution and attribution on hover, keyboard focus/activation and tap. CodeMirror positions the tooltip outside the scrolling excerpt, with viewport bounds, theme support, Escape/outside dismissal and plaintext-only rendering. The inline panel remains available. A shared guidance projection keeps both presentations consistent without inventing a fix. Source loading uses a code-shaped, screen-reader-labeled skeleton and respects reduced motion.

Local hover, keyboard/tap, HTML escaping, 320px light/dark and teardown regressions pass. See the branch audit dated 2026-10-12 for the final accumulated verification and remaining P5 release requirements.
