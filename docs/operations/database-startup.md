# PostgreSQL startup and recovery

Preflyt requires a writable primary PostgreSQL database. API initialization probes `pg_is_in_recovery()` and `transaction_read_only` in a bounded transaction; connecting a lazy Prisma client alone is not readiness. The integration worker uses the same writable-primary check. Super Admin seeding retries only known transient connection/recovery errors, including PostgreSQL SQLSTATE `57P03` wrapped by Prisma 7's driver adapter. Authentication, missing-table, read-only standby and programming errors fail immediately. Transient startup retries wait at most 60 seconds between attempts, then fail with disk/database health guidance; in-flight operations retain their connection/transaction timeouts. There is no general retry of user writes.

## If logs say “the database system is in recovery mode”

Read PostgreSQL logs and check the filesystem containing its data directory. Recovery may be brief after a restart, but repeating `PANIC ... No space left on device` requires freeing disk space. Application retries cannot repair a full disk. Never delete PostgreSQL data, WAL, checkpoint files or database volumes to recover space.

For local Docker, inspect `docker system df` and `docker exec <postgres-container> df -h /var/lib/postgresql/data`. Reclaim rebuildable builder cache if appropriate: `docker builder prune --force --reserved-space 8GB`. This does not remove database volumes or running containers. Verify the configured database reports `pg_is_in_recovery() = false` and `transaction_read_only = off` before restarting a failed application process. Monitor Docker's VM disk separately from macOS free disk space. Increase Docker's disk allocation or reduce rebuildable cache before it fills again.

On 9 October 2026, the shared local PostgreSQL recovery loop was traced to a full Docker VM filesystem. Reclaiming 6.181 GB of builder cache allowed PostgreSQL to complete its checkpoint automatically. Preflyt's configured database was verified writable and out of recovery; no database files/volumes or running services were removed/restarted.

Primary reference: [PostgreSQL SQLSTATE error codes](https://www.postgresql.org/docs/current/errcodes-appendix.html).
