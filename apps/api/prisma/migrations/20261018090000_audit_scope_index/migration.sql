-- Include legacy records without an explicit workspace, while allowing the
-- audit reader to skip records explicitly belonging to another workspace.
-- Expression indexes are managed in SQL; Prisma cannot model them.
CREATE INDEX CONCURRENTLY "AuditEvent_scope_createdAt_id_idx" ON "AuditEvent"
  ((COALESCE(NULLIF(metadata->>'organizationId', ''), '')), "createdAt" DESC, id DESC);
