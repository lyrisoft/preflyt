# Standalone website mode and simplified Cloud pricing

Based on `b9b5bb2` plus uncommitted changes. No commit, push or public deployment.

## Changes

- Removed detailed Cloud feature lists, workflow section and Cloud FAQs from
  pricing source. Kept Cloud, Coming soon, a short managed-service description
  and Contact us for updates. Community features and FAQs remain.
- Added build-time `VITE_WEBSITE_MODE=true`, with a separate public-only browser
  entry/router and server-renderer selection. No auth/workspace routes, legacy
  dashboard redirects or application providers enter this entry point.
- Marketing omits all three sign-in/workspace links from the DOM and makes no
  session request in website mode. Website build checks reject leaked auth code,
  application links or app.html. Public routing remains interactive and prerendered.
- Added standalone Nginx configuration without an API upstream. Docker build
  selects the matching configuration with the same build argument. Default false
  preserves full Community application behavior. This is not a runtime env toggle.
- Set the ignored local apps/web/.env.local website flag to true; documented the
  build/deployment commands. Turbo hashes the mode, public-origin settings,
  local environment inputs and both Nginx configurations separately.

## Verification

- Eight focused Chromium tests passed: pricing at 320/768/1440px, Community FAQ,
  website mode at mobile/desktop with zero fetch calls/no auth links, retained
  session-aware application access, and public-router path limits.
- Fourteen public metadata/routing build tests and eleven CI contract tests pass.
- Web TypeScript, ESLint and whitespace checks pass.
- Both website-only and full application production builds pass. Website mode
  prerenders seven public pages plus 404; full app still emits its noindex shell.
- Both local ARM64 Docker images built and were inspected.
- Standalone website runs on http://localhost:8082 with no Preflyt API/database.
  All seven public paths and healthz return 200. Ten probes for auth, setup,
  workspace, app shell, API, unknown routes and dotfiles return 404.
- Actual browser inspection confirms the compact Cloud card and absent login;
  preview saved locally at /tmp/preflyt-website-mode.png.

## Images and local operation

Website-only: `preflyt-local/preflyt-web:website-20261016-arm64`

Content ID: `sha256:14875d5c43d7ab93e412664709321926497021e9ffdcb6925c07280de3eda116`

Running container: `preflyt-website-local`, bound to 127.0.0.1:8082 only.
Read-only filesystem, temporary /tmp, dropped capabilities and no-new-privileges.

Full Community web content ID: `sha256:031b2ac9fc334e724ce9d14ac7c2f71f35804082788b83f53849045b4ca6f122`

The existing `optimized-20261015-arm64` web alias and ignored local Compose image
record were updated to that full application image, preserving sign-in for
Community Compose. The previously removed Preflyt application stack was not
recreated. Public DNS, hosting, GitHub visibility and registry publication remain
unchanged. Source edits are uncommitted.
