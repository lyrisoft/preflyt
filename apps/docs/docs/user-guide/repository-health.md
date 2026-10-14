---
id: repository-health
title: Repository health
sidebar_label: Repository health
description: Read branch analysis, exact-revision findings, limits and report history separately from CI.
---

# Repository health

Health assesses a selected branch without requiring CI. Explicit repository selection queues the first assessment; **Reassess** creates another revision report. The API and worker fetch the exact selected commit and coordinate work. The built-in scanner service automatically runs every applicable fixed Health analyzer in isolated containers. GitHub connection, repository selection and existing Preflyt permissions are the authorization; no additional approval, policy selection or CI workflow is required. Health never installs dependencies or executes repository scripts.

## Read a report

**Repositories** uses one inventory table. Its **Health status** column shows the latest saved assessment, its branch and a **View report** link. Repositories without a report have an **Open Health** link. Summary metrics are in **Engineering Overview → Health**. Repository details retain the existing check-configuration design. The first tab, **Health**, opens by default for analysis reports. The **Checks** tab shows detected setup files and selected checks. Standards, CI assessments and CI activity retain their own tabs.

| Label | Meaning |
| --- | --- |
| Not assessed | No Health report exists. An authorized user can start one. |
| Queued | Waiting for worker capacity. |
| Running | Inspecting the pinned source or waiting for analyzer results. |
| Completed | A report was saved; check its completeness separately. |
| Failed | Source access or analysis did not establish a completed result. |
| Cancelled | Work was cancelled; admitted execution waits for cleanup. |
| Complete | All applicable analyses have full recorded coverage, verified outputs and retained findings within limits. |
| Partial | Inspection, analyzer coverage, valid output or retained findings are incomplete. |
| Inspection only | No analyzer ran. Finding counts and repository health are unavailable. |
| Current | The report commit matches the selected branch head when last checked. |
| Stale | That branch head has advanced beyond the report. |
| Freshness unverified | GitHub could not be checked, the cached check expired, or this is a historical report for another branch. |

Branch checks are cached for one minute. Open or refresh Health to check again; Overview does not poll every repository's branch. The last check time is shown. P5 does not start a full scan on every push.

## Supported analysis defaults

| Analysis | Applicability | Current adapter and limits |
| --- | --- | --- |
| Secret detection | Selected repositories | Gitleaks; recorded full-rule scope can be verified. Secret values and excerpts are hidden. |
| Static security analysis | JavaScript, TypeScript or Python source paths | Semgrep CE with reviewed local rules. Coverage is partial and depends on those rules. |
| Dependency vulnerabilities | Recognized dependency manifests or lockfiles | Trivy with a reviewed offline database. Coverage is partial; database freshness is required. |
| Reliability | JavaScript, TypeScript or Python source paths | Reviewed local Semgrep rules for NaN comparisons and broad exception catches. Narrow rule coverage; findings require code review. |
| Maintainability | JavaScript, TypeScript or Python source paths | Seven local Semgrep rules for debugging remnants, nested conditionals, redundant error handling, Python dynamic execution, mutable defaults and wildcard imports. Findings require code review. |
| Duplicated code | Supported JS/TS, Python, Java, Go, Ruby, PHP, C#, CSS/SCSS, SQL and Rust paths | jscpd 4.3.0 with a fixed, reviewed scope. Unique duplicated physical lines / analyzed physical lines; overlapping blocks count once. Source ranges link to the assessed revision. |
| Security hotspot review | JavaScript, TypeScript or Python source paths | Reviewed Semgrep rules identify MD5 use for human context review. A hotspot is not a confirmed vulnerability. |
| Test coverage | Existing Vitest, Jest or Node test scripts and lockfiles | Runs configured tests in an isolated workspace at the assessed commit and collects measured line coverage. Missing or incomplete reports stay unavailable. |
| Infrastructure configuration | Terraform or recognized Kubernetes/Helm paths | Trivy configuration analysis. Coverage is partial. |

