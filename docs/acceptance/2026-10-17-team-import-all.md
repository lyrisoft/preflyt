# Import all GitHub teams

The Teams import dialog offers an organization-wide **Import all teams** action. It uses the complete discovery response, including nested teams and teams outside the current page or name filter. Discovery marks existing imports using the current Preflyt organization's records. Existing imports are skipped; the action does not synchronize or overwrite their approved scope.

Imports run sequentially through the existing server-authorized endpoint. The organization selector and import actions remain disabled during execution. Progress and per-team errors remain visible; successful teams stay saved and retries target only the remaining teams. Repository scope approval, membership access, policy activation and existing team limits are unchanged. Keep the dialog open until completion; this is not a persisted background job.

## Local verification

- Teams browser suite: 16 passing tests, including import across 13 discovered teams, existing-import skipping, filtered/paginated lists, sequential execution, partial failure, retry, disabled controls, reader permissions and mobile layout.
- Teams API integration suite: 15 passing tests against a disposable local database. Discovery distinguishes existing imports; unauthorized discovery is denied. Imported repository associations remain outside policy scope until approved, and failed synchronization preserves prior scope.
- Web and API TypeScript checks pass. Focused web ESLint passes.

Next documentation and operations guidance are updated. Released v0.1.2 documentation remains unchanged. No production GitHub teams were imported during verification.

## Pre-merge audit

The same change set shortens the completed inspection badge to **Inspected**, preserves its shared green success mapping, groups the repository branch selector beside Help, and removes the Health branch helper sentence at the user's request. Branch selection, inspection scope details and Help behavior are unchanged.

The final affected regression run passes **48 browser tests** across six suites and **20 API tests** covering team import and policy composition. Web/API TypeScript and focused web lint pass locally. The production website-mode build passes and prerenders seven public pages and 404; its artifact check confirms no application shell, authentication code or workspace links. No hosted workflows or image publication are triggered by this change set.
