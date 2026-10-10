# Preflyt Product Implementation Guardrails for Codex / Claude

**Status:** Agent-facing implementation rules. Read before modifying Preflyt UI, product workflows or docs.

## Source of truth and priority

1. Current repository code and verified implemented behaviour: **do not claim absent features are shipped**.
2. [MVP Product Experience](../product/mvp-product-experience.md): target pages, sidebar, dashboard, workflows and UX acceptance.
3. [Enterprise UI Guidelines](../design/enterprise-ui-guidelines.md): visual/interaction design.
4. [PRD](../PRD.md), [Incremental Delivery Plan](../roadmap/incremental-delivery.md), [RBAC](../product/rbac-and-authorization.md), [Engineering Standards](../product/engineering-standards-library.md), [Contributors](../product/engineering-contributors.md), architecture ADRs.

If documents conflict with current code, **report the discrepancy and propose a safe migration**; do not silently overwrite working implementation. Product scope decisions take precedence over speculative visual polish. Keep existing P0–P11 order.

## Mandatory behaviour

- Extend the **already imported Shadcn Admin codebase**, preserving session security, Super Admin recovery, GitHub integration, repository profiles, theme, router and RBAC boundaries. [ADR-0007](../architecture/ADR-0007-github-first-identity-and-organizations.md) is the accepted GitHub-first access target; keep current OIDC operational during its explicit migration. GitHub login, owner onboarding and username grants are implemented behind a deployment flag; legacy identity merging remains pending. Never auto-link identities by email/username.
- Implement the **smallest deployable usable vertical slice** for the current phase. Do not scaffold future pages with dummy analytics and call them complete.
- Sidebar: Workspace (Overview, Repositories, Assessments, Findings, Contributors once P3 usable); Governance (Quality Gates, Engineering Standards, Policies); Intelligence (AI Intelligence and **Skills**, each only when functional); Administration (Integrations, Teams, Access Control, Settings).
- Every shipped route must include authorized API-backed data, meaningful loading/empty/error/permission-denied states, responsive layout, keyboard support and links to evidence.
- Use plain developer language in all user-facing labels, helper text, errors and empty states. Prefer “repository status”, “saved assessment”, “CI sources” and “report source verification” over “posture”, “immutable snapshot”, “source bindings” and “provenance”. Keep familiar terms such as commit, branch, pull request, CI and workflow. Explain necessary security terms where they appear; tell users what happened and what to do next. Simplify wording without changing permissions, evidence limits or check outcomes. Keep precise identifiers in technical details.
- Use **Merge review result** for Preflyt’s merge evaluation. Keep GitHub’s actual merge permission separate; an AI review never decides whether a pull request may merge.
- Never fabricate repository metrics, assessment outcomes, contributor compliance, system health or AI conclusions. Label illustrative fixtures only in tests/docs.
- Maintain **revision-bound evidence and deterministic gate semantics**. Missing mandatory checks are INCOMPLETE, not PASS; AI cannot waive or override a gate.
- Respect organization/repository-scoped RBAC in backend APIs, including contributor activity and policy data; frontend hiding is not security.
- Do not run untrusted connected-repository code without approved isolation. No privileged Docker socket shortcut.
- Do not introduce new product phases or rename/reorder existing phases without explicit authorization.
- Preserve Docker Compose operational parity; Kubernetes Operator remains planned until implemented. OTEL must remain vendor-neutral.

## Per-feature implementation workflow

1. Read affected existing routes/components/API contracts and identify current phase.
2. Identify user action, real data source, access permission, status semantics and failure cases.
3. Reuse existing components and write UI/API changes as one working vertical slice.
4. Add success/failure/unauthorized tests, responsive/accessibility checks and deployment smoke verification.
5. Update docs/acceptance, report what is implemented vs pending, and open a reviewable PR. Do not merge without explicit authorization.

## MVP release verification

Demonstrate new organization onboarding, selected repository profile, real CI assessment, deterministic policy gate and source-evidence drill-down; when Contributors P3 is shipped, verify list, charts and individual profiles. Verify no unimplemented later-stage modules masquerade as available.

- Access Control separates People, GitHub members, Roles & permissions, and Activity into tabs. Use the API-defined role catalogue; do not require users to create roles or permission definitions.
- Policy definition self-approval is permitted only for an active local Super Admin, with an explicit approval marker and audit event. Organization/repository authorization still applies. Other users require independent approval; waiver/enforcement bypass rules remain unchanged.

For a workspace that already has the GitHub App connected, use **Access Control → GitHub members → Link GitHub organization**. GitHub sign-in must be enabled and its callback registered first. The flow binds the request to the original authenticated workspace Owner session and verifies a GitHub organization owner before confirmation. It reuses the same internal organization and installation, preserves repositories, policies, grants and history, and grants that verified GitHub owner access with an audit record. It never moves an installation between workspaces or merges existing identities automatically.

- Explanatory help belongs in the shared `PageHelpDrawer`, opened by a Help button at the top right after Refresh. Group metric definitions, data sources, counting rules and limits there. Keep actual results and actionable errors/permission/partial-data warnings visible on the page. Apply this pattern when creating or updating pages.

## Mandatory badge colors

Use `StatusBadge` for status labels and the shared `apps/web/src/lib/status-tones.ts` mapping. Completed or healthy states (Synced, Approved, Active, Passed, Published, Connection tested) are green; failures are red; pending, stale or draft states are amber; information or ongoing work is blue; inactive, disabled or planned states are neutral. Never use blue for a successful sync. Add each new fixed status to the shared mapping and verify it in a regression test. Do not override semantic colors with custom CSS.

## Global action notifications

Reuse the existing Sonner `Toaster` mounted once in the root route. Successful React Query mutations declare a specific `meta.successMessage`; the global mutation cache displays it. Do not also emit a success toast in the same action. Use `meta.silent` for background housekeeping. Direct fetch actions must emit their own Sonner notification on user-triggered success/failure. Keep actionable validation and permission errors visible in the form or page. Query refresh failures use stable toast IDs to avoid stacking duplicates; cancelled requests are silent. Do not toast every initial query or successful polling refresh.