These analyzers are selected from detected files; supported rules and languages determine their recorded scope. The packaged Health scanner prepares pinned images and checks isolation automatically. No signed runtime approval is required. Binary, oversized, generated or linked files are excluded explicitly. Source or scanner failures remain visible instead of becoming clean results. General native repository-command execution has separate controls; see [Native execution](native-execution.md).

**Analyses completed** counts checks with validated analyzer output; **Files inspected** counts discovered source files and is not an analysis coverage denominator.

Reliability and maintainability findings are classified separately when their reviewed adapters run. The seven maintainability rules cover JavaScript/TypeScript debugger statements, nested ternaries and redundant catch/rethrow blocks, plus Python dynamic execution, mutable defaults, wildcard imports and redundant exception handlers. Readability and redundancy findings are low severity; each finding explains its impact, suggested change and limits. A zero means none of these patterns was reported in the analyzed scope, not perfect maintainability. New rules apply on reassessment; saved reports retain their original coverage. These rule packs do not provide broad language coverage or a quality grade. Duplication measurements require the reviewed jscpd adapter. Health detects supported repository test scripts and collects coverage during reassessment. Complexity still needs a qualified measured source. Overall health uses the completeness and failure rules described below, rather than averaging unrelated metrics into an arbitrary score.

## Findings and source

**Findings over time** shows available results above the metric cards. Each bar is the count of retained findings in a saved scan, including incomplete scans. Amber bars and **Partial analysis** labels identify incomplete coverage: those counts may increase when more analysis completes. Different bar heights alone do not prove improvement.

The comparison line connects only equivalent, fully retained measured scopes. It names the static-security, reliability, maintainability or hotspot rule packs included in that comparison; bars still include all retained findings. Each compared pack must analyze a nonempty candidate scope without skipped files, incomplete outcomes or truncated/suppressed findings, and match the earlier tool, configuration, plan and candidate/scanned file-set checksum. Changed coverage breaks the line rather than implying improvement. Older reports retain their original complete-report comparison requirement.

The graph uses the latest 30 completed reports on the displayed branch, up to the displayed report, independently of history pagination. **View chart data** lists UTC times, coverage labels, retained and comparable counts, and links to original reports. Inspection-only reports and missing counts are not plotted as zero. A partial report can show zero retained findings only when an analyzer recorded a measured count; it does not mean the repository is clean. No-longer-reported does not prove remediation.

Filter by severity or search the report. Open a finding to navigate to a dedicated details page for its rule, file, severity, affected code and evidence. **Back to Health report** returns to the exact saved report. Findings are **analyzer-reported potential issues**, not independently validated defects or vulnerabilities.

The source viewer verifies the regular Git blob at the assessed commit and saves a redacted excerpt with up to five lines before and after the reported line. It highlights the line only when it exists. Missing locations, large or binary files, symlinks, submodules, lost access and source-verification failures produce an explanation instead. Secret findings show numbered surrounding code and mask the entire reported range before storage, because scanner receipts do not retain safe value-level masking coordinates. Obvious credentials in surrounding context are also redacted. New reports queue excerpt capture in the background. Older findings capture their excerpt on first open. Later visits load the saved excerpt from Preflyt after checking current repository access.

Counts exclude suppressed results and deduplicate matching findings from the same analyzer. Each analysis retains up to 5,000 supported findings from an 8 MiB report; the complete receipt has a separate 8 MiB encoded payload limit. Additional retained details may be trimmed across analyzers to fit that limit, preserving their outcomes, reported totals, measured counters and cleanup evidence. Highest-priority findings are retained first. A lower-bound value such as ≥132 means results are incomplete; missing details never establish zero issues. Truncation or invalid locations can make the report partial. **Zero reported findings applies only to the recorded scope**, not the whole repository. These bounded details belong to Health; the existing Findings page continues to track CI assessment issues.

## Reassessment and history

Owners, Admins and Security Engineers with repository access can reassess or cancel. Choose another branch and select **Reassess** to persist the new target. Reports retain their original branch, SHA, evidence and timestamps. History is paginated by branch.

