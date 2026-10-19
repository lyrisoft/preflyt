# Findings index preparation

Findings lists use revision-bound database rows and saved summaries. The API prepares the common organization and single-repository source filters at startup, and discovers newly connected repositories every minute. Exact authorized scopes and report filters requested by users are also registered as durable preparation targets.

Saving, updating or deleting a health report, CI assessment or PR AI review queues the affected targets in the same database transaction. Existing CI artifact revision triggers propagate changes to their parent assessments. The API checks the queue every two seconds and processes up to 20 targets per sweep. Failed preparation retries after ten seconds; interrupted leases recover after one minute. A five-minute reconciliation refresh covers missed or non-report changes. Multiple API instances claim work atomically. A generation check prevents completion from clearing work queued during preparation.

Preparation builds rows and the default/category summaries. Request-specific search and triage summaries are computed and cached on demand. A request arriving before preparation finishes, or requesting a previously unseen scope, still builds the exact current revision synchronously; it never substitutes stale findings. Thus background preparation reduces cold latency but cannot guarantee every request avoids a build.

Prepared data grants no access. Every request resolves current organization and repository permissions before deriving its exact index key. Jobs reload selected, available repositories under active installations in the original organization. Removing access cannot make a broader prepared index available to a narrower scope. Source reports remain authoritative, and details still read the authorized source evidence.

Operational checks: inspect `FindingIndexTarget.nextRunAt`, `lastPreparedAt` and `generation`; a growing overdue queue or repeated `Findings index preparation failed` warnings indicate preparation is falling behind. Source revisions remain the final freshness check on every read.
