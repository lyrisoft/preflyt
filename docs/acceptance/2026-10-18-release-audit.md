# Release audit — 2026-10-18

Reviewed the accumulated GitHub coordination, durable page reads, retry UX, workspace retention, guided App permissions and the three preceding workflow-setup commits.

- API unit regression: 1,278 passed, 2 skipped across 134 files after correcting seven outdated expectations in six files. The six affected files were rerun together: 64 passed.
- Targeted integration/worker regression: 278 passed after updating two Health source tests to queue and reconcile source capture before asserting excerpt contents; all 43 Health tests passed on rerun.
- Browser regression: 66 passed across the eight affected settings, skills and workflow surfaces.
- API production build, complete web production/prerender build and full web lint passed.
- Prior focused retention and permission checks covered migrations, workspace isolation, preview-only behavior, protected records, bounded workers, leases, session/origin controls and default setup-PR permissions.

Audit correction: the Kubernetes cache still used allkeys-lru while Compose required noeviction. Kubernetes now preserves active coordination leases and budget counters too. Related deployment tests were updated. Existing manual publication tests now allow the intended reusable documentation publication job while continuing to prohibit regression/Compose workflows from that publication path.

No existing application database was altered. Database/Redis tests used task-owned disposable services. Main's separate README update is preserved during integration. Four additive migrations require the normal migration job before updated API/worker processes start. Workspace cleanup remains disabled until an administrator enables it; protected Health reports, decisions, replay receipts and linked evidence remain retained.
