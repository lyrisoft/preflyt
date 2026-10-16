# Table page sizes and finding status

Recorded findings use a neutral Reported status. It describes an issue supplied by a report, not a positive assessment or a confirmed defect. Resolved remains green, while severity and source verification retain their separate meanings.

Workspace tables now share a Rows per page dropdown with options 10, 25, 50 and 100, defaulting to 10. The shared table paginates complete client collections, clamps a page when the result shrinks, and delegates pagination for server collections without slicing them twice. Changing page size resets to page one. Existing row actions, permissions and filters are preserved. Static marketing previews keep their presentation.

Server pagination supports the selected size for findings (CI, Health and advisory AI), contributor directory, audit log, teams, GitHub member directory, CI evidence, rulesets and Insights, drafts, deployments, and published/automatic merge checks. Invalid or unbounded sizes are rejected. API summaries continue to cover the complete matching result before pagination.

## Verification

- 149 API tests passed across 11 suites, including size validation, matching summaries, cross-page ordering, scope isolation, contributor sync and GitHub events.
- Shared browser regressions exercise the ten-row default, changing sizes, final pages, shrinking filters and controlled server pagination. Shared badge regression verifies neutral Reported and green Resolved.
- Full browser suite: 637 tests across 89 files passed. After replacing the native page-size dropdown with the shared styled Select, 75 focused browser tests passed, including menu selection, row limits, Health, policy history and badge semantics. The shared table schedules overflow measurements outside the ResizeObserver callback to avoid resize feedback during layout changes.

The page-size menu uses the same shared SelectTrigger, SelectContent and SelectItem components as the source filters, with a compact trigger. It retains the accessible Rows per page label and the same four size options.

## Local Compose

Rebuilt and loaded the API runtime and web ARM64 images, then recreated API, worker and web in `preflyt-ce-local` at port 8081 with local images and no pulls. All three are healthy; volumes and existing application data were preserved. Migration and scanner images are unchanged for this update.

Live authenticated requests verified the existing 1,986 findings return 10 rows by default, 25 when selected, and another 25 on page two with no overlap. Result totals and full-result summaries stay unchanged. Audit logs return 10 or 25 rows as selected; the contributor directory defaults to 10. An unbounded findings size returns 400. Login, origin checks, protected routes, SPA routing and health smoke passed.

- API / worker: `sha256:80c6f3026d7af89203bd518c514ef8d4b82475d55b1305631071d50ed2b73019`
- Web: `sha256:3fe21d750af12cbc69feeb35b9c4b5050b19aef68433596a13e907c4a1d8af6c`

API and web typechecks, frontend ESLint, host production/prerender build, Docker builds and whitespace checks passed. The disposable API test database and its volume were removed.

No commit or push performed.
