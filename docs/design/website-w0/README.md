# Preflyt website W0 design review

**Prepared:** 12 October 2026

**Status:** W1/W2 delivery and routing contract retained. W3 and the current Linear-style editorial homepage revision are implemented. Technical verification passed; visual acceptance and launch remain pending. See the [current deployment record](../../deployment/public-homepage.md).

## Review the design

Review the integrated homepage at **http://localhost:5173/** in the existing running web app. The dashboard is at **http://localhost:5173/overview**. No separate review server is required. The React homepage is the current review source. Superseded standalone prototypes and temporary screenshots were removed after implementation.

The homepage includes a user-authorized synthetic Northstar workspace using the application's real metric cards, assessment calendar, activity graph and check-results chart. Its data is isolated in `apps/web/src/features/marketing/demo-workspace.ts`; no private repository API data feeds the preview. Visible “Demo workspace” captions have been removed from illustrations and previews. The normal authenticated dashboard remains API-backed.

## Direction for review

An engineering lead is evaluating Preflyt alongside a code review on a laptop. The current user-provided Linear-style references inform a left-aligned hero above a wide app view, original isometric figures, open flat sections, generous spacing, heading/copy columns and soft edge fades. Preflyt supplies its branding, cobalt actions, Geist typography, sign-in-derived branch/code artwork and populated Northstar product evidence. Colored boxed feature canvases from the earlier Twingate direction have been removed.

The principal design choices are:

- A left-aligned headline: **Engineering confidence before production.**, with short supporting copy and the Get started / Explore Preflyt actions.
- A full app view beneath the headline, up to 1280px wide, with the actual sidebar catalogue and groups, organization identity and global header. Static illustrations scale a 1728px application canvas. Public illustration sidebars omit Preview badges; the hero no longer uses floating metric cards.
- Three original animated isometric figures: Repository health, Revision-bound evidence and Clear merge review. They replace the earlier benefit strip, animate once on entering the viewport and remain static with reduced motion.
- Five open product sections: Repository health, Findings, Contributors, Standards & evidence and Merge Protection, with headings beside concise copy and quiet feature links.
- Layered scenes with a scaled full-app background, focused product widget foreground and soft outer-edge fades. Metrics, charts and tables use the authorized synthetic Northstar records.
- The interactive workspace tour presents full Findings, Contributors and Repository details screens at native responsive dimensions, including their populated charts. Composed product scenes remain decorative and inert.
- AI's advisory boundary remains clear in product copy and FAQs.
- A four-step workflow followed by self-hosting, practical FAQs and a final getting-started action.
- Mobile stacks copy before artwork, keeps product windows within the page width and changes the workflow to a vertical sequence.

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

### Implemented migration inventory

- `apps/web/src/routes/_authenticated/overview.tsx` and dashboard search schema retain dashboard filters at `/overview`.
- Sidebar and command search use the Overview destination without changing workspace groups.
- `apps/web/src/features/auth/return-path.ts` validates internal destinations for provider links, Super Admin recovery and owner setup.
- OIDC login and bootstrap transactions store their destination server-side; callbacks use that stored destination instead of callback query parameters.
- `apps/api/src/auth/auth-return-path.ts` is shared by OIDC and GitHub login, defaults to `/overview`, and rejects external, malformed and normalized double-slash destinations.
- GitHub onboarding continues using its backend-provided destination and existing identity/workspace linking checks.
- The additive migration `20261012150000_oidc_return_paths` was applied locally and Prisma regenerated.

Sign-in now forwards validated `redirect` values through provider links and Super Admin access. First-owner setup uses the bootstrap response's server-bound destination. OIDC state, PKCE, browser binding, transaction expiry/replay checks, GitHub onboarding, explicit identity linking and Super Admin recovery are retained.

## Audience and calls to action

Primary audience: engineering leads and platform teams. Developers need practical finding context; administrators need clear deployment and access requirements.

| Action | Destination | Current behavior |
| --- | --- | --- |
| Get started | `https://lyrisoft.github.io/preflyt/getting-started` | Default primary action for the self-hosted offering |
| Explore Preflyt | `#platform` | Hero secondary action |
| How it works | `#how-it-works` | In-page navigation action |
| Product | `/product` and its three capability pages | Delivered in W2 |
| Self-hosting | `/self-hosting`, then published deployment docs | Explain deployment before sending to technical docs |
| Docs | `https://lyrisoft.github.io/preflyt/` | Existing documentation origin/base path |
| Sign in / Open workspace | `/sign-in` / `/overview` | Current installation, no new account system |
| Source and Action | Existing `lyrisoft/preflyt` and `lyrisoft/preflyt-action` GitHub repositories | Technical evaluation links |

The W1/W2 record contains published documentation link checks. Public pages currently use the existing published documentation destination; an installation-specific documentation URL override is not implemented. Revalidate external destinations before launch. No trial, booking or sales workflow is assumed.

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

The public pages use Geist for headings and body text, cobalt primary actions, and scoped dark/light tokens. Embedded workspace previews retain application typography. Header, hero, product sections and footer share a 1280px desktop content cap and responsive side gutters. Static full-app compositions scale a 1728px canvas, while interactive tour screens retain native responsive layout. Responsive layouts support 320px screens. The current appearance remains awaiting review.

Responsive layouts collapse the navigation, stack heading/copy columns and scale static product windows within the page width. The isometric figure columns become a vertical sequence on narrow screens. Native details/summary provide FAQ keyboard behavior. SVG signals and entrance effects remain restrained; reduced motion disables decorative animation, smooth scrolling and transitions.

## Asset inventory

