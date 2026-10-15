# Documentation screenshots

User Guide images live in `apps/docs/static/img/guides/`. These are actual app captures from the local v0.1.1 deployment on 15 October 2026, using its existing light theme and 1728 × 906 viewport. No data or UI text was fabricated. Each guide links to the full-size JPEG and describes the state shown.

Retake the relevant image when its UI changes. Keep the same theme and viewport, wait for loading to finish, and avoid credentials, private configuration values and open account menus. Use real setup or empty states when a feature is not configured; do not imply they demonstrate successful execution. Native execution currently shows its assessment entry point because this deployment has no enabled native runtime. AI and email screenshots show their disabled setup states.

The pending Health completeness and GitHub onboarding changes are not running in this published deployment. Refresh those captures after the new release is deployed.

Landing release badges link to Preflyt releases and the Action Marketplace. The public Action badge follows GitHub releases. Preflyt's private repository cannot supply an anonymous dynamic GitHub badge: update the verified Preflyt version and release URL in `DocsHero.tsx` and `features/marketing/index.tsx` when publishing a release.

Visual verification: both landing-page badges loaded, and all 14 User Guide images rendered in the local docs server. No automated tests or production builds were run for this documentation change, and nothing was committed or pushed.
