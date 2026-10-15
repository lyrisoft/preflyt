# Preflyt product simplification

Status: Content and workflow simplification approved; preserve the familiar grouped sidebar. Implementation proceeds one task at a time.
Date: 2026-10-10

## Product promise

Know what needs fixing before merge, and apply engineering standards consistently across repositories.

This plan governs page content, information hierarchy and everyday workflows. Preserve the familiar grouped sidebar and its direct links; the five-destination consolidation was rejected because it made tools harder to find. It does not rename or reorder delivery phases P0–P12, remove capabilities, change authorization, or imply that pending phase acceptance is complete. The friction audit remains the supporting backlog for installation and operational improvements.

## Problem

Users must understand implementation concepts before seeing value. Related actions are scattered across Standards, Policies, Merge Protection, Assessments, Check sources, AI Intelligence and Skills. Repeated metrics, history and configuration explanations compete with actionable results. More tabs alone will not solve this.

## Users and journeys

- Developer: open a result, understand the problem, inspect relevant evidence, take the next action.
- Engineering lead: identify unresolved issues, affected repositories and owners; review progress and coverage gaps.
- Organization administrator: connect repositories, choose standards, assign scope and decide whether to enable enforcement.
- Deployment administrator: install, configure and maintain the service. Deployment authority does not imply organization ownership.

## Preserve familiar navigation

| Group | Direct destinations |
| --- | --- |
| Workspace | Overview, Repositories, Assessments, Findings, Contributors |
| Governance | Merge Protection, Standards, Policies |
| Intelligence | AI Intelligence, Skills |
| Administration | Integrations, Teams, Access Control, Settings |

Simplify content and workflows inside these existing pages. Do not consolidate, hide or relocate sidebar destinations without an explicit user request. Useful next-action links may connect a workflow, but do not add duplicate navigation directories inside pages.

Existing URLs, deep links and authorized global command search remain available. Nested routes highlight their own sidebar destination, with repository detail routes highlighting Repositories. Personal settings remain available to signed-in users; contributor visibility and privileged operations retain their current permissions.

## Default-screen rule

Information belongs on the default screen only if it helps users understand a result, make a decision or take an action.

- Show the result, important problems and next action first.
- Keep failed checks and missing required results visible. Passing checks can be collapsed.
- Keep the commit, scope and age visible but compact.
- Put hashes, verification internals, execution diagnostics and full history in Details.
- Avoid duplicate summaries, libraries, charts and configuration explanations.
- Give empty states one useful next step, tailored to current access.
- Preserve semantic badge colors and existing shared UI components.
- Missing, stale or unverified evidence never becomes a passing result through presentation changes.
- Preflyt's Merge review result remains distinct from GitHub's permission to merge. AI cannot override deterministic gates.

## Safe defaults

Reuse existing CI and saved standards. Recommend standards when none are selected; start in observe mode. Publish policies and activate merge enforcement through existing explicit approvals. Keep AI optional: useful built-in guidance belongs to an AI Review; model configuration happens once, with Model Router and skill version management available when needed. Never silently enable source sharing or connected-repository execution.

## Ordered implementation tasks

Only one task is active. Complete its acceptance checks and record evidence before starting the next task. Keep changes local during iteration; do not trigger repeated GitHub Actions or image builds.

### S1 — Preserve navigation and simplify entry points (restored locally)

The earlier five-destination consolidation is superseded. Restore the established Workspace, Governance, Intelligence and Administration groups and their direct links. Remove the extra page-level navigation directories introduced by that consolidation. Retain useful onboarding and report improvements.

Acceptance:
- The established groups, order and direct destinations are preserved, subject to existing permissions.
- Command search uses the same authorized navigation source without duplicate entries.
- Nested pages highlight their own destination; old deep links remain valid.
- Settings opens a useful existing tab: Workspace for organization admins, Notifications for other members, or Configuration for a deployment admin without workspace administration access. Legacy management-directory links remain valid; identity-link callbacks remain visible.
- Personal preferences remain reachable; Access Control, contributor data and deployment configuration retain authorization boundaries.
- Focused local navigation/permission checks, TypeScript and scoped lint pass; keyboard navigation and narrow layouts remain usable.

