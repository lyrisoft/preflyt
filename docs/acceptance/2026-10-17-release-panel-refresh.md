# Release panel readability and freshness

## Implemented

- An amber update dot remains visible for every signed-in user after notes are read and clears only when the installed version catches up with the latest qualified release. The release panel opens on the newest published notes and resets to the newest release after a successful check. The installed version and latest installable version remain separate.
- Automatic installation-wide checks run hourly. Owners/Admins opening the panel refresh metadata older than five minutes when automatic checks are enabled. The existing shared one-minute cooldown, one-hour failure backoff, replica lease, and administrator permissions remain enforced. The API checks the saved automatic-check preference even if an open panel has stale cached preferences.
- The API exposes the next permitted check time. The panel disables checks during the shared cooldown, shows the retry time, and does not report cached or failed requests as successful checks.
- Release notes use styled Markdown headings, lists, tables, code and safe external links. Bare GitHub pull-request URLs have compact numbered labels. Remote images and raw HTML are not rendered.
- Image tags and commit metadata are retained in a collapsed disclosure. Preferences and the last-check timestamp sit below the scrolling release content.
- Refresh failures preserve previously fetched notes. Fresh check responses replace the query cache after cancelling stale reads.
- Updated Next installation documentation; existing versioned documentation is unchanged.

## Verification

- GitHub public release feed confirmed v0.1.5 is published, stable, and carries the image-readiness marker. No release metadata was changed.
- 13 focused browser tests passed, including v0.1.4-to-v0.1.5 refresh, disabled automatic checks, cooldown handling, safe Markdown, cached failures, keyboard dismissal, and 320px/1440px light/dark layouts.
- 10 focused API integration tests passed against an isolated temporary PostgreSQL database, including shared leases, hourly expiry, v0.1.5 discovery, RBAC, offline cache preservation, and prerelease filtering.
- Web and API type checks passed. Focused frontend ESLint passed without warnings.
- Community web production build and public-page prerender passed.
- Reviewed screenshots rendered with the published v0.1.5 release text. These are component-test installations, not the EC2 instance.

## Final publication audit

- Full API regression: 167 files passed; 1,867 tests passed and one optional separate Action-checkout test skipped (`PREFLYT_ACTION_CHECKOUT` was not configured). Dedicated Redis cache/queue/notification checks, dashboard Redis caching, and offline signature verification were enabled and passed.
- Full Chromium regression: 97 files and 716 tests passed on the final implementation. A pre-existing non-failing ResizeObserver warning appeared during chart/layout tests.
- API/web type checks and production builds passed; complete frontend lint passed.
- Documentation types, production build, version identity and frozen-download checks passed.
- 42 portable Node release/deployment fixtures, two additional GNU-tar scanner fixtures in Linux (five Linux packaging tests total), 16 Python CI fixtures, and 14 public-build routing checks passed.
- Audit fixed a stale-preferences edge case by distinguishing automatic panel refresh requests from explicit manual checks. Saved disabled preferences are enforced inside the API, including the atomic replica lease.
- The persistent amber-dot regression verifies readers retain the indicator after reading notes and lose it only after the installed version catches up. Upgrade controls and deployment preferences retain their existing permission boundaries.
- Verification covered the final source tree on `codex/release-panel-refresh`; the commit and publication run identities are recorded in the release PR.

## Deployment boundary

The user authorized committing, pushing, PR merges to development and main with administrator override, and manual application-image/documentation publication from main. These workflows publish packages and documentation; EC2/Compose deployment remains a separate operator action. Publication results are recorded in the release PR.
