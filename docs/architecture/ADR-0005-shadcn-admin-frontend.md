# ADR-0005: Build Preflyt on the Shadcn Admin source codebase

**Status:** Pinned source baseline imported; Preflyt screens, session-aware navigation and API integration are implemented. Remaining product scope and release acceptance are tracked separately.
**Date:** 2026-10-08
**Related:** [ADR-0001](ADR-0001-typescript-first-stack.md), [ADR-0003](ADR-0003-oidc-user-authentication.md), [ADR-0004](ADR-0004-shift-left-assessment-governance.md), [Incremental delivery plan](../roadmap/incremental-delivery.md)

## Context

Preflyt needs a responsive engineering dashboard for repositories, assessments, findings, policies, quality gates, performance and administrative configuration. Rebuilding a dashboard shell, navigation, themes and common controls from nothing would delay the first usable milestone, **P0 Repository Posture**.

The upstream [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) README explicitly states that its project is **not a starter project/template**. It is nevertheless an existing, working React/Vite dashboard **source codebase** that Preflyt may lawfully adapt subject to a current license and dependency audit. Some upstream shadcn/ui components are customized and differ from vanilla shadcn/ui; updates can require manual reconciliation.

The earlier interpretation—independently scaffold Preflyt and selectively copy individual components—does **not** reflect the implementation decision.

## Decision