### S2 — Make repository reports actionable (complete locally)

Assessments opens as a paginated list. Show the commit, age, evaluated checks out of the total, passed, failed, incomplete and saved merge review result. Each row opens a shareable report view with a scoped Back link. Merge Protection manages branch rules and GitHub merge enforcement, with a scoped link to Assessments rather than a duplicate history list. Reports lead with the result, failed or missing required checks, evidence and next action. Expand one compact check row at a time; put coverage and evaluation internals in Details. Preserve report revision, freshness and unknown states.

Acceptance: the list supports comparing assessments without opening every report; the report answers what happened and what to do next. Evaluated counts only checks with a completed passed or failed result, including required and optional checks. Incomplete or unverified evidence does not become evaluated or passing; unavailable counts appear as a dash. AI reviews remain separate. Existing repository report links remain valid. Optional details are discoverable; no result semantics change; both history and checks use five rows per page; role/empty/error/mobile states are verified.

### S3 — Unify standards, assignment and enforcement (complete locally)

Policies opens on Branch policies, with CI jobs in a separate tab. Create a policy by choosing its branch and standards in one form. Standards remains the library for creating and editing reusable standards; remove the separate repository-standards assignment step from Policies. Each policy keeps its selected versions, and organization/team requirements are included automatically. Review, approval, publication and merge enforcement retain their existing boundaries. CI jobs connects results from existing pipelines when needed; it is not a prerequisite for creating a policy.

Acceptance: Branch policies and CI jobs are separate tabs; New policy includes the standards picker; different branches can use different saved standards without changing another policy; no repository-standards card appears in Policies. Existing assessments and policies remain readable, inherited requirements cannot be weakened, and missing CI evidence never becomes a passing result.

### S4 — Simplify connections and AI setup (implemented; verification deferred)

Within the existing Integrations, AI Intelligence and Skills pages, prioritize the GitHub connection path and clear connection health/recovery. Keep their direct sidebar links. Present AI as optional reviews with useful default skills. Keep model routing and infrastructure details advanced. Split larger installation improvements from the friction audit into bounded follow-up tasks before implementing them.

Integrations contains GitHub connection and repository access management only. Workflow results and automatically received reports remain in repository CI activity; policy results remain in Assessments. There is no manual report upload flow. CI results and Delivery timeline are separate tabs with server-backed pagination and ten rows per page. CI results retain commit filtering and charts of the latest 50 deliveries.

Acceptance: each connection has a clear status and next action; a review can be configured without learning model-routing internals; secrets and source-sharing controls remain intact; no unsupported feature is presented as available.

### S5 — Remove residual clutter and validate value (source review complete; usability validation deferred)

Audit the completed journeys for redundant charts, counters, cards, labels and dead ends. Keep metrics only when they support an engineering decision. Test with representative developer, lead and admin scenarios.

Acceptance: a new admin reaches a useful repository report without coaching; a developer identifies the next action quickly; an engineering lead identifies the priority issue and owner. Record actual observed completion time, errors and assistance; do not claim targets as measured results.

## Validation and delivery

Use local fixtures for regression tests and existing authenticated sessions for authorized read-only checks. Do not alter production data to make a demonstration look successful. Preserve the dirty working tree. Batch publication after local verification, subject to the user's CI-cost constraint.

## Progress log

- 2026-10-10: Direction documented and approved through the conversation. First-report onboarding and assessment tabs/pagination exist locally; broader workflow acceptance remains S2 work.
- 2026-10-10: Earlier S1 consolidation completed locally, subsequently rejected and superseded by the sidebar restoration below. Five primary destinations, contextual links, preserved command search and parent-route highlighting implemented. Personal Settings is accessible without requesting privileged workspace settings; configuration and Access Control remain restricted. Identity-link callbacks remain reachable. Validation: 24 distinct focused tests across navigation, command search, Settings and workspace modules passed in local Chromium; 320px light/dark checks, TypeScript, production build and scoped lint passed. An existing ResizeObserver notification appeared during the combined browser run; the targeted Settings/search follow-up completed cleanly. No GitHub Actions or image publication triggered. S2 is next; no S2 work started as part of this task.

