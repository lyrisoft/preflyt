CREATE TABLE "FindingIndexTarget" (
 "id" TEXT PRIMARY KEY, "organizationId" TEXT NOT NULL, "repositoryIds" TEXT[] NOT NULL,
 "options" JSONB NOT NULL, "generation" INTEGER NOT NULL DEFAULT 0,
 "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastPreparedAt" TIMESTAMP(3)
);
CREATE INDEX "FindingIndexTarget_nextRunAt_idx" ON "FindingIndexTarget"("nextRunAt");
CREATE INDEX "FindingIndexTarget_organizationId_idx" ON "FindingIndexTarget"("organizationId");
-- Transactional enqueue: a rollback cannot publish work for an unsaved report.
-- Invalidation reaches artifact/CI changes through their existing parent revision triggers.
CREATE FUNCTION preflyt_queue_finding_indexes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE repo TEXT;
BEGIN
 IF TG_OP = 'DELETE' THEN repo := OLD."repositoryId"; ELSE repo := NEW."repositoryId"; END IF;
 UPDATE "FindingIndexTarget" SET "nextRunAt"=CURRENT_TIMESTAMP, generation=generation+1
 WHERE "repositoryIds" @> ARRAY[repo];
 RETURN NULL;
END $$;
CREATE TRIGGER preflyt_queue_ci_index AFTER INSERT OR UPDATE OR DELETE ON "CommitAssessment" FOR EACH ROW EXECUTE FUNCTION preflyt_queue_finding_indexes();
CREATE TRIGGER preflyt_queue_health_index AFTER INSERT OR UPDATE OR DELETE ON "RepositoryHealthAssessment" FOR EACH ROW EXECUTE FUNCTION preflyt_queue_finding_indexes();
CREATE TRIGGER preflyt_queue_ai_index AFTER INSERT OR UPDATE OR DELETE ON "AiSkillReview" FOR EACH ROW EXECUTE FUNCTION preflyt_queue_finding_indexes();