**Pull the Shadcn Admin repository source, pin an audited upstream Git commit, and build Preflyt directly on top of that codebase in \`apps/web\`.**

This is a **source-code-based bootstrap / fork-and-customize approach**, **not** a claim that upstream markets or supports a generic starter template. We will import its existing application structure, layout, navigation, routing, theme and reusable UI where appropriate, then evolve that code into Preflyt's frontend. We can remove unnecessary demo pages and packages during adaptation; we do not need to recreate the initial shell from scratch.

Use React + Vite + TypeScript, Tailwind CSS and shadcn/ui while keeping the already accepted Node.js/NestJS service architecture.

### Import strategy

1. **Select and pin an upstream full commit SHA** from the official repository after reviewing its current LICENSE, README, lockfile, dependencies, open security issues and project activity. Do not pin a floating branch or tag alone.
2. **Pull/clone that revision** in an isolated working tree. Import the application source into \`apps/web\` and track it as Preflyt-owned files (not a runtime git dependency or unpinned template generator). Keep an import provenance record under \`docs/vendor/shadcn-admin.md\` with repository URL, exact commit SHA, import date, selected source directories, modifications and excluded files.
3. Preserve the upstream **license and required notices** (including attribution for vendored source and assets). Review fonts, icons, image assets and any demo content individually; remove assets without clear redistribution rights.
4. Build and smoke-test the **unmodified upstream source at the pinned revision** in a controlled workspace first, recording its runtime/dependency requirements and known limitations.
5. Integrate that source into the Preflyt pnpm/Turborepo workspace, aligning package manifests, TypeScript settings and Vite configuration. Resolve conflicts in reviewable commits; document diverging dependencies.
6. Adapt upstream layout, sidebar, navigation and dashboard components into actual Preflyt pages. Remove or replace unrelated demo/mock data, example users, placeholder modules, fake dashboards and test credentials. Retain upstream components only where their behaviour and accessibility are verified.
7. **Replace Clerk/demo authentication** with Preflyt's approved OIDC and NestJS server-managed sessions per [ADR-0003](ADR-0003-oidc-user-authentication.md). Keep source-control integrations, authorization, API data and secrets in the backend. Use the application's existing router if appropriate; choose **one** routing architecture, not two.
8. Keep track of Preflyt-specific modifications. Treat upstream updates as deliberate upgrades: compare the new upstream commit to the pinned baseline, audit vulnerabilities and component customizations, review diffs and migration implications, and test before adopting.

**Dependency and component review:** The imported source—not only individually selected components—must undergo SCA, license review, security scanning and accessibility checks. In particular, upstream customized components (including RTL changes) may diverge from shadcn CLI output and require hand-merging updates.

## Frontend boundaries

- **Preflyt controls the product:** page IA, API contracts, OIDC, authorization, policy decisions, branding and feature availability are not inherited from demo logic.
- **Backend authority:** NestJS authenticates/authorizes every action. The browser never holds GitHub App credentials, model-provider keys, cluster/sandbox credentials or decisions that should be enforced server-side.
- **Routing:** standardize on one typed router after evaluating the imported router and dependencies.
- **Data access:** use a typed API client and TanStack Query where appropriate; TanStack Table for repository/assessment/finding data. Forms may use React Hook Form + Zod; charts may use Recharts. These are implementation choices to validate against the imported versions, not mandatory reasons to rebuild the app.
- **Product readiness:** a visible module must be backed by a usable end-to-end workflow. Hide unsupported P1–P12 features rather than leaving deceptive clickable placeholders.
- **Open-source licensing:** review upstream and all dependencies/assets before distribution; record whether any code modifications require notices or other actions.

## Architecture

~~~mermaid
flowchart TD
    UP["Shadcn Admin source @ pinned upstream commit"] --> IMPORT["Vendor source into apps/web"]
    IMPORT --> SHELL["Forked React + Vite + TypeScript dashboard"]
    SHELL --> ADAPT["Preflyt branding + real screens + OIDC"]
    ADAPT --> ROUTER["One routed React application"]
    ROUTER --> DATA["Typed API client + query/table/form components"]
    DATA --> API["NestJS control plane"]
    API --> SESSION["OIDC / server-managed session"]
    API --> REPO["GitHub connection / repository profile"]
    API --> RBAC["Policy and RBAC enforcement"]
~~~

The dashboard source can be forked or vendored for our internal development process. It must not remain automatically synchronized with a changing upstream branch. The Preflyt repository is the authoritative codebase after import.

## P0 scope: a usable deployment

The first usable release integrates actual:

1. OIDC sign-in/out, session and authorization-aware navigation (no Clerk/demo auth).
2. Organization context and GitHub App installation/onboarding.
3. Repository list with search/filter and useful loading/empty/error states.
4. Repository detail showing detected language, manifests, CI, tests, Docker/IaC/migration hints and evidence/unknown states.
5. Missing-control / engineering profile summary and basic audit/status.
6. Real API data and documented disconnection/recovery handling; no fake dashboard statistics.

Importing and rendering Shadcn Admin alone is **not P0 completion**.

## Implementation tasks for P0

- **UI-01 — Baseline selection:** Review upstream source/README/LICENSE/dependencies/customizations; choose full Git SHA, record source manifest, dependency and vulnerability report, attribution requirements.
- **UI-02 — Source import:** Clone pinned upstream, verify it builds, and import the application code into \`apps/web\` as a tracked source snapshot; preserve notices and import manifest.
- **UI-03 — Monorepo integration:** Incorporate into pnpm/Turborepo, normalize build/test/typecheck/lint scripts and lockfiles, and ensure Docker-based local frontend build works.
- **UI-04 — Product adaptation:** Rebrand the existing dashboard; evolve sidebar/layout/routes, remove unrelated demo pages/data and preserve responsive/accessibility behaviour.
- **UI-05 — Identity:** Replace Clerk/mock auth with Preflyt OIDC + NestJS session, guarded routes, role-aware UX and backend RBAC tests.
- **UI-06 — Real P0 workflow:** Connect selected GitHub repos and display API-backed profile, missing-control findings and proper empty/loading/error states.
- **UI-07 — Verification:** Smoke-test app startup, onboarding, OIDC denial, revoked sessions, inaccessible repos, keyboard/responsive navigation, critical flows, component compatibility and vulnerability/license conditions.
- **UI-08 — Release:** Package complete P0 UI/API/persistence in deployable Docker Compose/Helm as applicable, with configuration, health, backups, upgrade and rollback instructions.

## Acceptance criteria

- [ ] A **full pinned upstream Git commit SHA** and provenance manifest identify exactly what source entered the repository.
- [ ] Reviewed upstream source is pulled into \`apps/web\`, compiled with the chosen toolchain and built upon directly; the app is **not** rebuilt independently merely to imitate its design.
- [ ] Imported application files, dependencies, customized shadcn components, notices and included assets are audited; incompatible/excluded content is documented.
- [ ] Upstream Clerk/demo/mock auth is replaced by Preflyt OIDC; server-side authorization and session management remain authoritative.
- [ ] One routing approach is used, with tested protected navigation, accessible themes and responsive behaviours.
- [ ] Actual GitHub onboarding, repository listing and profile are operational, with appropriate state/authorization handling.
- [ ] Nonfunctional demo views and misleading placeholder modules are removed or inaccessible.
- [ ] P0 can be installed, used, observed, upgraded and rolled back independently.

## Alternatives

| Approach | Assessment |
| --- | --- |
| **Pull and adapt complete Shadcn Admin source** | **Selected** for fastest functional frontend baseline with known modifications and a documented source import |
| Copy a handful of UI components into a new app | Rejected for P0; loses speed gained from the existing layout/router/dashboard |
| Adopt a full React-admin management framework | Not selected; adds another application framework and more opinionated data/navigation architecture |
| Rebuild dashboard from scratch | Rejected unless upstream audit proves the source unsuitable or insecure |

**Implementation status:** The source at e16c87f213a5ba5e45964e9b67c792105ec74d26 is imported into apps/web with a pnpm/Turborepo workspace. See [provenance, dependency changes and verification](../vendor/shadcn-admin.md). OIDC sign-in, first-Owner bootstrap, protected routes and initial GitHub installation/repository selection are implemented. Repository profiles, scoped access administration, contributors, standards, policies, assessments and notifications now have API-backed screens. Docker Compose packages the current application; Kubernetes packaging remains pending. Full asset/accessibility review and phase-level clean-deployment acceptance are separate release activities. See [current capabilities](../../README.md) and [delivery status](../roadmap/incremental-delivery.md). Source import alone does not complete P0.
