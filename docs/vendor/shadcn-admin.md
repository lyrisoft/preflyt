# Shadcn Admin source import

Imported on 2026-10-08 from [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin/tree/e16c87f213a5ba5e45964e9b67c792105ec74d26) at **e16c87f213a5ba5e45964e9b67c792105ec74d26** (upstream version 2.2.1). Source is tracked directly under apps/web; there is no runtime Git dependency. [The source manifest](shadcn-admin-source-manifest.json) records original Git blob hashes, destinations and exclusions.

## Source and licensing

The full tracked application snapshot includes src, public, configuration, component/browser tests and upstream documentation. Upstream MIT copyright and license remain in apps/web/LICENSE; its README remains in README.upstream.md. Upstream GitHub automation, editor settings, Netlify deployment configuration and nested lockfile are excluded. Preflyt uses a single workspace lockfile. No nested Git repository is imported.

Inline Tabler icons retain their MIT attribution in apps/web/THIRD_PARTY_NOTICES.md. Bundled upstream screenshots and branding remain development assets; replacement and individual asset/license review are required before product distribution. Google Fonts are loaded externally by upstream index.html; they are not bundled or guaranteed available offline. Customized shadcn components require deliberate review when upgrading. Dependency license declarations are recorded in [the inventory](shadcn-admin-dependency-licenses.json); this is an inventory, not legal clearance. Preflyt's own source license remains undecided.

## Local changes

- Renamed package to @preflyt/web; added a typecheck script and removed system-package installation from the browser installer.
- Raised Axios to ^1.20.0, Vite to ^8.3.3 and all Vitest packages to ^4.1.11. Fresh workspace resolution updates compatible transitive dependencies. No dependency overrides are used.
- Vite uses import.meta.dirname for its source alias. Added Preflyt development instructions separately from the upstream README.
- Added pnpm/Turborepo root commands, strict peer dependency checks and one committed lockfile.

## Verification

The pinned upstream build and 130 browser tests passed before import. Its original production audit reported 52 advisories (2 critical, 24 high, 25 moderate, 1 low).

The imported workspace was verified from /Users/peterschikezie/Documents/GitHub/78/preflyt using Node 24.4.1 and pnpm 10.15.1. Resolved Vite is 8.3.4, Axios 1.20.0, Vitest packages 4.1.11 and Playwright 1.59.1. Strict peer installation passed. Commands: pnpm build, pnpm lint, pnpm typecheck, pnpm format:check and pnpm test. Browser tests: **130 passed across 21 files**. The complete pnpm audit returned **zero known advisories** on the import date; future findings require re-evaluation. Browser binaries for this run were stored under node_modules/.cache/ms-playwright.

A Playwright smoke run against the built Vite preview rendered the Dashboard heading without page errors while external requests were blocked. This verifies baseline startup only, not Preflyt authentication or repository workflows.

The build reports large demo chunks; bundle reduction belongs to product adaptation.

## Release boundary

This is an upstream development baseline, not a usable Preflyt release or P0 completion. Demo dashboards, users, fake authentication and Clerk example routes are retained for the source import. They do not implement Preflyt authentication. Follow-up P0 work must replace them with ADR-0003 OIDC/server sessions, NestJS authorization and real GitHub repository data; review assets, accessibility, external requests and deployment packaging before release. No connected repository code execution or remediation is implemented.

## Asset and redistribution audit

This audit permits continued internal development from the pinned source. It does **not** clear the current branding and demo assets for redistribution as Preflyt. Replace or independently verify them before any public or customer release.

| Asset or content | Observed source/status | Required release action |
| --- | --- | --- |
| Application source and upstream text | Covered by the retained upstream MIT `LICENSE`; preserve its notice | Keep license and attribution with redistributed portions |
| Inline Tabler brand icons | Tabler Icons MIT notice is included in `apps/web/THIRD_PARTY_NOTICES.md` | Preserve notice; review each brand mark before using it to imply provider affiliation |
| Dashboard preview images | `src/features/auth/sign-in/assets/dashboard-{light,dark}.png`; upstream product screenshots | Replace with Preflyt-owned images or verify a redistribution grant |
| Upstream logo and favicons | `src/assets/logo.tsx`, `public/images/favicon*`; Shadcn Admin identity | Replace before Preflyt branding or external distribution; MIT code license does not establish trademark permission |
| Open Graph preview | `public/images/shadcn-admin.png`; upstream product image, no longer referenced by `index.html` | Add a Preflyt-owned preview image and absolute `og:url`/`og:image` once a production URL exists |
| Inter and Manrope fonts | Loaded at runtime from Google Fonts in `index.html`; font files are not in the repository | Decide on remote-font policy; if self-hosted, record the exact font versions and include their license notices; if remote, review third-party browser requests/privacy |
| Demo profile avatars | Demo chat JSON references `randomuser.me` image URLs; images are not bundled | Remove demo routes/data or replace with local neutral placeholders before release; avoid third-party requests from a self-hosted installation |
| Dependency licenses | Installed package inventory is recorded in `shadcn-admin-dependency-licenses.json`; every package declares license metadata | Inventory is not a legal opinion; regenerate and review notices on dependency updates |

No font binaries are bundled. Demo image URLs are external references, not redistributed image files. The source manifest is authoritative for the complete imported file list.

**Audit outcome:** proceed with the pinned baseline for engineering development after the documented dependency fixes. Do not treat the current assets, branding, demo routes or external requests as release-cleared. P0 product adaptation must remove or replace them and verify the final asset set before packaging.