Requests are limited to ten per repository per hour and one per minute on the same branch. Duplicate requests and retries reuse the active job. Complete reports with compatible tools, configuration and analysis scope can show introduced and no-longer-reported counts. No-longer-reported does not independently prove a fix.

## Continue with CI

Health does not publish a readiness check, satisfy a branch policy or authorize a merge. To receive feedback on each PR, review standards and [set up pull request checks](pull-request-checks.md). Saving standards, publishing policies, AI source sharing and activating protection remain explicit actions.

## Engineering Overview

Engineering Overview keeps its original repository, PR and CI assessment activity summaries. Select the fourth **Health** tab to switch the four summary cards to repository health, followed by assessment status and up to five high or critical findings. Each finding links to its saved repository report. The repository filter applies to both views; the period selector is hidden on Health because it uses the latest saved reports across all time. The period selector affects CI assessment totals and the activity calendar, not the all-time repository status or recently tracked open PR list. The calendar measures assessment volume, not repository health.

Repository health summaries and reports are on Repositories. Open a repository's first **Health** tab for its analysis outcomes, findings, exact commit and history.

## Loading reports and checking freshness

Saved reports, metrics and history load from Preflyt immediately. GitHub branch-head verification runs separately in the background, so a slow upstream check does not hold up the report. **Current** requires a recent verified head match; an expired or failed head check displays **Freshness unverified**. Freshness checks are cached for one minute and refresh while the Health tab is open. The compact Repository health panel combines assessment details, actions and the findings graph, followed directly by metrics. An unavailable timeline uses a short explanation without plotting missing analysis as zero.

### Duplication formula v1

`unique-lines-v1` calculates **100 × unique duplicated physical lines / analyzed physical lines**. The displayed percentage rounds to one decimal place. Each physical line in matching blocks counts once per file, including overlapping matches; every analyzed physical line is included in the denominator. This is a recorded-scope measurement, not a grade or a guarantee about unscanned files.

The fixed scanner ignores comments and whitespace for matching, requires at least five lines and fifty tokens, and excludes `node_modules`, `.git`, `vendor`, `dist`, `build` and `coverage` directories. It scans the supported formats above, skips files over 1 MB or outside its line limits, and ignores repository-controlled `.jscpd.json`, package configuration and ignore files. Empty or failed analysis is unavailable, never 0%. Findings retain their full block range and exact commit. The signed report contains measurements and locations, not duplicated source fragments.

### Human hotspot review

The **Security hotspots** card counts findings detected automatically at the assessed commit; it does not measure human review. Open a hotspot from Health to inspect its code and saved explanation. Human review is an optional triage step, separate from automatic assessment. A repository role with finding management permission can record **To review**, **In review**, **Reviewed: no change needed**, or **Reviewed: fix required**. Both completed decisions require a rationale. Other authorized repository readers can see the decision and rationale. Concurrent edits require refresh rather than silently overwriting a reviewer.

`reviewed-retained-hotspots-v1` calculates **100 × unique retained hotspots with either completed decision / total unique retained hotspots**. This percentage describes completed human review, not security health or fixes applied. Invalid, truncated or suppressed hotspot output has no percentage. Zero reported hotspots displays no hotspots, not 100% reviewed. A decision applies to its original assessment and commit; reassessing creates a fresh review scope even when a similar finding remains.

The hotspot review table and audit events are separate from immutable scan results. Reviewing never alters findings, CI evidence or GitHub merge protection. **Fix required** remains a recorded decision until a later assessment supplies new evidence.

### Fetching source and assessment failures

Health downloads scan source with a shallow Git fetch of the pinned commit, using a temporary GitHub App token scoped to the selected repository. The source broker reads Git objects directly; it never checks out a worktree or runs hooks, filters, submodules or Git LFS. File/tree hashes, executable modes and existing source limits are verified before handing the credential-free bundle to scanners. The temporary object store is deleted after success or failure. The worker image includes Git.

GitHub access checks, branch inspection, repository profiles and finding excerpts still use the GitHub API. Git source retrieval reduces bulk file API requests; it does not remove authentication or API rate limits. A fetch is bounded to ten minutes, monitored against a 256 MiB temporary-object budget and subject to the existing 64 MiB selected-source limit. Download-limit, timeout, unavailable Git and access failures remain failed assessments with explicit next steps.

