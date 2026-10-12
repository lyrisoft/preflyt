# Preflyt website analysis and phased implementation plan

**Date:** 12 October 2026  
**Status:** W1 and W2 implemented; W2 audited and committed as `bd477f3`; W3 and the current homepage revision implemented and audited; technical verification complete; visual/launch acceptance pending

**Scope:** Public website within the existing `apps/web` application

**W0 review package:** [Approved design and implementation contract](../design/website-w0/README.md). The user approved public `/` and protected `/overview` on 12 October 2026. The user approved the design and authorized W1 on 12 October 2026.

Build a public website that explains Preflyt, demonstrates its engineering workflow and guides visitors into self-hosting or their organization's existing installation. The initial Twingate mood board is retained as planning context; the user's latest Linear-style references govern the current hero, engineering figures and editorial sections. Keep Preflyt's own brand, product language and evidence. Continue using React, Vite, TanStack Router and the existing component foundation.

The implemented homepage has a left-aligned **Engineering confidence before production.** hero above a full app view up to 1280px wide. Static compositions scale a 1728px canvas with the actual sidebar catalogue/groups and global header. Three original animated isometric figures precede five open product sections: Repository health, Findings, Contributors, Standards & evidence and Merge Protection. Heading/copy columns, quiet feature links, layered app views and soft outer-edge fades retain the editorial composition. The full Findings, Contributors and Repository details tour uses native responsive application UI with populated charts. Public illustrations omit Preview badges and visible “Demo workspace” captions. Focused web checks passed; visual acceptance remains pending. The workspace retains its compact operational design. Website milestones below are a separate delivery workstream; they do not add, rename or reorder the approved product roadmap P0–P12.

## 1. Initial Twingate analysis

