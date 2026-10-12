# Preflyt website W0 design review

**Prepared:** 12 October 2026

**Status:** Design approved and W1 implemented on 12 October 2026. Retained as the design and routing contract; see the [current deployment record](../../deployment/public-homepage.md).

## Review the design

Review the integrated homepage at **http://localhost:5173/** in the existing running web app. The dashboard is at **http://localhost:5173/overview**. No separate review server is required. The React homepage is the current review source. Superseded standalone prototypes and temporary screenshots were removed after implementation.

The homepage includes a public Northstar demo workspace, authorized by the user, using the application's real metric cards, assessment calendar, activity graph and check-results chart. Its synthetic data is isolated in `apps/web/src/features/marketing/demo-workspace.ts`; no private repository API data feeds the preview. The normal authenticated dashboard remains API-backed.

## Direction for review

An engineering lead is evaluating Preflyt alongside a code review on a laptop. The dark composition keeps the product story and evidence illustration easy to scan; a complete light treatment supports bright workspaces. Twingate informs the large type, split hero, section rhythm and recurring action. Preflyt's supplied branding and cobalt primary with blue text accents provide continuity with the application.

The principal design choices are:

- A direct headline: **Engineering confidence before production.**
- A hero diagram connecting code, CI checks and standards to an assessment, with human review and GitHub rules visibly separate.
- Two substantial product sections: investigate findings with context; connect requirements to evidence.
- A quieter AI section explaining its advisory role.
- A four-step workflow followed by self-hosting, practical FAQs and a final getting-started action.
- Mobile stacks copy before artwork, simplifies the hero document and changes the workflow to a vertical sequence.

No announcement banner, customer-logo wall, commercial tiers or fabricated proof metrics are included. Those need maintained content and supporting evidence.

## Approved routing contract

The user approved **public `/` and protected `/overview` on 12 October 2026**. This approval resolves the routing decision; it does not require reconfirmation. The root/dashboard migration and default sign-in destinations are now implemented for review in the current app.

| Situation | Required behavior |
| --- | --- |
| Visit `/`, signed in or anonymous | Show the public homepage |
| Select Sign in | Open `/sign-in`; default completed sign-in destination is `/overview` |
| Verified active session on the homepage | Replace the utility Sign in action with Open workspace → `/overview`; keep public content accessible |
| Visit `/overview` without a session | Existing protected-route guard sends the visitor to sign-in with a safe return path |
| Visit another protected deep link | Preserve its path/search/hash through the appropriate sign-in and onboarding flow |
| Old root link containing valid dashboard `tab`, `days` or `repository` keys | Normalize those keys using the dashboard schema, then replace-navigate to `/overview`; authenticate there before loading data |
| Bare `/`, campaign query parameters or unknown search keys | Remain on the public homepage; do not guess a dashboard intent |
| Invalid dashboard query values | Apply the existing validation defaults; do not send invalid identifiers to APIs |
| External or malformed login destination | Reject unsafe destinations; use the existing provider-specific error handling |
| Public content with unavailable API | Keep content readable; utility defaults to Sign in without asserting session state |

Update Overview's URL while preserving its name, sidebar group, order and dashboard filters. All other workspace routes retain their current URLs. Contextual error-page actions should say Public home or Back to workspace according to their actual destination.

### Migration inventory

- `apps/web/src/routes/_authenticated/index.tsx`: move the existing Dashboard route and its search schema to `/overview`.
- `apps/web/src/features/dashboard/index.tsx`: update filter/tab navigation and route-context identifiers.
- `apps/web/src/components/layout/data/sidebar-data.ts`: Overview destination; command search derives navigation from this source.
- `apps/web/src/features/auth/setup-owner.tsx`: post-setup destination.
- `apps/web/src/features/auth/super-admin-login.tsx`: default successful sign-in destination and validated return-path behavior.
- `apps/web/src/features/auth/sign-in/index.tsx`: preserve validated return paths in the provider links; keep the current provider availability behavior.
- `apps/api/src/auth/auth.controller.ts`: OIDC success destination and its transaction-bound return path.
- `apps/api/src/auth/github-login.service.ts`: `loginReturnPath` defaults to `/` today; change the default to `/overview` while preserving validation, stored transaction return paths and identity/workspace linking routes.
- `apps/web/src/features/auth/github-onboarding.tsx`: retain the backend-provided `returnPath`; verify successful and failed onboarding/linking outcomes.
- Generated route tree, affected auth/dashboard tests and any remaining root destinations discovered during W1.

