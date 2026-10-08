# ADR-0005: Shadcn Admin as a selective UI reference for Preflyt

**Status:** Selected for implementation planning; dependency verification and implementation pending  
**Date:** 2026-10-08  
**Related:** [ADR-0001](ADR-0001-typescript-first-stack.md), [ADR-0003](ADR-0003-oidc-user-authentication.md), [ADR-0004](ADR-0004-shift-left-assessment-governance.md), [Incremental delivery plan](../roadmap/incremental-delivery.md)

## Context

Preflyt needs a responsive and accessible product UI for repositories, assessments, findings, quality gates, engineering policies, performance reports and operational configuration. The initial usable release **P0 Repository Posture** must ship an integrated GitHub repository workflow, not merely a visual dashboard. Reusable open-source layouts and UI patterns can accelerate this work, but importing an example dashboard wholesale can introduce unnecessary sample routes, data, authentication flows and customized components. The upstream project explicitly says it is **not a starter project/template**; this decision must not treat it as one.

## Decision

Use the open-source **[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** project as a **selective dashboard UI reference and potential component source**, not as a ready-to-clone starter template. Its [upstream README](https://github.com/satnaing/shadcn-admin/blob/main/README.md) explicitly states that it is *not a starter project/template* and explains that several shadcn/ui components have upstream-specific customizations.

**Preflyt will initialize and own its React + Vite + TypeScript application independently in `apps/web`.** After an upstream review, engineers may adapt only approved layouts, navigation patterns and presentation components into the Preflyt design system. The repository itself is not the Preflyt application scaffold; none of its example screens, assumptions, routing or authentication architecture are adopted automatically.

- Use Tailwind CSS and shadcn/ui primitives for reusable UI; maintain a **Preflyt-owned** design/token system and accessibility requirements. Prefer upstream vanilla shadcn/ui primitives where sufficient; selectively adapt upstream-modified components only with a documented need.
- Select and configure a **single Preflyt-owned router** (TanStack Router is the current candidate); the upstream project's routing remains a reference, not an inherited constraint. Do not mix TanStack Router and React Router application architectures.
- Use TanStack Query for NestJS API data fetching, caching, invalidation and error handling; use TanStack Table for data-intensive repositories, findings, assessments and runs.
- Use React Hook Form + Zod (or equivalent validated forms) for configuration and policy forms, and Recharts where operational charts genuinely help.
- Authenticate humans with Preflyt's **OIDC + server-side session** architecture in [ADR-0003](ADR-0003-oidc-user-authentication.md). **Do not import** upstream Clerk, demo/mock auth, or session assumptions. Implement guarded routes against Preflyt's own session API; NestJS remains authoritative for authorization and RBAC.
- Keep feature availability controlled by real backend support and roles. **Do not display nonworking feature pages** as if P1–P11 modules are already shipped.
- **Before any code is copied/adapted**, pin a specific upstream **full Git commit SHA** and record it in a reviewable component provenance manifest. Audit the *selected* files, modifications, transitive dependencies, licenses and required attributions. Do not treat unpinned upstream HEAD as a reproducible dependency.

### Provenance and import controls

For every imported or adapted component, maintain a tracked entry recording:

- Upstream URL and **full pinned commit SHA**, original file path, destination path and checksum of source.
- Whether the component is unchanged, copied with modifications, or independently reimplemented from a visual pattern.
- Customized upstream behaviour (including RTL, style, accessibility or shadcn CLI compatibility), its rationale, and any changes retained or discarded.
- Direct/transitive dependencies introduced; security and license checks; attribution or license-notice obligations.
- Preflyt-specific accessibility, responsive and interaction tests and a responsible reviewer.

The Shadcn Admin README notes that some components are **customized** and may require manual merges if updated using the shadcn CLI. Treat upstream upgrades as individual reviewed imports, **not** a blanket template or automatic sync. Reevaluate compatibility rather than overwriting Preflyt-owned code.

**Explicit non-decision:** We are **not** adopting another admin application framework such as React-admin or Shadcn Admin Kit, nor copying Shadcn Admin wholesale. Individual compatible UI primitives can be evaluated without adopting their routing, authentication or data-provider architectures.

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
    Browser["Preflyt browser / React + Vite"] --> Shell["Preflyt-owned app shell"]
    Reference["Pinned upstream UI reference / selected components"] -.-> Shell
    Shell --> Router["Single Preflyt-owned typed router"]
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
| **Shadcn Admin** | Selected **as a selective UI reference/component source**, *not* a starter template. Inspect customized components and minimize imports. |
| Shadcn Admin Kit | More extensive CRUD components but a different React-admin/data/router opinion; not initially adopted |
| React-admin | Mature and capable, but too opinionated for Preflyt's custom assessment journeys as the starting point |
| CoreUI | Mature admin layout, but Bootstrap style and free template conversion effort diverge from selected UI stack |
| Build all UI visuals from scratch | Would repeat generic navigation/layout/theme work, while still offering full control. Instead, keep Preflyt's app scaffold and selectively adapt audited presentation patterns. |

## Implementation tasks for P0

- **UI-01:** Independently scaffold Preflyt React + Vite + TypeScript in `apps/web`; review upstream README and license, **pin full Git commit SHA before importing**, and record planned component paths, required modifications, dependency/CVE and license assessments.
- **UI-02:** Selectively adapt approved layout/navigation/components only; maintain the component provenance manifest, customized-component diffs, third-party notices and tests. Do **not** clone upstream as the application starter. Integrate with pnpm/Turborepo.
- **UI-03:** Implement Preflyt branding, responsive navigation, dark/light themes, empty/loading/error states, and accessibility checks.
- **UI-04:** Implement Preflyt OIDC redirect/session flow, guarded routes and role-aware UI from Preflyt-owned contracts; do not bring upstream demo/Clerk auth into the application. Verify NestJS RBAC.
- **UI-05:** Build working GitHub onboarding, repository list and profile/detail views backed by the P0 API.
- **UI-06:** Test onboarding, repository selection, denied access, disconnected GitHub, empty results, keyboard navigation, responsive layouts and error recovery.
- **UI-07:** Package the **whole usable P0 release**, including frontend build, NestJS API, persistence, healthchecks and deploy/rollback documentation. A copied dashboard or static shell alone is not a completed phase.

## Acceptance

- [ ] P0 deploys with a functioning branded Preflyt React frontend; no unimplemented modules falsely appear usable.
- [ ] Users sign in via the configured OIDC provider, and protected routes and backend operations respect RBAC.
- [ ] An authorized user connects a selected GitHub repository and sees a real detected repository profile and missing controls.
- [ ] Data tables support meaningful loading, empty, error, filters and pagination as required by actual data size.
- [ ] Frontend is responsive, keyboard accessible, and supports approved light/dark themes.
- [ ] Any upstream component update is pinned to a full Git SHA, independently reviewed and tested; no wholesale upstream sync overrides Preflyt-owned authentication, routing or security architecture.
- [ ] Imported/adapted pieces have recorded origin paths, checksums, changes, dependencies, customized behaviour, attribution and license review.
- [ ] Docker Compose or supported deployment can install, smoke-test and roll back P0 as a usable release.

**Implementation status:** UI reference decision only. No upstream code has been imported, no import commit has yet been selected, and no app scaffold is claimed to be implemented. The **exact upstream commit must be pinned and approved at import time**, with a component-level audit before use.
