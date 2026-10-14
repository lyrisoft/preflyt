# Health branch selection — 2026-10-15

The repository header branch picker changed only component state. Health requests and their cache keys omitted that choice, so the API kept returning the persisted scan target, usually development. Reloading discarded the choice. Explicit historical report responses could also identify the target branch instead of the report's own branch.

The header now stores the Health branch in the route search state and clears a pinned historical assessment when selecting another branch. Health requests and query caches include that branch; report state resets between header branch choices. The API validates the optional branch, scopes the report and history read to it, and uses the selected report's branch for historical links. A branch without a saved assessment returns an empty history and no coverage instead of borrowing another branch's results. Reads do not change the shared scan target or queue work. Assessment and coverage remain tied to their original commit; reassessment is still explicit. No schema migration is needed.

The pre-commit audit additionally found and fixed two related cases: reassessing a historical report left its old assessment ID in the URL, and browsing another branch could display the shared target’s head-check time. Successful assessment admission now pins the newly queued report in both the component and route. Head-check timestamps are withheld for other branches, and their freshness requests neither inspect nor refresh the shared target. Regressions cover queued-report URL persistence and branch-specific freshness metadata.

Local verification:

- Full Chromium suite: 83 files and 579 tests passed after the audit. The focused 43-case browser run also passed the queued-assessment and branch-selection regressions. The new repository-header regression uses real Health queries and checks branch selection, cleared historical pins, no implicit POST and persistence on page remount. The Health component regression checks immediate empty-state replacement and an explicit assessment POST for the chosen branch. The suite emitted the existing ResizeObserver notification while completing with exit code zero.
- Full API unit suite: 123 files and 1,103 tests passed; two existing opt-in cases were skipped.
- All 41 Health integration tests passed against disposable PostgreSQL databases. New HTTP cases verify slash-containing branch names, branch-specific history and source SHA, empty unassessed branches, historical links, conflicting branch/report pins, invalid input and cross-organization denial. Read-only branch selection leaves the shared target unchanged.
- The exact pinned local Semgrep and Gitleaks policy recipes passed on final source, new regression files and successful build output: zero findings, successful invocations and passing Action parser results.
- Workspace type checks, API/web/docs production builds, web lint and changed-file formatting passed. The source-watched local API readiness endpoint returned ready.

Local verification completed before the requested local commit. No push, workflow dispatch, CI rerun, new Health scan or live AI request was performed. Reload the local source app, select the desired branch, and use Assess repository if that branch has no saved Health assessment. Existing verified coverage is then projected only for the matching assessed commit.