- 2026-10-10: S2 complete locally. Reports now lead with a single Merge review result and next action; required failures appear first, followed by incomplete required checks. Passing and optional checks remain available through the custom filter. One check list replaces the duplicated gate list; evidence and verification remain expandable, with five checks per page. Commit, standards revision and collection age remain visible; different-commit and collection-limit warnings are explicit. Execution diagnostics stay in Technical details. Report headers omit unrelated repository inspection controls and metadata. Validation: 21 distinct focused local Chromium tests passed across report states and shared badge semantics, with a targeted mobile screenshot follow-up; TypeScript, production frontend build and scoped lint passed. Local fixtures covered passing/failing/incomplete/optional results, successful CI without verified execution, access failures with cached data, loading, empty read-only state, creation permission, pagination and 320px light/dark layouts. The authenticated live report was not inspected in this tool session. No backend gate semantics, publication, enforcement or source-sharing settings changed; no GitHub Actions or image builds triggered. S3 remains queued.

- 2026-10-10: User rejected the five-destination sidebar because it increased discovery effort. Restored Workspace, Governance, Intelligence and Administration with their original direct links and order; removed the extra page-level navigation directories. Settings uses its existing role-appropriate tabs, while legacy links and identity-link callbacks remain reachable. First-report onboarding and the S2 report simplification are retained. Plan and implementation guardrails now preserve the familiar sidebar and limit simplification to page content and workflows. Validation: 22 distinct focused local Chromium tests passed across navigation, command search, Settings and access boundaries; restored mobile navigation was checked at 320px in both themes, including focus and closing on navigation. TypeScript and scoped lint passed. An initial test fixture used a mobile viewport for desktop assertions; the corrected sidebar fixture passed its targeted rerun. No GitHub Actions, image builds, backend or database changes. S3 remains queued.

- 2026-10-10: S3 complete locally and applied to the running checkout. Policies now offers repository, team and organization scope in one place. Repository standards use a bounded version selector and a review step before saving; historical selections remain explicit. Removed the repeated adoption charts and full catalogue cards. Team and organization assignment reuse the existing server impact preview and exact preview hash before creating drafts; organization scope is prepared only by an explicit action and never includes future repositories automatically. Branch drafts have their own review step and a frozen standards-selection token; approvals and publication retain existing authorization. Policy history uses five rows per page, and published policies link to the existing GitHub merge-protection review. Check sources remain available behind an explicit configuration action. The original sidebar is untouched. Validation: 44 distinct focused local Chromium tests passed across standards, policies, assignment, workspace integration and badge semantics; the older team test expectation was updated for the clearer requirements wording and passed its targeted rerun. Checked desktop screenshots, 320px light/dark layouts, keyboard focus, historical versions, conflicting/empty previews, access failures, read-only roles, stale selections and approval boundaries. TypeScript, scoped lint and frontend production builds passed, including the applied running checkout. An existing ResizeObserver notification appeared in an earlier combined browser run; later affected tests completed without it. API behavior was verified from the existing contracts; browser actions used local fixtures, not real policy publication or ruleset activation. No backend/database changes, GitHub Actions or image builds. S4 is next.

- 2026-10-10: Refined S2 after the populated-report review. Assessments and Quality Gates → Results now open a five-row list; each row links to a dedicated shareable report view with a scoped Back link. The list exposes commit, age, evaluated checks out of the total, passed, failed, incomplete and saved merge review result. Counts use the server evaluation for the exact commit, include required and optional checks and exclude AI reviews. Only passed or failed checks count as evaluated; missing, unverified or unknown results remain incomplete. Access failures, mismatched commits and unsupported formats show unavailable counts. Reports use five compact check rows per page with one expanded row; coverage and evaluation internals are under Details. Removed the report selector and duplicate nested summaries. Existing repository report links and the original sidebar remain valid. Validation: 38 distinct focused local Chromium tests verified across assessments, workspace integration and shared badge semantics, including desktop columns, narrow content areas, 320px light/dark layouts, keyboard expansion, pagination and cached-data access failures. Two new count assertions initially matched both the report link and its metric; exact metric selectors resolved the ambiguity, and the targeted follow-up passed. TypeScript, scoped lint and the applied running checkout frontend production build passed. Authenticated navigation showed the updated Quality Gates tabs, but final populated report validation used local fixtures because the user was actively navigating the browser. No backend/database changes, GitHub Actions, image builds, policy publication or enforcement changes. S4 remains queued.

