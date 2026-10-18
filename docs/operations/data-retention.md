# Workspace data retention

Open **Settings → Data retention** as a workspace Owner or Admin. Each workspace has its own settings and revision. Cleanup is disabled until an administrator enables it and confirms Save. No old data is removed merely by opening the section or previewing it.

| Category | Default | Range | Protected data |
| --- | --- | --- | --- |
| Saved CI assessments | 90 days | 30–3650 | Latest assessment per repository/target branch; links from publications, readiness tasks, pipeline submissions, AI reviews/guidance, finding decisions, notifications, open PRs or policy exceptions |
| Finding source excerpts | 90 days | 30–3650 | Active source capture; original assessments remain unchanged |
| Notifications | 90 days | 30–3650 | Unfinished notification fan-out, pending/sending deliveries and active delivery leases |
| Contributor activity | 90 days | 30–3650 | Contributor identity and replay receipts remain; charts cover the observations retained |
| Routine audit history | 365 days | 90–3650 | Only explicitly eligible notification, retention and access-denied events are removed; policy, workflow and security decision receipts remain |

**Preview cleanup** counts eligible records for the proposed periods without saving them. Counts are not reserved and can change before cleanup. Counts for notifications cover parent events; deleting an event also deletes its inbox and email-delivery records. **Queue cleanup** schedules a pass of the saved policy; it does not run deletion inside the browser request. Disable automatic cleanup to stop future passes; the API rejects policy changes while a worker owns an active cleanup lease.

Health assessment reports, human review decisions, signed evidence, policy definitions, active work, webhook receipts and current authorization data are outside these deletion categories. Protected links can keep records beyond their nominal age. This first release does not offer configurable deletion of protected Health reports or decision receipts. CI assessment request replay is limited by retained assessment history; retention does not remove active publication/submission references.

## Worker and deployment

Apply the additive `20261018070000_workspace_retention` migration and regenerate Prisma before starting the updated API and worker. It adds workspace policy storage and lookup indexes; it does not delete existing data. The worker checks due policies as part of its normal loop, claims a fenced database lease, and deletes in bounded transactions. Each deletion batch and completed pass produces an audit record. Revision, lease expiry and workspace boundaries are checked before each batch. Failures retain completed deletions and retry after five minutes; they do not roll back already completed categories.

- `RETENTION_CLEANUP_ENABLED=false` pauses all workspaces. Configure it consistently on API and worker so the UI reports the pause correctly.
- `RETENTION_CLEANUP_BATCH` defaults to 250 parent records per category, range 10–1000.
- Up to five due workspace policies are considered per pass. A full batch schedules another pass in one minute; otherwise the next pass is in one hour.
- A preview may involve several counts on a large database. Supporting indexes scope assessment/reference, notification and audit lookups.
- Back up the database before enabling deletion and verify restore procedures. This feature never creates, rotates or removes backup files.

Ordinary PostgreSQL vacuuming generally makes deleted space reusable by the database; host disk usage may not shrink immediately. Do not run blocking table rewrites as part of this cleanup worker.

## Other storage

Saved GitHub display snapshots and member directories already have seven-day expiry rules; ruleset history follows `RULESET_INSIGHTS_RETENTION_DAYS`. Temporary Git clones are normally removed after use, and scanner journals have their own cleanup. These mechanisms remain separate.

Docker logs, application images, builder cache, scanner images and local/off-server backup rotation require host-level deployment operations. The settings page cannot safely prune arbitrary Docker resources or server files. Measure host usage first and preserve the current/rollback images and persistent database volumes.
