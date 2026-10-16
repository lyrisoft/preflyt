# Workspace changes: final local audit

This audit covers the pending guided assessment setup, built-in check descriptions, saved merge review results, repository profile omissions, automatic contributor sync, health overview and shared table pagination changes. Earlier acceptance records describe their individual implementation checks; the image IDs below supersede their local deployment snapshots.

## Corrections found during the audit

- Retained Insights now reports the requested number of scanned suites for 25/50/100-row pages, instead of capping the count at 20. A 21-record regression verifies the 25-row response.
- Contributor sync removes expired manual cooldown records and records the organization and public repository ID in its request audit event. Integration coverage verifies both.
- Team repository and impact tables have one shared pager, without the obsolete second pager.
- Hidden chart data alternatives retain every row and contain no invisible pagination controls. Visible tables keep the ten-row default and styled page-size menu.
- Removed unused paging state and empty conditional fragments left by the table conversion.
- Replaced the rejected narrow health chart with a full-width continuous time axis. Regular UTC ticks extend before and after the saved scans, with at least one day of context. Empty time is blank, not a fabricated zero-finding assessment. Bar width responds to the time gap and available width; comparison lines still respect equivalent analysis coverage.

## Verification

- API full run: 162 files passed; 1,759 tests passed and four skipped. One Redis cache test failed because the test command supplied TEST_REDIS_URL but omitted the REDIS_URL used by that cache. With REDIS_URL supplied, all 16 dashboard integration tests passed. No product change was made to accommodate that fixture configuration error.
- Focused final UI regressions: 20 tests passed across shared tables, team tables and the corrected health timeline. The timeline was also visually inspected at desktop width and checked at 320px in light/dark modes.
- Public-page verification: regenerated host production HTML after disabling pagination on hidden chart tables; all 21 focused public preview and hydration tests passed. A prior full run exposed a transient mobile preview duplicate-ID assertion; its diagnostic now lists any duplicate IDs rather than only reporting counts.
- Final full browser confirmation: all 640 tests across 89 files passed. The runner logged a nonfatal ResizeObserver notification warning; no test failed in that run.
- Web typecheck and ESLint passed.
- Documentation production build passed, including its generated asset validation.
- API and web Docker production builds passed, including TypeScript compilation, web bundle generation and public-page prerendering.
- Four deployment smoke regression tests passed.
- Deployment smoke passed for health, SPA routing, protected API, origin checks and configured authentication.
- Whitespace validation passed.

## Local deployment

Rebuilt ARM64 images locally, retagged them to the optimized tags already used by the documented local Compose setup, and recreated API, worker and web in project `preflyt-ce-local` using `--pull never`. All updated services are healthy at http://localhost:8081. Existing application volumes were preserved. The migration and scanner images were unchanged by this final audit.

- API / worker: `sha256:d96be7638aa99c37bbd082e9ec1c6e3a3f3e1327ecafa63c8a002d8f53ad9b3d`
- Web: `sha256:e0cbe79cb9da11ccc0e3801a072789507d0f38e99a194c0d5130017f8e693242`

Removed only the disposable audit PostgreSQL and Redis containers after testing. No images were uploaded and no Git push was performed. These checks do not constitute a new public release or a live GitHub installation acceptance run.