- 2026-10-10: Fixed native assessment report navigation: TanStack parses unquoted numeric GitHub repository IDs as numbers, so the prior string-only search validator dropped the repository. Search validation now normalizes valid numeric IDs to strings and still rejects invalid numeric/object scope; it never falls back to another repository for a scoped report. Renamed Quality Gates to Merge Protection and Engineering Standards to Standards in the sidebar, headers, help and related page references, preserving existing URLs and backend identifiers. Removed the repeated assessment history from Merge Protection. It now defaults to Branch rules, retains GitHub results and provides a repository-scoped View assessments link. Legacy gate-results links open protection controls; legacy originating-report links retain their Back destination. Validation: 19 focused local Chromium tests passed across numeric report routing, missing/inaccessible scope, default and legacy protection routes and renamed navigation. TypeScript, scoped lint and the applied frontend production build passed. The combined test run emitted the existing ResizeObserver notification with all tests passing. Authenticated browser inspection confirmed the renamed Merge Protection page and actual GitHub branch rules. Further live report navigation was interrupted by the user’s active browser work; the numeric-ID regression and report display were verified with local router fixtures. No backend/database changes, hosted CI, policy changes or enforcement activation. This supersedes the duplicated results-list arrangement in the previous progress entry.

- 2026-10-10: Follow-up to S3: the hidden Check sources configuration was confusing. Policies and repository standards now show CI jobs directly after saved standards, before branch policies. Removed the duplicate configure toggle and decorative counters. Each check shows its connected job or a clear missing state. The compact Connect CI jobs dialog starts with received job names and a concrete example; exact identifiers are available only through explicit manual entry. Empty job lists explain running CI and refreshing, with webhook troubleshooting expandable; disabled collection and failed reads have distinct recovery guidance. Unchanged or empty first-time setup cannot be saved, existing connection removal is visible before saving, and stale selections require explicit resave. Existing exact-identity matching, revision tokens, authorization, saved assessment evidence and approval semantics are retained. Validation: 29 distinct focused local Chromium tests passed across CI connections, standards ordering and badge semantics; the final spacing adjustment passed three targeted desktop/mobile checks. Desktop and 320px light/dark screenshots were reviewed. TypeScript and scoped lint passed. No backend/database changes, CI job dispatch, policy publication or hosted CI.

- 2026-10-10: Simplified branch-policy creation and applied directly to the running codex/p0-p3-phase-closure checkout. Policies now defaults to Branch policies and separates CI jobs into its own tab. Removed the Repository standards card; New policy selects its branch and standards in one form. Existing versioned definitions hold each policy’s standards, without a schema migration or changing repository defaults. Pipeline-result connections follow the selected policy, and inherited requirements, approval permissions and missing-evidence rules are retained. This supersedes the earlier saved-standards → CI jobs → branch-policy ordering. Local validation: 27 focused browser tests and 35 API integration tests passed; the applied frontend production build passed. The final 27 browser tests, frontend TypeScript and scoped lint also passed directly in the running checkout. The earlier broader API regression passed 106 tests. Full API typecheck remains blocked by the existing missing PolicyException Prisma model, unrelated to this change. No GitHub Actions were triggered. Future changes are made directly in the running checkout, as requested.

