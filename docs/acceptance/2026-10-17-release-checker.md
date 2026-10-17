# Release checker and What’s new

Implemented locally on 2026-10-17. Not committed or published.

## Delivered behavior

- Sidebar version control opens an accessible What’s new dialog. Installed release version/commit come from build metadata; local builds are labeled Development. Web/API commit differences are reported in the panel.
- GitHub public release metadata is fetched by the API at startup and every 12 hours. A shared database cache, ETag conditional requests, atomic replica lease, one-minute manual cooldown, one-hour failure backoff, eight-second timeout and 2 MiB response limit bound requests.
- All signed-in users can read notes; read state persists per identity. Opening notes clears the unread indicator while an administrator's upgrade indicator remains until the installed version catches up.
- Workspace Owners/Admins and deployment admins can request a check. Only deployment admins can disable automatic checks or include prereleases. Preferences are audited and revision-protected. Stable releases are the default.
- Upgrade comparisons use semantic versions. Only releases carrying the workflow's verified-image readiness marker trigger upgrade notices; unqualified releases remain readable as notes. Drafts are excluded.
- Outbound requests use the fixed public GitHub endpoint without user or installation credentials/identifiers. Notes render without raw HTML or remote image loading. Upgrades remain manual.
- Offline/private-repository failures retain cached notes and last successful check time. No GitHub access failure is presented as proof that an installation is current.

## Publication metadata

- Both existing manual main publication workflows plan the version before building API/web images and pass the source commit. Publication fails if that planned version has drifted.
- The readiness marker is written only after all required image manifests are verified and version tags are complete. Existing releases without it do not automatically qualify.
- Workflows remain manual. No hosted workflows, image pushes or GitHub changes were performed.

## Local verification

- Eight migration-backed API tests passed in a disposable database, including authenticated SessionGuard HTTP requests, administrator boundaries, replica concurrency, cache/ETag handling, expiry of cache intervals, development versions, prerelease selection, read state and bounded failures.
- 42 browser tests passed: release panel/status badges plus existing sidebar, command navigation and authorization navigation tests. Reviewed 320px and desktop captures in light/dark themes after transitions settled; verified keyboard dismissal and safe note rendering.
- 17 local publication/image-planning tests passed. Publication workflow YAML and version dependencies parsed successfully. API/web TypeScript, focused frontend ESLint and whitespace checks passed.
- Prisma Client regenerated; additive migration `20261017020000_release_checker` applied to local development and Compose databases. No test reset was run against application databases.
- All five ARM64 application images built locally and tagged `preflyt-local/*:release-checker-20261017-arm64`. Ignored `work/community-local` records hold the version and content IDs. Existing volumes retained.

Compose smoke verification follows below.

## Compose smoke verification

- All application and backing services are healthy. Migration and Health initialization exited successfully; running API/worker, web, scanner and migration image IDs match the build records.
- Web returned HTTP 200; API readiness returned ready. Unauthenticated `/api/releases` returned HTTP 401.
- Authenticated local admin login returned HTTP 201; `/api/releases` returned the Development label, embedded source commit and deployment-admin preferences. Credentials/cookies were not printed or persisted in test artifacts.
- The live anonymous GitHub releases endpoint returned HTTP 404, consistent with the repository remaining private. The panel correctly reports no successful check and retains the offline/private-repository failure state; deterministic tests establish the available-update and changelog behavior without injecting fake releases into the application database.
- Local app: http://localhost:8081. No commit, push, release publication or hosted workflow dispatch occurred.
