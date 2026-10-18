ALTER TABLE "RepositoryPullRequest" ADD COLUMN "retentionReferencesComplete" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "PullRequestRetentionCommit" (
 "pullRequestId" TEXT NOT NULL REFERENCES "RepositoryPullRequest"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "repositoryId" TEXT NOT NULL, "sourceSha" TEXT NOT NULL,
 PRIMARY KEY ("pullRequestId","sourceSha")
);
CREATE INDEX "PullRequestRetentionCommit_repositoryId_sourceSha_idx" ON "PullRequestRetentionCommit"("repositoryId","sourceSha");
CREATE INDEX "RepositoryPullRequest_retention_incomplete_idx" ON "RepositoryPullRequest"("repositoryId")
 WHERE NOT "retentionReferencesComplete" AND NOT COALESCE((context->>'state') IN ('closed','CLOSED'),false);

-- Preserve every case-sensitive 40-hex substring the former LIKE scan protected,
-- including SHA windows inside longer hex strings. Unbounded/unknown contexts
-- conservatively prevent deletion for the repository instead of dropping links.
CREATE FUNCTION preflyt_refresh_pr_retention() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tokens TEXT[]; token TEXT; refs TEXT[]; complete BOOLEAN := false;
BEGIN
 DELETE FROM "PullRequestRetentionCommit" WHERE "pullRequestId"=NEW.id;
 IF octet_length(NEW.context::text)<=262144 THEN
  SELECT array_agg(match[1]) INTO tokens FROM regexp_matches(NEW.context::text,'[0-9a-fA-F]{40,}','g') match;
  IF COALESCE((SELECT SUM(length(value)) FROM unnest(tokens) value),0)<=8192 THEN
   SELECT array_agg(DISTINCT substring(value FROM position FOR 40)) INTO refs
    FROM unnest(tokens) value CROSS JOIN LATERAL generate_series(1,length(value)-39) position;
   IF COALESCE(cardinality(refs),0)<=2048 THEN
    INSERT INTO "PullRequestRetentionCommit" ("pullRequestId","repositoryId","sourceSha")
     SELECT NEW.id,NEW."repositoryId",value FROM unnest(refs) value;
    complete := true;
   END IF;
  END IF;
 END IF;
 UPDATE "RepositoryPullRequest" SET "retentionReferencesComplete"=complete WHERE id=NEW.id;
 RETURN NULL;
END $$;
CREATE TRIGGER preflyt_pr_retention AFTER INSERT OR UPDATE OF context,"repositoryId" ON "RepositoryPullRequest"
 FOR EACH ROW EXECUTE FUNCTION preflyt_refresh_pr_retention();
-- Existing PRs acquire the same index atomically with each row update.
UPDATE "RepositoryPullRequest" SET context=context;