- 2026-10-10: S4 applied directly to the running branch. Integrations opens the existing GitHub connection panel by default, with per-account repository management or reconnect actions and installation identifiers under Details. Reduced connection-card spacing. AI Models explains the optional connect/test → stage assignment → approved skill journey. Removed the always-present availability banner when execution is enabled. Hosting and Primary connection / Fallback connection use shared custom dropdowns. Daily budget stays visible; token limits remain mounted under Advanced limits so saving does not reset them. Source sharing, automatic PR reviews and publishing remain explicit opt-ins. Model errors show in the open form rather than twice on the page and form. Secrets, permissions and backend contracts are unchanged. Tests were updated but not run; no builds, typechecks, lint or GitHub Actions were run, as requested.
- 2026-10-10: Follow-up to S4: removed token prices from Add model and Configure/Edit model, and removed daily cost budgets and input/output token settings from Model Router. AI review admission and workflow rewriting no longer require prices, reserve cost or enforce saved token budgets. Removed cost estimates from review history and pricing guidance from Help. Historical database fields are retained but ignored and omitted from configuration responses. This supersedes the S4 budget controls above. Regression tests were updated and left unrun, as requested.
- 2026-10-10: S5 source review completed for admin connection/setup, developer assessment/evidence and lead findings journeys. Replaced Control register with Repository checks and Configuration found with Related files found, using informational blue rather than implying a passed check. Inspection now points users to Assessments for actual run results. Retained the requested assessment graph above tabs, separate report details, standard drawers, paginated lists and familiar sidebar. Review findings and deferred validation are in product-simplification-s5-review.md. No user completion times were measured; representative usability sessions and the batched regression remain pending until requested. These changes do not close separate delivery-phase acceptance gaps.

- 2026-10-10: Removed the inline AI setup instructions after user feedback; the setup sequence now lives in the existing Help drawer. The Models page leads directly with provider connections. No tests or builds run.

- 2026-10-10: Replaced Merge Protection → GitHub results with PR checks. One paginated list shows the latest manual or automatic check per PR, target branch when recorded, GitHub publication state, current verified Preflyt result and last update. Unknown/pending rows cannot show an old stored conclusion as Passed. Assessment links include the repository scope. Empty disabled publishing shows one setup message instead of three empty sections. Automatic publishing moved to Settings → PR checks, with repository-scoped permissions; manual preview/publication is an authorized dialog. Existing approval, exact-commit preview hashes and publication verification remain unchanged. Added source-level UI expectations and an API integration scenario for combined pagination and scope; neither was run. No builds or GitHub Actions.


## Setup simplification — 11 October 2026

Supersedes the editor-first setup and repeated model/publishing configuration above. Applied directly on the running `codex/p0-p3-phase-closure` checkout:

- Standard cards expose View YAML. A modal shows syntax-highlighted, read-only YAML and a Copy snippet button. Individual checks and the selected policy have snippets too; a policy combines its execution checks into one step.
- Workflow setup leads with the snippet. The editor and AI rewrite are optional. Connect workflow validates the committed setup and creates source mappings. Create setup PR installs files and connects the workflow in one action; repair is shown only if its connection failed.
- Public Preflyt API URL is configured once by a deployment administrator. GitHub runners cannot use localhost. The local Action has four files and reuses installed repository tools; it does not install scanners or package managers. Custom tooling still needs its repository command/result path.
- Model setup uses one Models table and tests on save. One default model is reused unless a stage has an explicit override. Successful connection tests no longer expire daily; changed configuration invalidates them. Source sharing remains explicit.
- PR feedback settings centralize policy check publication, policy summary comments and optional AI feedback. No token prices or budgets are required.

Tests were written/updated and left unrun. No tests, builds, lint, typechecks, hosted Actions, external PRs or repository workflow changes were performed for this increment. Public Action release and real-PR acceptance are still pending. Current-run identity, signed evidence, approval and authorization requirements remain in force; missing evidence cannot pass.

## Template route cleanup

- Removed the demo Tasks, Chats, Users, Help Center and error preview routes, their fixture data and template-only components.
- Removed the template Settings forms. Existing `/settings` bookmarks redirect to the real Preflyt Settings page; notification and appearance links select their matching tabs. Active PR feedback links now use `/organization-settings?tab=pr-checks`.
- Retained the API-backed repository inventory at `/repositories` (legacy `/apps` links redirect), the dashboard, real error pages, authentication routes and original sidebar groups.
- Removed unused charts, table helpers, icons, form widgets and their obsolete tests. Test execution remains deferred to the user's requested full run.