The initial planning observations came from the [Twingate homepage](https://www.twingate.com/), including rendered desktop views of the hero, navigation, product panels and footer. The user's later Linear-style screenshot supersedes the boxed colored product-panel direction for the homepage.

| Observed pattern | Purpose | Preflyt adaptation |
| --- | --- | --- |
| Near-black surfaces, restrained borders and bright accent moments | Establish hierarchy | Charcoal and Preflyt brand accents |
| Large, light headings and short supporting copy | Make the promise scannable | One engineering outcome per section |
| Split hero with a technical visual | Explain an abstract product | Repository → checks → evidence → review |
| Persistent navigation and repeated CTAs | Keep next steps reachable | Get started, Documentation, Sign in |
| Wide product panels with UI previews | Connect benefits to behavior | Findings, standards and assessment evidence |
| Customer proof, metrics and integrations | Build confidence | Verified product evidence and supported integrations |
| Code section and grouped footer | Serve technical evaluation | CI workflow, deployment and documentation links |

The [ZTNA product page](https://www.twingate.com/product/ztna) develops its story through comparison, architecture, deployment steps and FAQs. Preflyt's product pages should similarly answer what the capability does, how it works and its operating limits. The [pricing page](https://www.twingate.com/pricing) provides a commercial evaluation destination; Preflyt needs approved packaging before publishing one.

**Interpretation:** Borrow the visual rhythm and progressive explanation. Keep Preflyt's own positioning, artwork, assets and information architecture. Twingate's lime/lavender palette, proprietary typography, customer proof and security claims are specific to its brand.

## 2. Current app and implementation implications

| Verified repository condition | Implication for the website |
| --- | --- |
| `apps/web` uses React 19, Vite, Tailwind 4, TanStack Router and shadcn primitives | Add a public route family and feature module in this app |
| `routes/index.tsx` owns public `/`; `routes/_authenticated/overview.tsx` renders the protected dashboard | Keep the implemented root/dashboard migration and dashboard filter validation |
| `routes/_authenticated/route.tsx` checks the server session before private pages load | Public routes must sit outside this protected route family |
| `main.tsx` starts the shared app factory, which provides theme, font, direction and query context | Scope marketing presentation and avoid private queries on public pages |
| Brand assets already exist in `public/images/brand` | Reuse the supplied marks and wordmarks |
| The build emits route-specific public HTML, a noindex private shell and a rendered noindex 404 | Retain explicit public/private metadata and indexing rules |
| `deploy/nginx.conf` serves generated public HTML, allowlisted private SPA routes and `/api/` proxying | Keep public HTML generation and route validation in the existing Docker/Nginx deployment |
| `apps/docs` already provides Docusaurus documentation | Link to the existing documentation rather than duplicating a documentation system |
| Public `/`, protected `/overview` and validated internal auth destinations are implemented | Keep sign-in, setup/onboarding, recovery and navigation contracts aligned |

Source files: [web package](../../apps/web/package.json), [protected layout](../../apps/web/src/routes/_authenticated/route.tsx), [dashboard route](../../apps/web/src/routes/_authenticated/overview.tsx), [app factory and providers](../../apps/web/src/app.tsx), [startup](../../apps/web/src/main.tsx), [HTML entry](../../apps/web/index.html), [Nginx configuration](../../deploy/nginx.conf), [web image](../../deploy/web.Dockerfile), [OIDC callback](../../apps/api/src/auth/auth.controller.ts), [sidebar](../../apps/web/src/components/layout/data/sidebar-data.ts).

### Product claims

Lead with repository health and engineering governance, using the [README](../../README.md) and current feature contracts as the baseline. Product copy needs a claim register containing the proposed wording, supporting code/docs, deployment conditions and publication decision.

| Capability | Permitted story | Boundary to retain |
| --- | --- | --- |
| Repository health and findings | Understand supported findings, affected code and saved report history | Native execution requires independent runtime/analyzer qualification; inspection-only reports remain partial |
| Standards and branch policies | Apply reviewed, versioned engineering requirements | Configuration does not prove the required checks passed |
| CI assessments | Review results tied to the assessed commit | Missing or insufficient mandatory evidence remains incomplete |
| Merge protection | Apply configured requirements through GitHub checks/rules | GitHub permission remains separate from Preflyt's merge review result |
| AI Reviews and finding guidance | Explain findings and suggest fixes with configured models | AI is advisory and cannot waive a check or authorize a merge |
| Self-hosting | Deploy with supported application bundles | Kubernetes application deployment does not establish runner qualification or a shipped Operator |
| Coverage | Describe the intended CI evidence path only where its status is clear | Actual bounded CI coverage-report ingestion remains pending in current release notes |

The [12 October branch audit](branch-audit-2026-10-12.md) records remaining P5 qualification and coverage-ingestion work. Do not market those paths as universally production-ready. Recheck their state before publishing copy. CLI/IDE, managed performance execution, production feedback and provider expansion remain governed by the existing roadmap.

## 3. Audience and message

**Primary visitors:** Engineering leads and platform teams evaluating repository health, consistent standards and traceable change review. Developers need to see how findings become understandable actions. Organization administrators need to understand access, deployment and operational requirements.

**Current hero headline:** Engineering confidence before production.

**Current supporting copy:** Understand your repositories, connect engineering requirements to CI evidence, and review every change at the right revision.

**Primary action:** Get started → the supported self-hosting/getting-started documentation.

**Secondary action:** Explore Preflyt → the homepage platform section.

**Utility action:** Sign in → the existing installation's `/sign-in` route.

This reflects the current self-hosted model. A hosted signup, free trial, demo booking or sales funnel can replace these actions when its destination and operating model are approved. GitHub login continues through the existing sign-in flow and deployment flag.

## 4. Visual mood board for Preflyt

### Art direction

Use Preflyt's own technical visual language: light-weight Geist headings, readable copy, generous spacing and product evidence. The current Linear-style editorial composition uses a left-aligned hero above a wide full-app view, three original isometric engineering figures and five open flat product sections. Section headings sit on the left with explanation on the right, followed by layered app scenes, soft outer-edge fades and quiet feature links. Static scenes scale a 1728px canvas; the interactive tour retains native responsive dimensions. Use original sign-in-derived branch/code artwork and flat frames. Keep human review and GitHub enforcement separate from Preflyt's assessment result.

| Element | Current treatment for review |
| --- | --- |
| Base surfaces | Scoped charcoal background `#101213`, panels `#171A1C` and quiet borders `#282D30`; dedicated light treatment |
| Brand | Existing Preflyt marks, cobalt primary `#315BEA` and light-blue dark-theme text accents |
| Text | Off-white headings and readable gray body text; semantic colors reserved for actual product statuses |
| Typography | Geist for public headings/body; application typography retained inside product windows; monospace for commit/code labels |
| Type scale | Fluid hero up to 68px with smaller narrow-screen sizes; clearly separated section headings and readable body copy; validate line breaks at each viewport |
| Layout | Left-aligned hero above a full-app view up to 1280px wide; shared 1280px header/section column, responsive gutters and stacked narrow-screen content |
| Sections | Three captioned isometric figures, then five open flat product sections with layered app scenes and quiet feature links; boxed colored canvases removed |
| Buttons | Shared brand-filled primary Button, quieter secondary action and explicit utility links; usable mobile hit areas |
| Product visuals | Authorized synthetic Northstar records in real app components; static 1728px full-app compositions with actual sidebar catalogue/groups and global header; native interactive Findings, Contributors and Repository details tour |
| Motion | Isometric figures animate once on entering view; restrained SVG signals, hero/scroll reveals, button feedback and menu/FAQ/tab transitions; static presentation with reduced motion |

These public-site tokens remain scoped to the marketing layout so workspace font preferences, light/dark themes, card density and navigation remain intact. Review both public themes and reduced-motion behavior before accepting the revised design.

Use the existing `StatusBadge` and shared status mapping wherever a product state is rendered. Add a mapping regression test for any new fixed label. Do not borrow the reference site's badge colors. Workspace changes continue to use `PageHeader`, `SurfaceIcon` and the [enterprise UI guidelines](../design/enterprise-ui-guidelines.md).

### Asset requirements

Reuse the Preflyt wordmark variants and sign-in-derived SVG geometry. Three original code-native isometric SVGs illustrate repository health, revision-bound evidence and clear merge review; they animate once on entering view and remain static with reduced motion. A branded 1,200×630 social image is implemented. Public product visuals use the user-authorized synthetic Northstar workspace; no private repository names, source, identities or metrics feed these previews. The overview contains 12 repositories, 86 assessed PRs, 1420 saved assessments over 180 days and standards adopted in 10 of 12 repositories. These measurements demonstrate the product and are not commercial proof. Visible “Demo workspace” captions and public illustration Preview badges are removed without changing the synthetic-data boundary. Do not publish fabricated testimonials, customer logos, certifications, reliability promises or time-saving percentages.

## 5. Page structure

### Homepage sequence

| Section | Visitor question | Content and action |
| --- | --- | --- |
| Header | Where can I go? | Product, How it works, Self-hosting, Docs; Sign in and Get started |
| Hero | What is Preflyt? | Left-aligned headline, short explanation, two actions and a wide full-app overview |
| Engineering figures | Why use it? | Three original isometric illustrations: Repository health, Revision-bound evidence and Clear merge review |
| Repository health | What needs attention? | Comparable health reports, populated quality metrics, analysis coverage and assessed-code context with qualified execution limits |
| Findings | Which issues need investigation? | Full findings screen with severity/check charts, summary metrics, search, filtering and a populated issue list |
| Contributors | How is the work distributed? | Full contributors screen with participation and revision-evidence charts, summary metrics and a directory with activity sparklines |
| Standards and CI evidence | What requirements apply? | Versioned standards, target-branch policy and exact-commit evidence |
| Merge review | What does the result mean? | Passing, blocked and incomplete evidence; explain the GitHub boundary |
| Workspace tour | What will I use? | Native responsive Findings, Contributors and Repository details screens with local interactions and populated charts |
| Workflow | How do I start? | Connect GitHub → explore a health report → define requirements → review a change |
| Self-hosting and integrations | Will it fit our environment? | Deployment docs, GitHub/Actions and supported report formats |
| FAQ | What are the practical limits? | CI versus Health, optional AI, access, isolation and deployment requirements |
| Closing action and footer | What next? | Get started, sign in, documentation, GitHub source and approved company/legal links |

Health assessment and CI merge evidence are separate paths. The workflow must not suggest a Health report automatically satisfies a PR gate. Keep the initial homepage focused; detailed explanations belong on product pages.

### Public routes and navigation

| Destination | Delivery scope |
| --- | --- |
| `/` | Approved public homepage destination |
| `/product` | Product overview and links to delivered capabilities |
| `/product/repository-health` | Supported findings, source investigation and operating limits |
| `/product/standards-and-evidence` | Standards, policies and commit evidence |
| `/product/merge-protection` | Merge review and GitHub enforcement boundaries |
| `/self-hosting` | Deployment orientation linking to existing authoritative docs |
| Documentation | Existing configured documentation destination |
| `/sign-in` | Existing auth entry point |
| `/privacy` and `/terms` | Publish only approved documents that apply to this deployment |

Public paths use `/product/...` to avoid collisions with protected `/standards`, `/assessments`, `/findings` and `/quality-gates`. Add navigation only when the target is available. Pricing, customers, blog, comparison pages and a sales form are later content decisions.

## 6. Integration architecture

### Approved routing decision

**Approved by the user on 12 October 2026:** Make `/` public and place the existing dashboard at protected `/overview`. Retain sidebar names, groups, order and all other workspace URLs. Update only the Overview destination as part of the migration.

The routing choice is settled and does not need reconfirmation. The routing migration is implemented in the current app. Do not implement a second dashboard or move every private page under `/app`. The W0 package records auth completion and legacy root-query handling.

For the approved migration:

1. Retain the dashboard's `tab`, `days` and `repository` search validation at `/overview`.
2. Inventory root links in sidebar/search, logos, auth completion, setup, onboarding, notifications and tests. Update workspace entry links to the protected destination.
3. Preserve the sign-in route's validated `redirect` through provider links and Super Admin recovery. W3 stores the OIDC destination in the single-use login transaction and transfers it into first-owner bootstrap; callback query parameters cannot replace it.
4. Preserve valid internal destinations through login; reject external return URLs. Define legacy dashboard query-link handling at `/`, with authentication before private data loads.
5. Keep `/sign-in`, `/setup`, `/github-onboarding`, Super Admin recovery and provider callbacks operational. Signed-in visitors can still visit public pages and get an Open workspace action.

### Proposed frontend organization

```text
apps/web/src/features/marketing/
  components/       # Public header/footer, sections, workflow visual
  content/          # Reviewed page content and navigation definitions
  pages/            # Homepage, product pages, self-hosting
  styles/           # Scoped public-site tokens

apps/web/src/routes/
  (marketing)/      # Public layout and file routes
  _authenticated/   # Existing protected pages and reviewed dashboard route

apps/web/public/marketing/
  # Preflyt-owned illustrations, redacted captures and share images
```

Treat this as a proposed structure; generate `routeTree.gen.ts` through the existing router tooling. Use existing Button, Dialog, Accordion and other suitable primitives. Give the public shell its own layout while keeping one router, one root toaster and existing app providers. Load public pages separately so visitors do not download unnecessary workspace modules or start authenticated repository queries.

### Rendering and discovery

The existing Vite build generates HTML for an explicit allowlist of six public marketing paths using React and the existing TanStack route tree. It retains React hydration/navigation and the current Docker image, with a separate private SPA shell. W3 adds a rendered 404 page, allowlisted sitemap/robots output and branded sharing metadata. A framework migration is outside this workstream.

Each public path needs its own title, description, canonical URL, sharing metadata and content in the served HTML. Build-time rendering must run without private cookies or repository API calls. Sitemap and robots output must use the configured public origin, not a hardcoded customer installation.

Serve generated public pages through the existing Nginx configuration, with SPA fallback for private routes. Private/auth/setup pages need `noindex` in HTML or response headers; `robots.txt` alone is insufficient. An installation visibility setting should allow private self-hosted deployments to exclude the whole installation from indexing. Anonymous public content must remain readable when the API is unavailable; session-dependent header enhancements can fail quietly without claiming a user is signed out.

Use tested metadata APIs or the existing router's head support after a small integration check. Do not assume client-side metadata will provide social previews. JSON-LD must describe verified capabilities and avoid unapproved offers, ratings or certifications.

## 7. Phased delivery

Each milestone depends on the previous acceptance gate. Suggested roles describe responsibilities rather than named assignments.

| Milestone | Deliverable | Main responsibility | Indicative effort |
| --- | --- | --- | --- |
| W0 | Approved direction, claims and routing contract | Product + design + engineering | 2–3 days |
| W1 | Complete homepage in the current app | Frontend + deployment | 4–6 days |
| W2 | Product explanation and deployment pages | Frontend + product/content | 3–5 days |
| W3 | Discovery, conversion and integration completion | Frontend + API if routing requires it | 2–4 days |
| W4 | Release verification and launch | Engineering + product review | 2–3 days |
| W5 | Evidence-led content expansion | Product/content + frontend | Separate backlog |

W0–W4 represent approximately 13–21 engineering/design working days with one implementation stream and timely reviews. This is a sizing estimate, not a release commitment; legal content, approved captures and routing decisions can affect elapsed time.

### W0 Direction and implementation contract

**Prepared:** Desktop and mobile homepage composition, dark/light treatments, scoped tokens, asset inventory, claim register, CTA map, approved `/` and `/overview` route allocation, auth/legacy-link contract and public HTML/deployment approach. See the [W0 review package](../design/website-w0/README.md). Visual and content direction approved by the user on 12 October 2026.

**Acceptance:** Reviewers can see the proposed hero and one product section, understand the first visitor journey and approve the routing/claims boundaries. Every launch CTA has a real destination. The user authorized integration into the running app for review; production HTML and deployment acceptance remain W1 work.

### W1 Homepage vertical slice

**Implemented:** Public homepage, interactive synthetic Northstar previews, responsive navigation, Geist typography, public HTML prerendering and separate private fallback shell. The current visual revision adds the left-aligned hero, three original isometric figures and five open product sections. See [deployment and verification](../deployment/public-homepage.md).

**Work:** Add the public layout, scoped tokens, keyboard-accessible mobile navigation and homepage. Implement the hero, engineering figures, five core product sections, interactive workspace tour, workflow, FAQ and footer with approved content/assets. Generate homepage HTML and essential metadata through the existing Docker build. Include required legal links only when their approved destinations exist.

**Acceptance:** An anonymous visitor can read the page, understand the product and reach getting-started docs/sign-in. It works at 320px, tablet and desktop, with both themes and reduced motion. No private queries run. Existing protected pages and recovery flows still work. Served HTML contains the actual page title and meaningful content.

**Release shape:** Homepage and delivered W2 pages are available in the current app at `http://localhost:5173`. The latest visual revision remains subject to review.

### W2 Product explanation and self hosting

**Implemented, 12 October 2026:** `/product`, `/product/repository-health`, `/product/standards-and-evidence`, `/product/merge-protection` and `/self-hosting`. Shared public header/footer, Geist typography, theme tokens and homepage motion are reused. Pages include workflow, prerequisites, operating limits and documentation handoffs. All six public routes have generated HTML and route-specific metadata. See [deployment and verification](../deployment/public-homepage.md).

**Audit and commit:** `bd477f3` — `feat(website): implement product capabilities and self-hosting pages`. Subsequent homepage visual corrections are part of the current review, not a claim that the revised appearance has been accepted.

**Work:** Deliver `/product`, the three capability pages and `/self-hosting` using a shared page composition. Explain prerequisites, supported inputs and limits alongside each capability. Use the homepage's visual grammar with enough detail for evaluation. Link to authoritative documentation for setup commands and technical contracts.

**Acceptance:** Every linked page answers what it does, how it works and how to start. Public/private routes do not collide. Evidence-bound assessment, AI advisory behavior and native qualification limits remain clear. Documentation and product copy agree; product captures contain no confidential content.

### W3 Discovery and conversion completion

**Implemented, 12 October 2026:** Configured canonical/Open Graph/Twitter metadata for every public page, branded sharing image, public-only sitemap and robots output, noindex private/404 documents, useful public 404 rendering and an explicit Nginx private-route allowlist checked against the generated route tree. Session-verified Open workspace remains available. Internal destinations are preserved through GitHub, OIDC, Super Admin and first-owner setup; normalized double-slash redirect attacks are rejected. The additive OIDC return-path migration was applied locally and Prisma regenerated.

**Production startup correction:** Legacy dashboard query links on `/` mount the client router so the protected `/overview` redirect runs with its filters. Ordinary public visits continue hydrating generated HTML. A browser regression verifies the actual sign-in redirect and preserved filters.

**Current review refinements:** The header and page sections share a 1280px desktop column with 32px side gutters (18px on phones). Within the homepage workspace tour, repository previews end after Analysis coverage; the lower Findings/Assessment history and Policy evidence block is omitted, while other full repository previews retain it.

**Pre-commit audit, 12 October 2026:** Fixed the web Docker build stage to copy the Nginx configuration used by prerender validation. Made product-preview IDs unique while preserving section anchors, and derived contributor repository/PR/revision totals from the same public fixtures as Overview. Removed the superseded workflow wrapper and its unused styles/data; its interaction regression now exercises the actual full-frame preview. Production Docker build and isolated route/header smoke checks passed. The review app remains on localhost:5173; visual acceptance and W4 launch remain separate.

**Technical validation passed:** 60 API auth/GitHub tests, 14 public-build configuration tests and 20 production Docker/Nginx route/header checks. The API suite includes persisted legacy-row redirect regressions; unsafe destinations are rejected before login/bootstrap grants. Earlier browser checks passed 45 auth, 8 hydration/startup and 5 preview cases. The current revision passed 135 web checks in one grouped run (including preview/data invariants, shared chart/status regressions and generated-HTML hydration/startup), the production build, web typecheck, full web lint and whitespace checks. API typecheck and auth-file lint/format checks passed. Visual acceptance and W4 launch remain pending. No analytics or measurement service was requested or added.

**Work:** Complete public-route prerendering, canonical/share metadata, sitemap, indexing settings and useful not-found handling. Verify the root/auth migration delivered in W1. Add a visible Open workspace action where session state is verified. Add privacy-compatible measurement only if wanted for the deployment.

Initial measurement, if enabled, covers CTA clicks and documentation/sign-in handoffs. Account creation, MFA and sign-in are not evidence of product activation. Measuring first value requires a separate authorized event for a selected repository and a useful saved report; it must not expose repository identities or finding contents.

**Acceptance:** Public HTML and social previews work for every launch page. Private/auth pages are excluded from indexing. Login finishes at the intended protected destination, including tested internal deep links and safe legacy root-query behavior. Public pages remain readable during API/session failure.

### W4 Release verification and launch

**Status:** Pending visual acceptance and release/launch verification. Historical W1/W2 checks and focused W3 technical results do not complete this gate.

**Work:** Review copy and captures, run focused regressions and production-build checks, validate Docker/Nginx routing, and capture desktop/mobile views. Check accessibility, public-page loading and auth regression. Record the release checklist, previous-image rollback path and known deployment conditions.

**Acceptance:** No broken links, unsupported claims, exposed private data, route regressions or blocking accessibility defects. Deploy the reviewed app image through the existing release process; verify public pages, API proxy, sign-in and a protected deep link after deployment. Roll back the image if the reviewed acceptance gate fails. No GitHub merge is implied by this plan.

### W5 Content expansion after launch

Add use-case pages, supported integrations, maintained changelog/resources, approved customer stories and commercial packaging when there is evidence and an owner for them. Start with small typed/Markdown content files; introduce a CMS only when publishing needs justify it. Review conversion evidence before adding heavier animations, contact forms or additional navigation.

If a contact/demo form is later approved, deliver its real receiving workflow, validation, abuse controls, privacy wording and success/failure states together. Do not ship a form with a simulated success response.

## 8. Verification requirements

| Area | Required evidence before launch |
| --- | --- |
| Routes and authentication | Anonymous public access; denied private access; OIDC/GitHub, onboarding and recovery flows; reviewed root/return-path cases |
| Public data boundary | No repository/session data in generated HTML, build logs, public assets or metadata; no private API dependency for reading content |
| Interaction | Keyboard menu/FAQ operation, Escape/focus return, visible focus, working anchors and CTA destinations |
| Responsive and themes | 320px, 390px, tablet and desktop captures; no horizontal page overflow; readable light/dark states |
| Semantics | Shared status mapping tests for new labels; accurate incomplete/failure states; AI does not imply authorization |
| HTML and deployment | Route-specific HTML/meta, hydration, refresh/deep links, real asset 404s, API proxy and private-page noindex |
| Performance | Target LCP ≤2.5s, CLS ≤0.1 and INP ≤200ms where measurable; lab checks before launch and field confirmation when sufficient traffic exists |
| Copy and claims | Claim register approval, qualified capability wording, authorized screenshots and working technical references |

Use targeted browser tests for public navigation and route/auth regression. Run the existing web typecheck, lint and production build at implementation checkpoints; include API tests when auth behavior changes. Run shared regressions appropriate to the touched contracts. Do not treat these proposed checks as results already achieved.

Optimize the hero first: explicit asset dimensions, responsive modern images, deferred below-fold captures and limited fonts. Avoid shipping an animation library or video hero without a demonstrated need.

## 9. W0 decisions and review status

| Decision | Recommended starting point | Why it matters |
| --- | --- | --- |
| Public root and dashboard | Approved: public `/`, protected `/overview` | Implemented for review; sidebar groups and private routes preserved |
| Deployment entry and primary conversion | Self-hosting/getting-started docs | Matches the current operating model |
| Public domain and documentation URL | Selected: configured origin and existing docs destination; final public domain supplied at deployment | Controls canonical URLs and customer deployment behavior |
| Private installation discovery | Selected: indexing disabled by default, explicit public enablement | Keeps deployment behavior intentional |
| Brand treatment | Current original Preflyt direction awaiting review: Geist, scoped themes, flat app frames, sign-in-derived artwork and original isometric figures | Maintains continuity with the app while applying the latest editorial references |
| Public product visuals | User-authorized synthetic Northstar records; scaled 1728px static app compositions and native interactive tour; no visible Demo workspace captions | Shows product detail without publishing private workspace data |
| Pricing, sales and legal destinations | Approved content and functioning destinations before exposure | Prevents unsupported commercial promises and dead links |

## 10. Governing references

- [Product implementation guardrails](../agents/product-implementation-guardrails.md)
- [Enterprise UI guidelines](../design/enterprise-ui-guidelines.md)
- [Product definition](../../PRODUCT.md) and [README](../../README.md)
- [Incremental delivery roadmap](../roadmap/incremental-delivery.md)
- [P5 implementation and limitations](p5-implementation.md)
- [Current branch audit and release requirements](branch-audit-2026-10-12.md)
- [Twingate homepage mood board](https://www.twingate.com/), [product explanation](https://www.twingate.com/product/ztna) and [commercial destination](https://www.twingate.com/pricing)
- User-provided Linear-style references: current hero, isometric figures and editorial section composition.
