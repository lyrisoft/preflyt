# Audit log

Administration → Audit log (`/audit-log`) shows recorded Preflyt activity, newest first, with 20 events per page. Filter by action, repository and inclusive UTC dates. Open View for actor, UTC timestamp, selected event details and stable identifiers. Filters and page are retained in the URL. Refresh reloads the current page.

`GET /audit-log` accepts `page`, `repository` (GitHub ID or `all`), `action` (event identifier or `all`), `from` and `to` (YYYY-MM-DD). Responses include filtered total, page size, next-page availability, authorized repository choices and scoped action choices. Data, count and choices use a repeatable-read transaction. Responses are not cached.

Owners, Admins and Auditors have `audit.read`. A live active workspace membership is required. Existing GitHub access and repository grants continue to limit repository events; Auditors additionally see workspace-level events. Super Admin recovery does not bypass workspace membership or repository authorization. Access Control Activity remains access-specific.

Historical events resolve through repository, installation, policy, assessment, deployment, execution, AI review, submission and team records. Actor membership is never used to infer event scope. Records without verifiable scope, missing repository resources, conflicting workspace references, or inaccessible repositories are omitted. This page exposes recorded Preflyt actions, not GitHub’s entire audit history. Global deployment events without workspace scope are excluded.

Raw metadata, report bodies, credentials, prompts and private keys are never returned. Only explicitly selected scalar details are shown. Actor names use the current display name or linked GitHub login; deleted actors retain a shortened ID fallback, and events without an actor display Automated system.

Verification covers disposable-database API tests for paging, UTC boundaries, invalid input, legacy references, tenant isolation, grant revocation, role denial and metadata exclusion; Chromium UI tests for deep links, pagination, filters, browser Back, details, retry, empty and denied states; and live existing records at desktop and 320px.
