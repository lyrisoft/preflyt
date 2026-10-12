# Public homepage delivery

The existing web app serves the public homepage at `/`; workspace Overview is `/overview`.

`pnpm --filter @preflyt/web build` builds the client, renders the explicit public route allowlist using the same React/TanStack tree with network access disabled, and emits:

- `dist/index.html` and `dist/<public-path>/index.html`: readable page content, route styles, metadata and hydration state.
- `dist/app.html`: empty private SPA shell with `noindex, nofollow`.
- `dist/404.html`: rendered public not-found page with `noindex, nofollow`.
- `dist/robots.txt`: indexing disabled by default; an indexable build permits the public allowlist, its canonical redirects and public static assets.
- `dist/sitemap.xml`: six public canonical URLs, emitted only when indexing is enabled.
- `dist/images/social/preflyt.png`: branded 1200×630 sharing image.

The existing web Dockerfile runs this build. Nginx serves explicit public routes from their generated HTML and known application routes from `app.html`. Unknown paths return the rendered 404 with HTTP 404; trailing-slash and `index.html` public aliases redirect to the canonical path. The build checks the Nginx private-route allowlist against `routeTree.gen.ts`, so a new application route requires updating both. API proxying and asset serving retain their existing behavior. Only allowlisted public routes are prerendered; product previews contain synthetic Northstar data without fetching private repository APIs. The browser may check `/auth/session` to show Open workspace; content does not depend on that response.

## Build configuration

Compose passes these optional public build arguments:

- `PUBLIC_SITE_URL`: an HTTPS origin, without path, credentials, query or fragment. Used for all public canonical URLs, sharing metadata and sitemap URLs. No canonical URL is invented when it is absent.
- `PUBLIC_SITE_INDEXABLE`: defaults to `false`. Set `true` only for the intended public deployment; requires `PUBLIC_SITE_URL`.

Rebuild the web image when changing these values. Private routes and the rendered 404 always retain noindex metadata, independently of robots.txt. The five W2 public pages are included. Public Open Graph/Twitter metadata and WebPage JSON-LD describe only the actual public page; no offers, ratings or certifications are generated. Public links currently use `https://lyrisoft.github.io/preflyt/`; an installation-specific documentation URL override is not implemented.

## Historical W1 verification, 12 October 2026

Production build and TypeScript validation passed. Focused browser tests cover the marketing workflow preview, sign-in/recovery flow and status badges (32 passing). The generated files were served with the repository Nginx configuration in a temporary localhost-only container. Generated-HTML hydration also passed its browser regression (no recoverable hydration errors; original heading DOM retained). Run `pnpm --filter @preflyt/web test:homepage` to build and repeat it; the test skips when no build exists. The in-app browser stopped responding during the final manual production recheck, so this final check used the automated browser test. Responsive review covers 320px and desktop; homepage uses Geist, verified from BullMQ's computed typography. Marketing typography stays scoped; embedded product previews use application typography.

## Historical pre-commit audit, 12 October 2026

Reviewed public/private routing, build-time rendering, demo-data boundaries, shared component changes, motion cleanup and reduced-motion behavior. Fixed legacy dashboard links losing JSON-encoded numeric filters, kept the system theme current while a manual theme is selected, and consolidated screenshot ignore rules. Removed superseded prototype files and captures from the commit.

Validation: production build, TypeScript, focused lint and whitespace checks passed; 37 web checks and 29 GitHub sign-in integration checks passed. OIDC deep-link restoration was outside W1 and is implemented in the W3 revision below.

## W2 pages, 12 October 2026

The public allowlist is maintained in `apps/web/src/features/marketing/public-pages.ts` and includes `/`, `/product`, the three `/product/...` capability pages, and `/self-hosting`. The renderer uses the same React route tree; `scripts/prerender.mjs` emits HTML, styles and metadata for every path. Nginx has explicit public routing and retains `app.html` for protected routes.

All pages reuse `MarketingLayout`: header, mobile navigation, session-aware workspace link, footer, theme controls, Geist fonts and the homepage motion hook. Capability content documents actual prerequisites and operating limits; public previews remain synthetic. Repository Health is separate from CI merge evaluation, automatic CI coverage ingestion remains pending, and GitHub remains the merge enforcement owner. Self-hosting describes the existing application bundle rather than a Kubernetes Operator.

Verification: six generated pages hydrated without recoverable errors or private data queries; 40 focused web tests passed. Production build, TypeScript and focused lint passed. Direct Nginx requests served all public pages and separate private shells for Overview, sign-in and a repository deep link. Manual review covered all five pages at 320px, 768px and 1440px, light/dark appearance, Geist typography and shared mobile navigation. Published standards, merge-protection, Compose, Kubernetes and all four linked operations guides loaded successfully. Temporary production validation ran on loopback only; the review app remains `http://localhost:5173`.

W2 was audited and committed as `bd477f3` — `feat(website): implement product capabilities and self-hosting pages`.

