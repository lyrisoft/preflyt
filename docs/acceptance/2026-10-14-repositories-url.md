# Canonical repository navigation — 14 October 2026

Repository inventory now uses `/repositories`. The sidebar, command search, dashboard actions, repository breadcrumbs, Findings links and GitHub setup/OAuth callbacks all use that URL. Repository details retain `/repositories/{id}` and highlight the same sidebar entry.

The authenticated `/apps` route is a compatibility redirect using history replacement. Valid GitHub connection/error feedback, account query values and URL fragments survive the redirect. The inventory remains under the existing authenticated layout and permissions; GitHub App URLs and authorization logic are unchanged.

Validation: 19 distinct navigation/browser checks passed, including real router redirects and callback-query preservation; 22 API tests passed for GitHub integration and callback origins. API/web TypeScript, focused frontend ESLint and diff checks passed. No push or GitHub Actions run.
