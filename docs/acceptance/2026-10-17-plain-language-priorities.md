# Plain-language UX: priorities 1–4

Implemented the four highest-priority findings from the page-by-page language review.

- Repository inspection no longer claims that merging is unblocked. Policy publication explains that existing GitHub rules can require the resulting check; publication itself does not activate rules.
- Teams reads existing organization scope without creating it. First-time scope creation requires explicit confirmation explaining that all currently selected repositories are included. Skill retirement requires confirmation explaining its permanent effect, with cancellation and retry after failure. Finding ignore explains its exact matching limits and preserves saved assessment and merge-rule distinctions.
- Contributor metrics count **PRs with failed required checks**, consistently in the summary, accessible name and help.
- **Allow GitHub ruleset activation** describes a capability setting. Its associated description explains that enabling it does not activate rulesets or change existing GitHub rules.

## Local verification

- 67 tests passed across eight focused web suites: Teams, Skills, contributor summary/help, Configuration, Finding review, branch inspection and policy publication. The corrected Teams/Configuration fixtures were rerun; Skills was rerun after adding non-admin coverage.
- 15 Teams API integration tests passed, including the new lookup's organization isolation and permission checks.
- Web and API TypeScript checks passed. Focused web ESLint and `git diff --check` passed.
- Browser tests use mocked application requests. API integration tests use a disposable local database. No live GitHub rulesets, skill versions or repository scopes were changed for verification.
- No schema migration, container rebuild, Compose update, commit or push was performed for this task.