## W3 implementation and current review, 12 October 2026

Discovery output now includes canonical/share metadata, the branded social image, an allowlisted sitemap/robots policy, a useful rendered 404 and an explicit private-route Nginx policy. Private and unknown routes cannot inherit public indexing metadata. The public build runs without network access and validates its route and deployment allowlists.

Sign-in preserves safe internal path/search/hash destinations through GitHub, OIDC, Super Admin and first-owner bootstrap. OIDC stores the destination in its single-use, browser-bound login transaction; bootstrap transfers it to the challenge and returns it after owner creation. Callback or bootstrap request parameters cannot override that value. Shared validation rejects external URLs, control/backslash input and paths that normalize to a protocol-relative destination. Existing state, PKCE, nonce, expiry, replay, membership, origin and recovery checks remain intact.

The additive migration `20261012150000_oidc_return_paths` adds `returnPath` to OIDC login/bootstrap records with `/overview` defaults for existing rows. It was applied locally and Prisma regenerated. Apply it through the existing Compose migration service or Kubernetes migration Job before rolling out the updated API; no database reset is needed.

The implemented homepage follows the latest user-provided Linear-style references. Its left-aligned **Engineering confidence before production.** headline sits above a full app view up to 1280px wide. Static compositions scale a 1728px app canvas and retain the actual sidebar catalogue, Workspace/Governance/Intelligence/Administration groups, organization identity and global header. Public illustration sidebars omit Preview badges, and illustrations/previews have no visible “Demo workspace” captions. The hero retains original Preflyt branch/code artwork without floating metric cards or tilted frames.

Three original captioned isometric SVG figures replace the earlier benefit strip. Their path/layer animation runs once on entering view and becomes static under reduced motion. Five open product sections cover Repository health, Findings, Contributors, Standards & evidence and Merge Protection, with heading/copy columns, quiet feature links and layered app scenes with soft outer-edge fades. Composed scenes are inert; the full Findings, Contributors and Repository details tour uses native responsive application UI and populated real chart components.

The synthetic Northstar overview shows 12 repositories, 86 assessed PRs, 1420 saved assessments over 180 days and standards adopted in 10 of 12 repositories. These records remain isolated in the public fixture and are not commercial proof. Geist, cobalt identity and synthetic product data remain scoped to the public composition. Visual acceptance remains pending; no analytics service or private-data dependency was introduced.

Production startup now distinguishes normal public visits from legacy dashboard bookmarks. Normal public paths hydrate the generated page. Valid dashboard query filters on `/` mount the client router so its protected `/overview` redirect runs before private data loads; the actual sign-in destination retains those filters.

Persisted GitHub login/onboarding destinations are also revalidated at transfer/return boundaries, covering transactions created before the new validation shipped. OIDC validation runs before identity/session creation or owner-bootstrap grants. Unsafe legacy rows cannot restore an external destination or grant a session before validation fails.

**Current review refinements:** The header and page sections share a 1280px desktop column with 32px side gutters (18px on phones). Within the homepage workspace tour, repository previews end after Analysis coverage; the lower Findings/Assessment history and Policy evidence block is omitted, while other full repository previews retain it.

**Pre-commit audit, 12 October 2026:** Fixed the web Docker build stage to copy the Nginx configuration used by prerender validation. Made product-preview IDs unique while preserving section anchors, and derived contributor repository/PR/revision totals from the same public fixtures as Overview. Removed the superseded workflow wrapper and its unused styles/data; its interaction regression now exercises the actual full-frame preview. Production Docker build and isolated route/header smoke checks passed. The review app remains on localhost:5173; visual acceptance and W4 launch remain separate.

**W3 focused technical validation passed:** 60 API auth/GitHub tests, 14 public-build configuration tests and 20 production Docker/Nginx route/header checks. Earlier browser checks passed 45 auth, 8 hydration/startup and 5 preview cases. The current revision passed 135 web checks in one grouped run (including preview/data invariants, shared chart/status regressions and generated-HTML hydration/startup), the production build, web typecheck, full web lint and whitespace checks. API typecheck and auth-file lint/format checks passed. Visual acceptance and W4 release/launch remain pending. Earlier W1/W2 results above do not establish acceptance of the revised appearance.

Repeat the relevant checks with:

```sh
pnpm --filter @preflyt/web exec node --test scripts/public-build.check.mjs
pnpm --filter @preflyt/api test test/auth.integration.test.ts test/github-login.integration.test.ts
pnpm --filter @preflyt/web test src/features/auth/sign-in-flow.test.tsx src/features/auth/sign-in/sign-in-setup.test.tsx src/features/auth/sign-in-layout.test.tsx
pnpm --filter @preflyt/web test:homepage
```

`test:homepage` builds first and then checks real generated HTML for all six public pages and the rendered 404. Test fixtures use disposable local databases; generated public output contains only approved synthetic Northstar data.
