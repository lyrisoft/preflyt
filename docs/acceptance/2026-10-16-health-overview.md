# Repository health overview — 16 October 2026

Replaced Engineering Overview's Health assessment-status list and duplicated priority-finding details with an interactive repository-health donut and a repository-level attention list.

The donut uses the API's deterministic overall-health outcome: Healthy, Needs attention, Unhealthy, Incomplete, Not assessed and Queued/running. Completed assessment state never establishes Healthy. Missing legacy health classifications fail closed to incomplete unless the request is active or no assessment exists. Labels and counts remain visible in keyboard-accessible filter buttons; chart colors follow shared semantic tokens. Selecting a segment or legend filters the list beside it. The list prioritizes unhealthy repositories, shows saved report dates and separate freshness, paginates five rows at a time and links to exact saved Health reports. No finding titles, paths or vulnerability descriptions appear here.

Metric cards now show healthy/total, unhealthy plus advisory attention, incomplete plus unassessed and active requests. The dashboard requests the complete supported portfolio (up to 1,000 authorized repositories) instead of deriving totals from the default 25-row page. The existing API scope and access checks remain unchanged. Bounded scopes are labeled. If items do not cover the summary total, metric cards say unavailable and the chart explicitly labels its loaded scope rather than inventing missing states. Error responses hide cached results.

Help content and the repository Health user guide describe the new view. Freshness, current GitHub merge permission and whole-repository health remain distinct; no score or trend is invented.

Verification: 12 focused browser/unit tests passed, including distribution partitioning, no completion-to-healthy inference, chart/list filters, repository filtering, retries/access errors, exact saved-report links, and responsive 320px layouts in both themes. Desktop and mobile captures were inspected. Web TypeScript, focused ESLint and diff whitespace checks passed; documentation production build passed. Web production/prerender image rebuilt locally for ARM64; existing API/worker/scanner/migration images remain unchanged.

Private evidence: `/private/tmp/preflyt-health-overview-*`; visual captures in the ignored dashboard `__screenshots__` directory. No commit, push, registry publication or GitHub workflow run.

Applied to the local documentation Compose project on http://localhost:8081. Web image `sha256:091c1b6dda3174ad26519ffd969c43f01515fb07c743df6b0830cecb50f83ffa` is healthy and recorded in the private local manifest. Login/origin/protected-route smoke passed. The live portfolio returned all three repositories, with one Healthy and two Unhealthy; counts partitioned the complete authorized scope. Settings and application volumes were preserved.
