# Engineering evidence UI

The repository page retains its existing Shadcn theme, header and tab layout.

## Standards

The CI source bindings panel displays the saved approval revision, active/inactive status and rule mappings. Owner/Admin/Super Admin sessions can open the editor after standards are adopted with intact catalogue digests. Readers have no approval action.

Choose an observed signed check/workflow identity or enter its exact App ID/check name or workflow ID. Each imported-evidence rule can be unassigned. Approval sends current standards and binding IDs to the optimistic-concurrency API; stale approvals explain the conflict and require reload/review. Saving no mappings clears them in a new historical revision. Adoption changes require reapproval. Source approval never means verified execution.

## Assessments

The Pull requests panel lists tracked PRs and exposes observed head/base refs and full SHAs, draft/open/closed state, recent GitHub confirmation, synchronization state and applicable PR/CI snapshots. It polls local read-model endpoints, not GitHub. Empty state explains webhook/worker activation and the absence of initial PR backfill. Errors, unverified context, closed/forked PRs and lookup truncation are explicit.

View assessment opens a snapshot dialog with pinned PR context, approved sources, check coverage, provider outcomes, trust labels and evidence integrity hashes. The existing assessment history also shows frozen PR/source-binding context and distinguishes approved sources from manual overrides. Manual creation remains an exact-commit action; unassigned rules use available approved bindings and manual associations are overrides.

Neither confirmation badges nor provider success imply verified execution, a quality gate or merge readiness. Historical snapshots are preserved when approvals or PR context change.

Verification: frontend typecheck, scoped ESLint and formatting checks. Browser tests remain skipped at the user's request. Enterprise overview metrics, findings, quality gates and organization switching remain separate product capabilities; no placeholder metrics are fabricated by these panels.

[Evidence validation](evidence-validation.md) now freezes report integrity and missing execution-trust prerequisites in new snapshots. Invalid evidence is explicitly marked INVALID; administrator uploads remain unverified.

[Signed CI provenance](ci-provenance.md) adds opt-in offline attestation verification and report controls. New validator v2 snapshots may establish report provenance while execution trust remains incomplete.

## Workspace navigation

The sidebar follows the enterprise specification: Workspace (Overview, Repositories, Assessments, Findings), Governance (Quality Gates, Engineering Standards, Policies), Intelligence (AI Intelligence), and Administration (Integrations, Access Control, Settings). The command palette uses the same navigation data. The sidebar layout, theme, collapse controls and mobile drawer are unchanged.

The four new authenticated routes reuse the existing repository panels with a selected-repository picker. The `repository` search parameter preserves scope across reloads and links. An inaccessible or deselected repository never silently switches to another repository. These are repository-scoped views, not an organization-wide aggregation of results.

Assessments displays tracked pull requests and assessment history. Engineering Standards presents the repository catalogue and recommendations without edit actions. Policies exposes selection editing and approved CI bindings to Owners, Admins and Super Admins. Integrations displays recorded GitHub installation availability and CI evidence; connection and import actions require the same administrative roles. Backend permission enforcement remains authoritative. Recorded installation availability does not imply a live component health check.

The pages share a cached local repository inventory and do not request GitHub refresh on mount. Findings, Quality Gates, AI Intelligence, Access Control and organization Settings have explicit Planned badges and capability states until their backend features exist. Access Control and organization Settings are visible only to Owners, Admins and Super Admins; direct navigation also checks the current role before displaying the administrative state. Sidebar and command palette share this filtering. Template demo screens are not linked as Preflyt features.

Verification: four focused node tests for navigation taxonomy, role filtering, planned-module states and URL scope; web TypeScript, production bundle and lint/format checks for the changed navigation and module files. Browser tests are skipped per project instruction.

## Enterprise specification compliance boundary

This implements the specified navigation taxonomy and working entry points for available repository features. It does not complete the P0–P3 dashboard specification. Engineering Overview retains real repository counts and selection onboarding; it must not invent passing gates, blocked PRs, findings, policy coverage or service health.

Outstanding requirements: active organization/workspace selection and organization isolation; organization-wide assessment aggregation; findings lifecycle; quality gate enforcement; AI investigations; member/role management; organization/AI settings; authorized entity search (the current palette searches navigation commands); notifications and help; dashboard time/repository filters, five evidence-backed KPI cards with defined denominators, readiness/activity charts, PR attention table, recent findings, full repository posture and real component health checks. No passing readiness state or live platform status is inferred from imported evidence or a successful page load.
