# Documentation screenshots

User Guide images live in `apps/docs/static/img/guides/`. These are actual app captures from the local v0.1.1 deployment on 15 October 2026, using its existing light theme and 1728 × 906 viewport. The audit-log image was replaced on 16 October 2026 with a capture of the current app using synthetic documentation fixtures, not live workspace events. Its caption identifies the example data. The original image containing a real actor name has been removed. Each guide links to the full-size JPEG and describes the state shown.

Retake the relevant image when its UI changes. Keep the same theme and viewport, wait for loading to finish, and avoid credentials, private configuration values and open account menus. Use real setup or empty states when a feature is not configured; do not imply they demonstrate successful execution. Native execution currently shows its assessment entry point because this deployment has no enabled native runtime. AI and email screenshots show their disabled setup states.

The pending Health completeness and GitHub onboarding changes are not running in this published deployment. Refresh those captures after the new release is deployed.

Landing release badges link to Preflyt releases and the Action Marketplace. The public Action badge follows GitHub releases. Preflyt's private repository cannot supply an anonymous dynamic GitHub badge: update the verified Preflyt version and release URL in `DocsHero.tsx` and `features/marketing/index.tsx` when publishing a release.

Visual verification: both landing-page badges loaded, and all 14 User Guide images rendered in the local docs server. No automated tests or production builds were run for this documentation change, and nothing was committed or pushed.

## Privacy requirements

Never capture a personal or customer session for new documentation screenshots.
Use a dedicated documentation workspace with synthetic actors, reserved example
email domains, example repositories and no personal avatars. Review the complete
image, including the sidebar, account controls, tables, tooltips and dialogs.
Remove personal names, logins, emails, IP addresses, IDs, tokens and private paths.
Do not rely on blur or CSS hiding over an original downloadable image.

The reproducible audit capture is `apps/web/scripts/capture-audit-guide.mjs`. It
renders the actual app with intercepted synthetic API responses, uses an isolated
browser with no existing cookies, aborts unrecognized API requests, blocks external
requests except the app's public Google font assets and checks rendered text for non-fixture identities. Start the local app
with the command documented at the top of the script. Never run it against a real
API or add credentials. Inspect the resulting JPEG before linking it in a guide.

On 16 October 2026 all 14 existing guide images were visually inspected. The
audit-log image contained the personal name; the other 13 showed no visible
personal names, email addresses or individual avatars. Those older captures still
contain the publisher's workspace/repository names and should migrate to the same
synthetic capture approach when retaken. The exposed audit-log JPEG was subsequently removed from local Git history with
owner authorization; no remote publication was performed. Previously downloaded or cached copies cannot be recalled by this
local replacement.
