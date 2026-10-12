# Public homepage delivery

The existing web app serves the public homepage at `/`; workspace Overview is `/overview`.

`pnpm --filter @preflyt/web build` builds the client, renders the explicit public route allowlist using the same React/TanStack tree with network access disabled, and emits:

- `dist/index.html` and `dist/<public-path>/index.html`: readable page content, route styles, metadata and hydration state.
- `dist/app.html`: empty private SPA shell with `noindex, nofollow`.
- `dist/robots.txt`: indexing disabled by default.

The existing web Dockerfile runs this build. Nginx serves `/` from the homepage and falls back to `app.html` for application routes. API proxying and asset serving retain their existing behavior. Only allowlisted public routes are prerendered; demo product previews contain synthetic Northstar data. The browser may check `/auth/session` to show Open workspace; content does not depend on that response.

## Build configuration

Compose passes these optional public build arguments:

- `PUBLIC_SITE_URL`: an HTTPS origin, without path, credentials, query or fragment. Used for homepage canonical and Open Graph URL.
- `PUBLIC_SITE_INDEXABLE`: defaults to `false`. Set `true` only for the intended public deployment; requires `PUBLIC_SITE_URL`.

Rebuild the web image when changing these values. Private routes always retain noindex metadata. The five W2 public pages are included. Sitemap and broader conversion work remain W3.

## W1 verification, 12 October 2026

Production build and TypeScript validation passed. Focused browser tests cover the marketing workflow preview, sign-in/recovery flow and status badges (32 passing). The generated files were served with the repository Nginx configuration in a temporary localhost-only container. Generated-HTML hydration also passed its browser regression (no recoverable hydration errors; original heading DOM retained). Run `pnpm --filter @preflyt/web test:homepage` to build and repeat it; the test skips when no build exists. The in-app browser stopped responding during the final manual production recheck, so this final check used the automated browser test. Responsive review covers 320px and desktop; homepage uses Geist, verified from BullMQ's computed typography. Marketing typography stays scoped; embedded product previews use application typography.

## Pre-commit audit, 12 October 2026

Reviewed public/private routing, build-time rendering, demo-data boundaries, shared component changes, motion cleanup and reduced-motion behavior. Fixed legacy dashboard links losing JSON-encoded numeric filters, kept the system theme current while a manual theme is selected, and consolidated screenshot ignore rules. Removed superseded prototype files and captures from the commit.

Validation: production build, TypeScript, focused lint and whitespace checks passed; 37 web checks and 29 GitHub sign-in integration checks passed. Existing OIDC deep-link restoration remains outside this homepage change, as recorded in the design contract.


## W2 pages, 12 October 2026

The public allowlist is maintained in `apps/web/src/features/marketing/public-pages.ts` and includes `/`, `/product`, the three `/product/...` capability pages, and `/self-hosting`. The renderer uses the same React route tree; `scripts/prerender.mjs` emits HTML, styles and metadata for every path. Nginx has explicit public routing and retains `app.html` for protected routes.

All pages reuse `MarketingLayout`: header, mobile navigation, session-aware workspace link, footer, theme controls, Geist fonts and the homepage motion hook. Capability content documents actual prerequisites and operating limits; public demo previews remain synthetic. Repository Health is separate from CI merge evaluation, automatic CI coverage ingestion remains pending, and GitHub remains the merge enforcement owner. Self-hosting describes the existing application bundle rather than a Kubernetes Operator.

Verification: six generated pages hydrated without recoverable errors or private data queries; 40 focused web tests passed. Production build, TypeScript and focused lint passed. Direct Nginx requests served all public pages and separate private shells for Overview, sign-in and a repository deep link. Manual review covered all five pages at 320px, 768px and 1440px, light/dark appearance, Geist typography and shared mobile navigation. Published standards, merge-protection, Compose, Kubernetes and all four linked operations guides loaded successfully. Temporary production validation ran on loopback only; the review app remains `http://localhost:5173`.
