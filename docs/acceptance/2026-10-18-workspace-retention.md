# Workspace retention — 2026-10-18

Implemented Settings → Data retention for workspace Owners/Admins. The form configures saved CI assessments, source excerpts, notifications, contributor activity and routine audit events. Defaults are 90 days for the first four categories and 365 days for routine audits. Automatic cleanup starts disabled.

Preview computes tenant-scoped eligibility without deletion. Saving requires confirmation and revision checks. The worker claims a fenced policy lease and deletes bounded batches with transactional audit entries. Latest assessments per repository/target branch and explicitly linked assessments are retained. Pending notification work, active source capture, Health reports, human decisions, policy/workflow/security receipts and source evidence remain protected. Host logs, images, builder caches and backups have separate operator controls.

Verification:
- 7 retention integration tests: disabled defaults, period validation, revision conflicts, tenant isolation, read-only preview, linked/latest assessment preservation, notification delivery protection, active source capture, audit receipt protection, bounded concurrent workers, deployment pause, active leases, membership revocation and session/origin checks on HTTP routes.
- 2 actual worker lifecycle tests passed with isolated PostgreSQL/Valkey.
- Browser tests passed for confirmation before save, previewing unsaved periods, input validation, mobile layout, cleanup errors, deployment pause and settings navigation/visibility.
- API production build, web typecheck/lint, documentation production build/version checks and Compose validation passed.
- The new migration was applied through Prisma to an isolated database. No existing application data was deleted and no server was deployed.

No commit or push.