Failed assessments show their reason in the report header and history, including attempts that stopped before a commit was pinned. GitHub rate-limit failures show a retry time when it was recorded. **Technical details** provides the assessment ID and a recognized failure code for support. Provider messages, credentials and raw Git stderr are never displayed. Select **Reassess** after resolving the problem; users without assessment permission ask a repository maintainer to retry.

### Automatic test coverage

Select **Reassess** to detect and run the repository’s existing test setup. No individual tests need to be selected. Preflyt reads package manifests, lockfiles and framework configuration names as data; the repository’s test runner then selects tests using its own configuration.

The initial supported frameworks are **Vitest, Jest and Node’s built-in runner**, with **npm, pnpm 10 and Yarn Classic** lockfiles. Declared npm/Yarn or pnpm workspaces are discovered package by package. Nested independent packages need their own lockfile. Root workspace orchestration is skipped when package test scripts are run directly. Other languages, Yarn Berry, browser binaries, private registries and tests requiring external services are not supported by this execution image.

For a custom script, open **Repositories → Health → Tests and coverage**, choose the framework, enter its package directory and save a command such as `npm run test:unit --`. Preflyt appends coverage and result-report flags. The override replaces the detected command for that package; other detected packages still run. Clear the override to return to detection. Saving requires permission to run assessments, uses revision checks to avoid overwriting another edit and takes effect on the next assessment. Existing reports retain their captured settings.

Dependencies are prepared separately with repository install scripts and package-manager hooks disabled. Tests run without network access or platform credentials in a bounded, disposable workspace. Vitest’s matching coverage provider is prepared when absent. No GitHub Actions workflow is started or modified. Native build dependencies that require install scripts may be unavailable.

The report lists package outcomes. Coverage is the union of measured source lines across successful packages, not an average of package percentages. The source, settings, image and report are tied to the assessed commit. This measures what the repository’s configured tests and instrumentation report; it does not establish test quality or whole-repository coverage. Failed, skipped or zero tests, missing reports and unsupported setup remain incomplete, with a reason and next action. No missing percentage becomes 0% or 100%.

Preparation is limited to five minutes; test collection is limited to 4 minutes 45 seconds overall and three minutes per package. Each phase has 1 CPU, 2 GiB RAM and a bounded 2 GiB dependency workspace. Cleanup is required before results can be accepted. Historical Node measurements retain their original loaded-file formula. Health coverage remains separate from CI policy evidence and merge decisions.

### Saved finding guidance

New Health reports save Preflyt rule guidance v1 for packaged static security, reliability, maintainability, MD5 hotspot and duplication rules. Finding details show why the pattern was reported, how to address it, and its limits below the affected code. Guidance is advice, separate from signed analyzer evidence. Saved reports retain their guidance text and version. Historical reports and unknown external rules show an explicit unavailable explanation rather than guessed rule semantics. Secret detection, dependency and infrastructure rules still need rule-specific guidance ingestion.


### Exact analyzer scope

New reports retain an analysis-scope description with each analyzer outcome, shown in **Analysis coverage**. The current static security, reliability, maintainability and hotspot packs support JavaScript, TypeScript and Python only, with their specific patterns listed. Java, Go, Ruby, PHP and C# source can participate in duplication analysis but is not covered by these code-rule packs. `.mjs` and `.cjs` files are included in JavaScript applicability. Saved scope descriptions survive report finalization; historical reports are not rewritten to claim broader coverage. Broad language and rule coverage remains required before P5 completion.


### Duplication matching blocks

New duplication findings retain up to three matching file and line ranges, without source fragments. Finding details show **Matching blocks** links pinned to the assessed commit. Primary code remains in the source viewer. Matching locations have the same path and line bounds as other signed evidence; unsafe paths, unsupported categories and secret output cannot add these links. The bounded projection can omit further matches and remains explicitly partial when findings are truncated.

