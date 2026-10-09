# Historical quality gate preview

The Quality Gates page is an **observe-only P2 foundation**, backed by selected repository assessment snapshots. Choose a repository and snapshot to inspect the exact SHA, frozen rules, evaluator version, deterministic evaluation hash, outcome and source evidence. The same panel is available in repository assessment details. Empty/error/permission states reuse the shipped snapshot workflow.

`GET /github/repositories/:repositoryId/assessments/:assessmentId/gate-preview` requires live `assessment.read` permission and repository assignment. It verifies the existing assessment digest before evaluating. No GitHub request, database migration, additional service or model is required. Deploy the updated API and web images together using the existing Compose services.

Evaluator v1 reads only the frozen plan/report. It never edits an assessment, upgrades its policy, borrows evidence from another SHA or claims current branch readiness. Unsupported snapshot schemas, inconsistent required rules, missing requirements, incomplete/truncated collections and missing exact-revision profile evidence yield INCOMPLETE.

A supported configuration requirement may PASS when its configuration was observed in a complete pinned profile with evidence. This confirms configuration only. All execution rules remain INCOMPLETE: current import contracts do not establish tool identity, execution environment and rule coverage. Provider success, manual mapping and signed report provenance cannot satisfy these prerequisites. Unsupported required adapters remain INCOMPLETE; incomplete advisory rules produce WARN only if every required requirement is satisfied. Empty policies never PASS.

The immutable report's existing `qualityGate: null` is unchanged. Historical previews are not GitHub checks or merge-readiness decisions. BLOCK/NOT_APPLICABLE execution evaluation, fully trusted executed-rule adapters, policy publication/activation, exceptions, current-head invalidation and exact-SHA GitHub check publication remain later P2 work. Contributor adherence and dashboard gate scores remain unavailable.

Scoped tests cover deterministic outcomes, malformed/truncated/cross-revision policy data, integrity rejection, authentication and repository-scope bypass. Browser tests remain skipped by user instruction.