The existing sign-in route accepts a `redirect` field, but provider links currently omit it. Deep-link restoration therefore needs contract work, not just a link rename. Keep OIDC state, GitHub onboarding, explicit identity linking and Super Admin recovery intact.

## Audience and calls to action

Primary audience: engineering leads and platform teams. Developers need practical finding context; administrators need clear deployment and access requirements.

| Action | Destination | W0 decision |
| --- | --- | --- |
| Get started | `https://lyrisoft.github.io/preflyt/getting-started` | Default primary action for the self-hosted offering |
| See how it works | `#how-it-works` | In-page secondary action |
| Product | `#product` | Homepage section until W2 product pages exist |
| Self-hosting | `#self-hosting`, then `https://lyrisoft.github.io/preflyt/self-hosting` | Explain deployment before sending to technical docs |
| Docs | `https://lyrisoft.github.io/preflyt/` | Existing documentation origin/base path |
| Sign in / Open workspace | `/sign-in` / `/overview` | Current installation, no new account system |
| Source and Action | Existing `lyrisoft/preflyt` and `lyrisoft/preflyt-action` GitHub repositories | Technical evaluation links |

Getting Started, Self-Hosting and User Guide were opened successfully in the browser. The dedicated `/user-guide/repository-health` route currently displays Page Not Found on the published site; the design therefore links to the published User Guide instead. W1 must revalidate destinations before release and make documentation links configurable for deployments. No trial, booking or sales workflow is assumed.

## Claim register

All wording below is proposed public copy and remains subject to the visual/content review. Source paths establish scope; current runtime acceptance must still be checked before launch.

| Proposed claim | Supporting contract | Limit and publication decision |
| --- | --- | --- |
| Understand repository health | README; `apps/docs/docs/user-guide/repository-health.md`; repository Health service | Use with supported-analysis and qualified-runtime wording |
| See affected code at the assessed commit | Current finding/source experience; `docs/planning/branch-audit-2026-10-12.md` | Avoid promising source availability for every finding |
| Connect versioned standards, branch policies and CI results | README; Standards, Policies and Assessments features | Use; a configuration is not a passing check |
| Explain passed, failed and missing evidence | Product guardrails; shared status mapping; assessment contracts | Use as result semantics; never imply a Health report supplies PR evidence |
| Optional AI explains findings and suggests fixes | README optional AI section; finding guidance implementation recorded in branch audit | Use with configured models, source-sharing permissions and advisory limits |
| GitHub applies configured merge rules | Product guardrails and Merge Protection contract | Use; do not imply Preflyt or AI grants GitHub merge permission |
| Run in your infrastructure | Compose deployment and Kubernetes application bundle docs | Use; no Kubernetes Operator or qualified-runner claim |
| Coverage percentages, complete scanner coverage, deployment speed, reliability guarantees | No launch evidence accepted in this workstream | Omit |
| Customer adoption, testimonials, certification seals, savings | No approved material supplied | Omit |

## Visual tokens and responsive behavior

The executable values are in the [homepage stylesheet](../../../apps/web/src/features/marketing/homepage.css). The React version scopes styles and custom variables to the marketing layout, preserving workspace components and theme tokens.

The approved homepage uses Geist for headings and body text, cobalt primary actions, and scoped dark/light tokens. Embedded workspace previews retain application typography. Desktop content is capped at 1216px; responsive layouts support 320px screens.

At 850px, the menu collapses and the hero stacks. At 600px, product sections, AI, self-hosting and FAQs stack; the workflow becomes vertical. The mobile illustration omits document metadata rather than shrinking it into unreadable text. Native details/summary provide FAQ keyboard behavior. Reduced motion disables smooth scrolling and transitions.

