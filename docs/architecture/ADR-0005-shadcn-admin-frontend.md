# ADR-0005: Shadcn Admin as the Preflyt frontend foundation

**Status:** Selected for implementation planning; dependency verification and implementation pending  
**Date:** 2026-10-08  
**Related:** [ADR-0001](ADR-0001-typescript-first-stack.md), [ADR-0003](ADR-0003-oidc-user-authentication.md), [ADR-0004](ADR-0004-shift-left-assessment-governance.md), [Incremental delivery plan](../roadmap/incremental-delivery.md)

## Context

Preflyt needs a responsive and accessible product UI for repositories, assessments, findings, quality gates, engineering policies, performance reports and operational configuration. The initial usable release **P0 Repository Posture** must ship an integrated GitHub repository workflow, not merely a visual dashboard. Building generic sidebar/navigation/table/form/theme foundations from scratch would distract from differentiated assessment and governance functionality.

## Decision

Use the MIT-licensed open-source **[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** project as the **starting frontend template** for **React + Vite + TypeScript**, adapting its layout, navigation and existing presentation components within `apps/web`. Treat the template as a UI starter, **not** the authoritative application framework, API, authentication provider or product data model.

- Use Tailwind CSS and shadcn/ui primitives for reusable UI; maintain a Preflyt-owned design/token system and accessibility requirements.
- Prefer the template's TanStack Router approach when compatible with the selected version; standardize on **one** router, rather than mixing React Router with TanStack Router.
- Use TanStack Query for NestJS API data fetching, caching, invalidation and error handling; use TanStack Table for data-intensive repositories, findings, assessments and runs.
- Use React Hook Form + Zod (or equivalent validated forms) for configuration and policy forms, and Recharts where operational charts genuinely help.
- Authenticate humans with Preflyt's **existing OIDC + server-side session** architecture in [ADR-0003](ADR-0003-oidc-user-authentication.md); replace/remove any template-specific Clerk or mock-auth flows. NestJS remains authoritative for authorization and RBAC.
- Keep feature availability controlled by real backend support and roles. **Do not display nonworking feature pages** as if P1–P11 modules are already shipped.
- Version-lock and review template and transitive dependency versions; preserve license notices/attribution as required. Audit component accessibility, maintenance/security and compatibility before importing.

**Explicit non-decision:** We are **not** adopting a second admin framework such as React-admin or Shadcn Admin Kit alongside the chosen template. Individual compatible UI primitives may be evaluated independently without taking its router, authentication or data-provider architecture.

## P0 application scope

Required **usable** UI:
1. OIDC login/logout, session state, first-owner bootstrap and authorization-aware navigation.
2. Organization context and GitHub App connection/onboarding state.
3. Repository list with connection status, search/filter, loading/empty/error states.
4. Repository detail and evidence-backed engineering profile (language, CI/test tooling, manifests, Docker/IaC/migration clues, and unknowns).
5. Missing-control report and basic audit/status page.
6. Settings sufficient to manage the first connected repositories and see integration errors.

**Deferred modules** should be represented by route registration and product documentation, not deceptive clickable placeholders. Later increments add Assessment, Findings, Quality Gates/Policies, local/QA/Performance evidence, and production feedback as real working functionality.

## UI architecture

~~~mermaid
flowchart TD
    Browser["Preflyt browser / React + Vite"] --> Shell["Shadcn Admin-derived app shell"]
    Shell --> Router["Single typed router"]
    Router --> Pages["Feature modules enabled when shipped"]
    Pages --> Data["TanStack Query + typed API client"]
    Data --> API["NestJS API"]
    API --> OIDC["OIDC provider / server-managed session"]
    API --> Repo["GitHub integration + profile assessment"]
    Pages --> UI["shadcn/ui + TanStack Table + validated forms"]
    API --> Policy["Backend RBAC and policy decisions"]
~~~

**Ownership:** React renders authorized state and UX; NestJS enforces resource-level permissions, OIDC sessions, policy decisions and secrets. Browser receives no provider API keys, GitHub App secrets, sandbox credentials or trusted quality-gate decision authority.

## Alternatives considered

| Candidate | Assessment |
| --- | --- |
| **Shadcn Admin** | Selected: React/Vite/TypeScript, customizable UI starter with a relatively low framework lock-in risk |
| Shadcn Admin Kit | More extensive CRUD components but a different React-admin/data/router opinion; not initially adopted |
| React-admin | Mature and capable, but too opinionated for Preflyt's custom assessment journeys as the starting point |
| CoreUI | Mature admin layout, but Bootstrap style and free template conversion effort diverge from selected UI stack |
| Build entirely from scratch | Would add navigation/layout/theme/table work that provides little Preflyt-specific value |

## Implementation tasks for P0

- **UI-01:** Audit upstream repository license, provenance, current dependency versions, CVEs and maintenance; record pinned upstream commit/tag and attribution.
- **UI-02:** Import only needed template assets/components and standardize package management under pnpm/Turborepo in `apps/web`.
- **UI-03:** Implement Preflyt branding, responsive navigation, dark/light themes, empty/loading/error states, and accessibility checks.
- **UI-04:** Replace template auth with OIDC redirect/session flow, guarded routes and role-aware UI, with NestJS RBAC tests.
- **UI-05:** Build working GitHub onboarding, repository list and profile/detail views backed by the P0 API.
- **UI-06:** Test onboarding, repository selection, denied access, disconnected GitHub, empty results, keyboard navigation, responsive layouts and error recovery.
- **UI-07:** Package the **whole usable P0 release**, including frontend build, NestJS API, persistence, healthchecks and deploy/rollback documentation. An imported template alone is not a completed phase.

## Acceptance

- [ ] P0 deploys with a functioning branded Preflyt React frontend; no unimplemented modules falsely appear usable.
- [ ] Users sign in via the configured OIDC provider, and protected routes and backend operations respect RBAC.
- [ ] An authorized user connects a selected GitHub repository and sees a real detected repository profile and missing controls.
- [ ] Data tables support meaningful loading, empty, error, filters and pagination as required by actual data size.
- [ ] Frontend is responsive, keyboard accessible, and supports approved light/dark themes.
- [ ] A template upgrade is versioned/reviewed, testable, and does not override Preflyt's authentication, routing or security architecture.
- [ ] Third-party licenses/attribution and lockfile checks are recorded.
- [ ] Docker Compose or supported deployment can install, smoke-test and roll back P0 as a usable release.

**Implementation status:** Architecture selection only. No frontend template code has yet been imported.
