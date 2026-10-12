# Preflyt website analysis and phased implementation plan

**Date:** 12 October 2026  
**Status:** W0 approved; W1 implemented in the current app

**Scope:** Public website within the existing `apps/web` application

**W0 review package:** [Approved design and implementation contract](../design/website-w0/README.md). The user approved public `/` and protected `/overview` on 12 October 2026. The user approved the design and authorized W1 on 12 October 2026.

Build a public website that explains Preflyt, demonstrates its engineering workflow and guides visitors into self-hosting or their organization's existing installation. Use Twingate as the visual mood board, with Preflyt's own brand, product language and evidence. Continue using React, Vite, TanStack Router and the existing component foundation.

The recommended direction is a dark, spacious engineering website with large typography, clear product demonstrations and practical calls to action. The workspace retains its compact operational design. Website milestones below are a separate delivery workstream; they do not add, rename or reorder the approved product roadmap P0–P12.

## 1. Twingate analysis

The following observations come from the current [Twingate homepage](https://www.twingate.com/), including rendered desktop views of the hero, navigation, product panels and footer.

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
| `routes/_authenticated/index.tsx` owns `/` and renders the dashboard | A public homepage at `/` requires a deliberate dashboard URL migration |
| `routes/_authenticated/route.tsx` checks the server session before private pages load | Public routes must sit outside this protected route family |
| `main.tsx` mounts theme, font, direction and query providers globally | Scope marketing presentation and avoid private queries on public pages |
| Brand assets already exist in `public/images/brand` | Reuse the supplied marks and wordmarks |
| `index.html` has application metadata and broad indexing defaults | Introduce route-specific metadata and public/private indexing rules |
| `deploy/nginx.conf` serves the Vite build with SPA fallback and proxies `/api/` | Public HTML generation must work in the existing Docker/Nginx deployment |
| `apps/docs` already provides Docusaurus documentation | Link to the existing documentation rather than duplicating a documentation system |
| OIDC completion redirects to `/`; sidebar Overview also links to `/` | Review auth completion, setup/onboarding, navigation and root links together |

Source files: [web package](../../apps/web/package.json), [protected layout](../../apps/web/src/routes/_authenticated/route.tsx), [dashboard route](../../apps/web/src/routes/_authenticated/overview.tsx), [providers](../../apps/web/src/main.tsx), [HTML entry](../../apps/web/index.html), [Nginx configuration](../../deploy/nginx.conf), [web image](../../deploy/web.Dockerfile), [OIDC callback](../../apps/api/src/auth/auth.controller.ts), [sidebar](../../apps/web/src/components/layout/data/sidebar-data.ts).

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

**Hero headline:** Engineering confidence before production.

**Proposed supporting copy:** Understand repository health, investigate findings and review changes against your engineering standards—with evidence tied to the commit.

**Primary action:** Get started → the supported self-hosting/getting-started documentation.  
**Secondary action:** See how it works → the homepage workflow section.  
**Utility action:** Sign in → the existing installation's `/sign-in` route.

This reflects the current self-hosted model. A hosted signup, free trial, demo booking or sales funnel can replace these actions when its destination and operating model are approved. GitHub login continues through the existing sign-in flow and deployment flag.

## 4. Visual mood board for Preflyt

### Art direction

Use a calm technical editorial style: large promises, readable explanatory copy, generous spacing and precise product evidence. The signature visual is a commit moving through required checks into a saved assessment, with a separate human review and GitHub permission boundary.

| Element | Proposed treatment |
| --- | --- |
| Base surfaces | Charcoal background around `#0E1115`; raised panels around `#151B22`; quiet borders around `#28333F` |
| Brand | Existing Preflyt marks and slate/blue identity; proposed lighter blue accent for dark public surfaces, subject to contrast checks |
| Text | Off-white headings and readable gray body text; semantic colors reserved for actual product statuses |
| Typography | Existing Manrope for display; compatible existing body font; monospace for commit/code labels. Avoid adding proprietary fonts |
| Type scale | Fluid hero around 40–76px, section headings 28–48px, body 16–20px; validate line breaks at each viewport |
| Layout | Approximately 1,200px content width, 24–40px desktop gutters, 16–20px mobile gutters and an 8px spacing rhythm |
| Sections | Wide split compositions, open text groups and purposeful diagrams; selective cards rather than repeated identical grids |
| Buttons | Shared brand-filled primary Button, quieter secondary action and explicit utility links; usable mobile hit areas |
| Product visuals | Approved, redacted captures of actual supported states, or original abstract SVG diagrams with no invented measurements |
| Motion | One restrained workflow reveal and short hover transitions; a complete static state with reduced motion |

These are proposed public-site tokens, not replacements for workspace theme variables. Scope them to the marketing layout so workspace font preferences, light/dark themes, card density and navigation remain intact. Provide readable public light/dark treatments and verify both.

Use the existing `StatusBadge` and shared status mapping wherever a product state is rendered. Add a mapping regression test for any new fixed label. Do not borrow the reference site's badge colors. Workspace changes continue to use `PageHeader`, `SurfaceIcon` and the [enterprise UI guidelines](../design/enterprise-ui-guidelines.md).

### Asset requirements

Prepare the Preflyt wordmark variants, the workflow illustration, two or three approved product captures, a social sharing image and a small verified integration set. Strip private repository names, source, identities and metadata before public use. If a capture cannot safely demonstrate the claim, use an explanatory diagram or omit it. Do not publish fabricated dashboard data, testimonials, customer logos, certifications, reliability promises or time-saving percentages.

## 5. Page structure

### Homepage sequence

| Section | Visitor question | Content and action |
| --- | --- | --- |
| Header | Where can I go? | Product, How it works, Self-hosting, Docs; Sign in and Get started |
| Hero | What is Preflyt? | Headline, short explanation, two actions and the commit/evidence visual |
| Three outcomes | Why use it? | Understand codebase health; apply consistent standards; trace review results |
| Repository health | What needs attention? | Findings and assessed-code preview with qualified execution limits |
| Standards and CI evidence | What requirements apply? | Versioned standards, target-branch policy and exact-commit evidence |
| Merge review | What does the result mean? | Passing, blocked and incomplete evidence; explain the GitHub boundary |
| AI guidance | How does AI help? | Short problem/effect/fix guidance, configuration requirements and advisory role |
| Workflow | How do I start? | Deploy → connect GitHub → select repository → inspect health → configure standards/CI |
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

The routing choice is settled and does not need reconfirmation. The routing migration is now applied in the current app for W0 review. Do not implement a second dashboard or move every private page under `/app`. The W0 package defines auth completion and legacy root-query handling.

For the approved migration:

1. Retain the dashboard's `tab`, `days` and `repository` search validation at `/overview`.
2. Inventory root links in sidebar/search, logos, auth completion, setup, onboarding, notifications and tests. Update workspace entry links to the protected destination.
3. Review actual return-path handling before promising deep-link restoration. The sign-in route currently accepts `redirect`, while its provider links do not forward it and OIDC completion defaults to `/`.
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

Generate HTML for an explicit allowlist of public marketing paths during the existing Vite build. W0 selects build-time rendering with Vite SSR, React and the existing TanStack route tree; prove it in W1. Retain React hydration/navigation and the current Docker image. The W0 contract covers universal router creation, browser-only providers, hydration and a separate private SPA fallback shell. A framework migration is outside this workstream.

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

**Implemented:** Public homepage, interactive demo previews, responsive navigation, Geist typography, public HTML prerendering and separate private fallback shell. See [deployment and verification](../deployment/public-homepage.md).

**Work:** Add the public layout, scoped tokens, keyboard-accessible mobile navigation and homepage. Implement the hero, three outcomes, core product sections, workflow, FAQ and footer with approved content/assets. Generate homepage HTML and essential metadata through the existing Docker build. Include required legal links only when their approved destinations exist.

**Acceptance:** An anonymous visitor can read the page, understand the product and reach getting-started docs/sign-in. It works at 320px, tablet and desktop, with both themes and reduced motion. No private queries run. Existing protected pages and recovery flows still work. Served HTML contains the actual page title and meaningful content.

**Release shape:** A complete reviewable homepage on the existing preview environment. W2 pages are absent from navigation until delivered.

### W2 Product explanation and self hosting

**Work:** Deliver `/product`, the three capability pages and `/self-hosting` using a shared page composition. Explain prerequisites, supported inputs and limits alongside each capability. Use the homepage's visual grammar with enough detail for evaluation. Link to authoritative documentation for setup commands and technical contracts.

**Acceptance:** Every linked page answers what it does, how it works and how to start. Public/private routes do not collide. Evidence-bound assessment, AI advisory behavior and native qualification limits remain clear. Documentation and product copy agree; product captures contain no confidential content.

### W3 Discovery and conversion completion

**Work:** Complete public-route prerendering, canonical/share metadata, sitemap, indexing settings and useful not-found handling. Verify the root/auth migration delivered in W1. Add a visible Open workspace action where session state is verified. Add privacy-compatible measurement only if wanted for the deployment.

Initial measurement, if enabled, covers CTA clicks and documentation/sign-in handoffs. Account creation, MFA and sign-in are not evidence of product activation. Measuring first value requires a separate authorized event for a selected repository and a useful saved report; it must not expose repository identities or finding contents.

**Acceptance:** Public HTML and social previews work for every launch page. Private/auth pages are excluded from indexing. Login finishes at the intended protected destination, including tested internal deep links and safe legacy root-query behavior. Public pages remain readable during API/session failure.

### W4 Release verification and launch

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
| Brand treatment | Prepared for review: existing logo/identity, scoped dark and light treatments | Maintains continuity with the app |
| Public captures | Original explanatory diagrams in W0; approved product captures remain optional | No private data is needed for visual review |
| Pricing, sales and legal destinations | Approved content and functioning destinations before exposure | Prevents unsupported commercial promises and dead links |

## 10. Governing references

- [Product implementation guardrails](../agents/product-implementation-guardrails.md)
- [Enterprise UI guidelines](../design/enterprise-ui-guidelines.md)
- [Product definition](../../PRODUCT.md) and [README](../../README.md)
- [Incremental delivery roadmap](../roadmap/incremental-delivery.md)
- [P5 implementation and limitations](p5-implementation.md)
- [Current branch audit and release requirements](branch-audit-2026-10-12.md)
- [Twingate homepage mood board](https://www.twingate.com/), [product explanation](https://www.twingate.com/product/ztna) and [commercial destination](https://www.twingate.com/pricing)