## Asset inventory

| Asset | Source and readiness |
| --- | --- |
| Color and monochrome logos; mark | Existing `apps/web/public/images/brand` files, reused unchanged |
| Evidence-flow and finding diagrams | Original HTML/SVG/CSS compositions in this review; ready for visual review |
| Icons | Lucide symbols generated from the existing dependency; production should import Lucide React components |
| Product screenshots | Optional after visual approval; none needed to review this composition |
| Social preview | W1 derivative of the approved hero, with verified metadata |
| Customer/legal/commercial assets | No placeholder destinations or invented claims; add only approved material |

## Public HTML and deployment decision

**Selected approach:** Build-time static rendering of an explicit public route allowlist using Vite's SSR build support, React rendering and the existing TanStack route tree. Serve the generated files through the current Nginx image. Private routes remain client-rendered and session guarded. This is an engineering design selection; W1 must prove it against the installed versions before treating it as working.

Use a universal router factory with memory history for the build and browser history for the client. Render only public paths, with deterministic anonymous state and no private queries. Generate public HTML and route metadata into the client build. Keep a separate private SPA shell so Nginx does not fall back to the public homepage markup when loading `/overview` or another protected route.

Client startup must hydrate generated public markup and create a normal root for the private shell. The client startup now hydrates public HTML and mounts the private shell. Make the theme provider safe when `window` is absent; system resolution must remain safe during build-time rendering. Avoid a theme mismatch during hydration. These W1 requirements are now implemented; see the deployment record for verification.

Reference contracts: [Vite SSR and static generation](https://vite.dev/guide/ssr.html), [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), and [TanStack Router SSR](https://tanstack.com/router/latest/docs/framework/react/guide/ssr).

### Deployment defaults

- Propose `PUBLIC_SITE_URL` and `PUBLIC_SITE_INDEXABLE` as web-image build arguments, passed through the existing deployment build configuration. Values are public configuration, not secrets.
- Default indexing to false for self-hosted installations. A deliberate public deployment supplies an HTTPS canonical origin and enables indexing.
- Index only the published public allowlist. Private, sign-in, setup and onboarding responses use `noindex` independently of robots.txt.
- Keep documentation destination configurable, using the current docs URL as the initial default.
- Validate image behavior through Nginx: public HTML, private SPA fallback, asset 404s, `/api/` proxy and direct deep links.
- No runtime SSR service, new database, analytics service or CMS is needed for the first homepage.

## Review boundary

W0 delivers a reviewable visual direction, approved route choice, proposed copy, CTA map, token sheet, asset inventory and implementation contract. W1 begins when the desktop/mobile direction and copy are accepted. The public root, protected dashboard migration, default sign-in destinations and legacy dashboard query forwarding are implemented. OIDC deep-link restoration beyond its existing default callback behavior remains future work.

Review emphasis: the hero's type and illustration, section density, mobile stacking, dark/light treatments, and whether the primary getting-started action fits the intended audience.

## Implemented product tour and verification

The current homepage includes overview metrics, assessment activity, check results, Findings, Contributors and Repository details. All public records belong to the synthetic Northstar demo workspace.

- Findings includes severity filtering and real summary components.
- Contributors includes summary metrics, participation and revision-evidence charts, and a searchable directory with activity sparklines.
- Repository details includes six comparable health reports, 8/8 completed analyses, populated quality metrics, analysis coverage, and Findings/Assessment history tabs alongside policy evidence.
- Motion includes hero and scroll reveals, button feedback, and menu/FAQ/tab transitions. Reduced-motion preferences are respected and keyboard interactions remain immediate.

Desktop, mobile and narrow-screen layouts were reviewed during implementation. Build, typecheck, focused lint and 33 homepage/auth/status regression tests passed for W1. The subsequent motion change passed typecheck, lint and both focused hydration/workflow tests. This is not a full accessibility audit.

See [deployment and verification](../../deployment/public-homepage.md) for the generated HTML, private shell and repeatable hydration check. Screenshots are temporary review artifacts and are not required to build or run the app.
