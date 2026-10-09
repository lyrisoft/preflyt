# Engineering evidence UI

The repository page retains its existing Shadcn sidebar, header and tab layout. Blue and teal accents now distinguish actions, inventory and configuration; status colors retain their own meaning in light and dark themes.

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

The sidebar follows the enterprise specification: Workspace (Overview, Repositories, Assessments, Findings), Governance (Quality Gates, Engineering Standards, Policies), Intelligence (AI Intelligence), and Administration (Integrations, Access Control, Settings). The command palette uses the same navigation data. The sidebar layout, collapse controls and mobile drawer are unchanged.

The four new authenticated routes reuse the existing repository panels with a selected-repository picker. The `repository` search parameter preserves scope across reloads and links. An inaccessible or deselected repository never silently switches to another repository. These are repository-scoped views, not an organization-wide aggregation of results.

Assessments displays tracked pull requests and assessment history. Engineering Standards presents the repository catalogue and recommendations without edit actions. Policies exposes selection editing and approved CI bindings to Owners, Admins and Super Admins. Integrations displays recorded GitHub installation availability and CI evidence; connection and import actions require the same administrative roles. Backend permission enforcement remains authoritative. Recorded installation availability does not imply a live component health check.

The pages share a cached local repository inventory and do not request GitHub refresh on mount. Findings, Quality Gates, AI Intelligence, Access Control and organization Settings have explicit Planned badges and capability states until their backend features exist. Access Control and organization Settings are visible only to Owners, Admins and Super Admins; direct navigation also checks the current role before displaying the administrative state. Sidebar and command palette share this filtering. Template demo screens are not linked as Preflyt features.

Verification: four focused node tests for navigation taxonomy, role filtering, planned-module states and URL scope; web TypeScript, production bundle and lint/format checks for the changed navigation and module files. Browser tests are skipped per project instruction.

## Enterprise specification compliance boundary

This implements the specified navigation taxonomy and working entry points for available repository features. It does not complete the P0–P3 dashboard specification. Engineering Overview now has [a compact live dashboard](engineering-dashboard.md) with repository and period filters, four record-based KPI cards, an assessment activity heatmap, current PR attention and repository posture. It does not invent passing gates, blocked PRs, findings, policy coverage or service health.

Outstanding requirements: active organization/workspace selection and organization isolation; organization-scoped assessment aggregation beyond the current shared deployment; findings lifecycle; quality gate enforcement; AI investigations; member/role management; organization/AI settings; authorized entity search (the current palette searches navigation commands); notifications and help; the remaining gate/findings/verified-coverage KPI cards, verified readiness outcomes and result-based activity charts, recent findings, and real component health checks. No passing readiness state or live platform status is inferred from imported evidence or a successful page load.


## Visual summaries and charts

Repository Overview uses configuration composition and required/advisory distribution charts with legends and tooltips. Invalid saved catalogue definitions suppress the control counts and require review. Configuration hints never imply executed checks or passing gates. Controls are paginated in groups of eight, with guidance and exact-commit file/blob evidence available in a detail dialog.

Repository and global Assessments show a real snapshot activity trend from the cached local dashboard endpoint. The 7/30/90-day selector and daily/weekly grouping use exact UTC period counts, including partial weeks; this is not derived from the capped recent-history list. A zero baseline and onboarding state represent no activity. An accessible table exposes the same chart values. The overview calendar remains useful for day-by-day activity density.

Standards presents pack adoption and rule capability summaries plus compact pack cards. Policies preserves selection and source-approval concurrency contracts while moving historical approval details on demand. Assessment snapshots distinguish linked CI results, configuration-only inputs and missing inputs; tracked PRs show recorded branch/revision context. CI Activity charts label their latest-50-delivery sample and up-to-14-day window explicitly, and provider results remain separate from verified quality gate outcomes.

Repositories uses selected/unselected distribution by GitHub account, inventory filters and compact repository cards. Selection and connection controls require administrative roles. Global module scope bars preserve the requested repository across reloads and fail closed when it becomes unavailable. Integrations displays recorded installation availability, not live service health. Refresh and write actions retain their existing API contracts.

The layout and authentication shell are preserved. Verification is scoped to the frontend changes and chart transformations; browser and whole-system tests remain skipped per project direction.

Task #47 verification: 10 focused Node tests pass for UTC activity aggregation, configuration counts and CI chart semantics. Web TypeScript and the production bundle pass, together with ESLint and formatting checks limited to changed frontend files. Existing standards selection, binding approval and assessment creation editors were audited against their previous versions and remain intact.

Repository cards display language and framework icons from the newest saved profile, with named tooltips and a keyboard-visible stack description. A selected card is a full-surface native link; the administrative selection checkbox remains a separate control. Inventory uses a bounded latest-profile projection from PostgreSQL, exposing only technology names and profile timestamp/revision. Unselected repositories omit profile data, and selection changes clear old hints or refresh the local stack summary without requesting GitHub.

Card follow-up verification: eight focused mocked API tests pass for the stack projection, access boundary and absence of provider calls; API TypeScript and web TypeScript/production bundle checks pass. The touched card file passes lint and formatting. Browser interaction tests remain skipped.

Policies and the repository Standards view now expose visible Standards and CI source bindings tabs at the top. Source approval is available directly in its own pane, with existing role checks, source mappings and concurrency controls. Read-only Engineering Standards continues to show the catalogue. Scoped formatting, lint, TypeScript and whitespace checks pass for this layout change; browser tests remain skipped.

The Overview repository filter and shared module repository picker now include an inline search field, filtering loaded repository names without additional API calls. Selection still persists in the URL, and inaccessible repository scopes remain unavailable. Only Overview offers the aggregate All repositories option. The activity calendar defaults to a six-month (180-day) view, with compact green square cells, month and weekday labels, and a legend below. It retains the original left alignment and two-thirds desktop card width; smaller screens scroll horizontally rather than stretching the cells. Scoped TypeScript, lint and formatting checks pass; browser interaction and visual checks remain skipped.