Generated scanner acceptance passed with image `sha256:1bb46d1ca943e996b14ef6e5147b3e8b76cc068c0d93eb0843afb29748493a49`: three identical files reported 39/39 duplicated lines and three linked blocks; clean and excluded-folder cases reported 0/13. Focused API checks passed 61 tests, with a subsequent 50-test receipt/report run verifying signed matching ranges; 12 finding-detail browser tests and API/web types and lint passed. This changed scanner image still requires independent qualification before connected-repository use.


### Expanded code rules and guidance v2

The fixed JavaScript/TypeScript/Python packs now also detect async Promise executors, returns in Python finally blocks, empty list/dictionary defaults, and direct Python f-string SQL statements passed to execute. Each finding records its exact source location and Preflyt guidance v2. Existing saved guidance keeps its original version and text. These targeted patterns do not cover all defects or prove exploitability; scope descriptions identify their limits.

The rebuilt Semgrep candidate `sha256:e8217da7a0302f2ca539aed504276c6acbd7cfd830b8579d84d24363367d35bf` passed all 16 generated scanner cases with image-embedded configuration: JavaScript/Python and typed TypeScript seeded and clean cases for static security, reliability, maintainability and hotspots. Per-rule identity, count, message and source-location assertions passed. Focused guidance/report verification passed 15 API tests; 28 Health/finding browser tests, API/web types and frontend lint passed. This image and its new configurations require independent qualification before connected-repository execution.


### Frozen policy evidence context

New Health reports capture the published policy for the selected branch at assessment time: policy ID, revision, definition checksum and selected requirements. Existing exact-commit CI evidence is considered only when its selection, check identities and required flags match that policy and the assessment checksum is intact. The existing historical gate preview supplies outcomes; Health findings are never passed into that evaluator.

The **Policy evidence** section stays separate from file analysis. `historical-policy-evidence-v1` counts historical PASS and BLOCK outcomes as evaluated requirements, divided by the captured requirement count; INCOMPLETE is not covered. A failed requirement can therefore have sufficient historical evidence without passing the policy. The percentage is unavailable without a matching integrity-checked assessment or a nonempty denominator. Configuration-only requirements retain their configuration-only scope. This is not current merge readiness or a GitHub merge decision.

Saved policy context and evidence checksum survive report finalization and later policy changes. Missing published policy, invalid policy and missing historical evidence have explicit states; older reports are not retroactively evaluated. Scanner and CI/policy evidence remain independent. File analysis coverage still needs additional measured per-analyzer accounting and is not inferred from repository file inventory.


### Measured file analysis

New static-security, reliability, maintainability and hotspot scans use image-owned Semgrep file accounting. `semgrep-candidate-files-v1` records eligible JavaScript/TypeScript/Python files up to 1 MiB, the scanner's actual unique scanned paths, and candidate files not scanned. The signed report carries only bounded counters and a file-set checksum, without source fragments or path lists. The counts apply to the fixed recorded rule pack, not whole-repository security, policy compliance or test coverage.

**Files discovered** is repository inventory. Per-analyzer **candidate files analyzed** is measured scanner scope. Duplication and test coverage retain their own measured file counts; missing accounting remains unavailable. Parse/processing errors preserve valid findings while withholding successful file coverage. Empty supported scope is incomplete. Policy evidence remains separate.

The strict measured Semgrep image `sha256:ab136eaf5352c9ad2d53ea454fbae762ecf0e634e50e82124bef4bd64e2e8533` passed complete, ignored-file, malformed-Python and empty-scope fixtures, plus 13 source-verified native-wrapper cases. Focused API verification passed 124 tests across six files; Health browser verification passed 18 tests. The publication workflow now checks the negative file-accounting cases before publishing a Semgrep image; it was not run remotely. Effective runtime qualification and additional analyzer accounting remain pending.


### Saved analyzer explanations

