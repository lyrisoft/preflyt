# Engineering evidence UI

The repository page retains its existing Shadcn theme, header and tab layout.

## Standards

The CI source bindings panel displays the saved approval revision, active/inactive status and rule mappings. Owner/Admin/Super Admin sessions can open the editor after standards are adopted with intact catalogue digests. Readers have no approval action.

Choose an observed signed check/workflow identity or enter its exact App ID/check name or workflow ID. Each imported-evidence rule can be unassigned. Approval sends current standards and binding IDs to the optimistic-concurrency API; stale approvals explain the conflict and require reload/review. Saving no mappings clears them in a new historical revision. Adoption changes require reapproval. Source approval never means verified execution.

## Assessments

The Pull requests panel lists tracked PRs and exposes observed head/base refs and full SHAs, draft/open/closed state, recent GitHub confirmation, synchronization state and applicable PR/CI snapshots. It polls local read-model endpoints, not GitHub. Empty state explains webhook/worker activation and the absence of initial PR backfill. Errors, unverified context, closed/forked PRs and lookup truncation are explicit.

View assessment opens a snapshot dialog with pinned PR context, approved sources, check coverage, provider outcomes, trust labels and evidence integrity hashes. The existing assessment history also shows frozen PR/source-binding context and distinguishes approved sources from manual overrides. Manual creation remains an exact-commit action; unassigned rules use available approved bindings and manual associations are overrides.

Neither confirmation badges nor provider success imply verified execution, a quality gate or merge readiness. Historical snapshots are preserved when approvals or PR context change.

Verification: frontend typecheck, scoped ESLint and formatting checks. Browser tests remain skipped at the user's request. Global navigation, enterprise overview metrics, findings, quality gates and organization switching are separate product capabilities; no placeholder metrics are fabricated by these panels.