| Asset | Source and readiness |
| --- | --- |
| Color and monochrome logos; mark | Existing `apps/web/public/images/brand` files, reused unchanged |
| Section illustrations | Original SVG geometry adapted from Preflyt sign-in artwork; revised hero and section use awaiting visual review |
| Engineering figures | Three original code-native isometric SVGs with captions, once-on-enter path/layer animation and static reduced-motion presentation |
| Icons | Existing Lucide React and approved provider silhouettes |
| Product visuals | Real app components using authorized synthetic Northstar data; scaled full-app compositions and native interactive Findings, Contributors and Repository details screens |
| Social preview | W3 branded 1200×630 PNG with canonical/share metadata |
| Customer/legal/commercial assets | No placeholder destinations or invented claims; add only approved material |

## Public HTML and deployment decision

**Implemented approach:** Build-time static rendering of an explicit six-route public allowlist using Vite's SSR build support, React rendering and the existing TanStack route tree. The current Nginx image serves the generated files. Known private routes remain client-rendered and session guarded; unknown paths receive a rendered noindex 404 page. Public builds run with network requests disabled. Focused W3 production routing and hydration checks passed; 135 web checks passed in one grouped run for the current editorial revision.

Use a universal router factory with memory history for the build and browser history for the client. Render only public paths, with deterministic anonymous state and no private queries. Generate public HTML and route metadata into the client build. Keep a separate private SPA shell so Nginx does not fall back to the public homepage markup when loading `/overview` or another protected route.

Client startup hydrates generated public markup and mounts a normal root for the private shell. Legacy dashboard query links on `/` intentionally mount the client router so the guarded redirect to `/overview` preserves filters; a regression verifies the actual sign-in destination. Theme/direction providers support deterministic build-time rendering and resolve browser preferences after hydration.

Reference contracts: [Vite SSR and static generation](https://vite.dev/guide/ssr.html), [React hydration](https://react.dev/reference/react-dom/client/hydrateRoot), and [TanStack Router SSR](https://tanstack.com/router/latest/docs/framework/react/guide/ssr).

### Deployment defaults

- `PUBLIC_SITE_URL` and `PUBLIC_SITE_INDEXABLE` are web-image build arguments passed through the existing deployment build configuration. Values are public configuration, not secrets.
- Default indexing to false for self-hosted installations. A deliberate public deployment supplies an HTTPS canonical origin and enables indexing.
- Index only the published public allowlist. Private, sign-in, setup and onboarding responses use `noindex` independently of robots.txt.
- Public links currently use the published documentation URL; deployment-specific override remains a follow-up.
- Validate image behavior through Nginx: public HTML, private SPA fallback, asset 404s, `/api/` proxy and direct deep links.
- No runtime SSR service, new database, analytics service or CMS is needed for the first homepage.

## Review boundary

The public root, protected dashboard migration, default sign-in destinations, legacy dashboard query forwarding and W3 internal deep-link preservation are implemented and technically verified. W1/W2 remain delivered. The current editorial revision passed its technical checks and awaits visual acceptance; this record does not declare the revised design approved or a launch complete.

Review emphasis: the hero's type and illustration, section density, mobile stacking, dark/light treatments, and whether the primary getting-started action fits the intended audience.

## Implemented product tour and verification

The current homepage includes overview metrics, assessment activity, check results, Findings, Contributors and Repository details. All public records belong to the synthetic Northstar workspace. The overview shows 12 repositories, 86 assessed PRs, 1420 saved assessments across a 180-day activity calendar and standards adopted in 10 of 12 repositories. These fixture values demonstrate the product; they are not customer or commercial proof.

- Findings includes search, severity filtering, a populated issue list and the real severity/check charts and summary components: 6 issues across 3 repositories, 2 critical/high issues and 1 missing or unverified result.
- Contributors includes summary metrics, participation and revision-evidence charts, and a searchable directory with activity sparklines.
- Repository details includes comparable health reports, completed synthetic analyses, populated quality metrics, analysis coverage, and Findings/Assessment history tabs alongside policy evidence.
- Motion includes hero and scroll reveals, original isometric figures that animate once on entering view, button feedback, and menu/FAQ/tab transitions. Reduced-motion preferences are respected and keyboard interactions remain immediate.

Earlier W1 desktop, mobile and narrow-screen layouts were reviewed during implementation. Build, typecheck, focused lint and 33 homepage/auth/status regression tests passed for W1. The subsequent motion change passed typecheck, lint and both focused hydration/workflow tests. These historical checks do not establish acceptance of the current appearance or a full accessibility audit.

**Pre-commit audit, 12 October 2026:** Fixed the web Docker build stage to copy the Nginx configuration used by prerender validation. Made product-preview IDs unique while preserving section anchors, and derived contributor repository/PR/revision totals from the same public fixtures as Overview. Removed the superseded workflow wrapper and its unused styles/data; its interaction regression now exercises the actual full-frame preview. Production Docker build and isolated route/header smoke checks passed. The review app remains on localhost:5173; visual acceptance and W4 launch remain separate.

Current W3 checks passed: 60 API auth/GitHub tests, 14 public-build configuration tests and 20 production Docker/Nginx route/header checks. Earlier browser checks passed 45 auth, 8 hydration/startup and 5 preview cases. The current revision passed 135 web checks in one grouped run, the production build, typecheck, full web lint and whitespace checks. Visual acceptance and launch remain pending.

See [deployment and verification](../../deployment/public-homepage.md) for the generated HTML, private shell and repeatable hydration check. Screenshots are temporary review artifacts and are not required to build or run the app.

The homepage tour ends its repository preview after Analysis coverage; its lower Findings/Assessment history and Policy evidence block is omitted. Other full repository previews keep those details. The header, hero, tour and section edges use the same responsive grid.