New native Health findings can retain plain-text rule descriptions and help from the exact uniquely matched SARIF driver rule. Each advice field is limited to 500 characters. Static Health reports accept up to 8 MiB and retain up to 5,000 supported findings per analyzer, within an 8 MiB signed-payload budget shared by the assessment. CI artifact import limits are unchanged. Ambiguous or mismatched descriptors, credential-bearing text and extra guidance fields are rejected. The detail page labels this as analyzer-provided advice from the saved report; it does not validate a defect, fetch report URLs or render HTML/Markdown. Truncated finding retention still makes the report partial.

Secret findings never retain scanner-provided explanations or help. They receive saved Preflyt general secret-detection guidance on secure review, revocation/rotation, removal and reassessment; this does not claim the exact detector or credential validity. Other findings without a supplied rule explanation retain the explicit unavailable state. Historical reports are unchanged.


Valid findings retained from an incomplete analyzer still appear in dimension counts as a lower bound, for example **≥3**. Missing or excluded evidence does not become zero; an incomplete result with no retained findings shows **—**.


### Finding categories from Health cards

Health shows five clickable cards: Security, Reliability, Maintainability, Duplication and Test coverage. Missing metrics consistently display **—**. Clicking an analysis card opens **Findings** for the same repository and saved Health report, filtered to that category. The category selector can explore other findings within that report. Opening a finding retains its original commit and source viewer; Back to findings restores the category filter. Coverage opens the coverage evidence view and explains why test execution or coverage collection was incomplete. Inspection-only reports explicitly state that analysis has not run instead of showing zero-issue metrics.

The hotspot metric card was removed. Automatic hotspot findings and optional review records remain available in the saved report and Findings category selector; no human review is required to receive automatic analysis results.


### Healthy repository status

The inventory's **Health status** shows **Healthy** in green when a completed, executed assessment has complete recorded analysis, no reported findings, and every applicable recorded analysis passed. Partial, inspection-only or incomplete evidence cannot become Healthy. Completed analysis with findings shows **Findings reported**. The result describes the saved commit and recorded scope; it does not grant merge permission or guarantee all risks were analyzed. A **Stale** badge remains visible when the branch has advanced.

The duplicate Selection status column was removed. Authorized users retain the repository selection checkbox.


## Overall health

Overall health summarizes the latest saved assessment on the selected branch and commit. It never averages previous commits or mixes raw finding counts with coverage percentages. Critical/high retained findings or a captured required analysis failing its policy limit produce **Unhealthy** (red), even when another analysis is missing. Without a known blocking failure, missing or partial applicable analyses, invalid policy context or missing required coverage produce **Incomplete** (gray). Complete results with advisory findings produce **Needs attention** (amber). Complete clean results meeting recorded requirements produce **Healthy** (green). Queued/running assessments retain their progress state. Freshness is shown separately; a healthy historical commit does not establish the current branch is healthy.

The evaluator uses captured policy `maxFailedChecks` limits for supported Health analysis IDs. The current policy contract does not configure coverage or duplication percentage targets; no percentage limits are invented. Coverage stays tied to the captured test run, and absent coverage blocks Healthy only when recorded requirements require it. This summary does not change CI gate evidence or GitHub merge permissions.

### Visible scan progress

An active assessment shows a spinner and its current stage above the report: inspecting the commit, fetching files, preparing scanners, scanning, verifying results or reconnecting. The page polls automatically. Queued work shows a waiting message; progress never invents a percentage or displays unfinished metrics as completed results.

### Incomplete scanner reports

Valid findings are retained even when another analyzer fails or a parser cannot read every file. **Scope and evidence** lists bounded scanner error types and affected file locations when the scanner supplies them. Parser errors remain incomplete; they never turn into a clean result. Review the listed source syntax or update the scanner for compatible parsing. These diagnostics omit raw source, scanner messages and credential values.

Secret findings identify recognized credential types and show potential impact (medium for generic API-key patterns; high for recognized access tokens, private keys and authorization headers). A pattern match does not prove a credential is live. Dummy test data can match too; verify the reported file and line before acting. Matching values remain hidden; numbered surrounding code shows developers where to look.

The duplication measurement excludes dependency/build folders, generated folders, type declarations and minified JavaScript. Its denominator is the recorded analyzed scope.
