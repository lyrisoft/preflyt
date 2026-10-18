-- Small globally unique revision stamps also fence deletion/recreation of a source ID.
CREATE SEQUENCE preflyt_finding_read_revision;
ALTER TABLE "CommitAssessment" ADD COLUMN "findingReadRevision" BIGINT NOT NULL DEFAULT nextval('preflyt_finding_read_revision'),
 ADD COLUMN "findingArtifactIds" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "RepositoryHealthAssessment" ADD COLUMN "findingReadRevision" BIGINT NOT NULL DEFAULT nextval('preflyt_finding_read_revision');
ALTER TABLE "AiSkillReview" ADD COLUMN "findingReadRevision" BIGINT NOT NULL DEFAULT nextval('preflyt_finding_read_revision');

CREATE FUNCTION preflyt_assessment_finding_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN NEW."findingReadRevision" := nextval('preflyt_finding_read_revision'); END IF;
 NEW."findingArtifactIds" := ARRAY(SELECT DISTINCT value #>> '{}' FROM jsonb_path_query(NEW.report,'$.observations[*].artifacts[*].id') value WHERE jsonb_typeof(value)='string');
 RETURN NEW;
END $$;
CREATE TRIGGER preflyt_assessment_finding_revision BEFORE INSERT OR UPDATE ON "CommitAssessment"
 FOR EACH ROW EXECUTE FUNCTION preflyt_assessment_finding_revision();
UPDATE "CommitAssessment" SET "findingArtifactIds"="findingArtifactIds";
CREATE INDEX "CommitAssessment_findingArtifactIds_idx" ON "CommitAssessment" USING GIN ("findingArtifactIds");

CREATE FUNCTION preflyt_finding_read_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."findingReadRevision" := nextval('preflyt_finding_read_revision'); RETURN NEW; END $$;
CREATE TRIGGER preflyt_health_finding_revision BEFORE UPDATE ON "RepositoryHealthAssessment"
 FOR EACH ROW EXECUTE FUNCTION preflyt_finding_read_revision();
CREATE TRIGGER preflyt_ai_finding_revision BEFORE UPDATE ON "AiSkillReview"
 FOR EACH ROW EXECUTE FUNCTION preflyt_finding_read_revision();

CREATE FUNCTION preflyt_artifact_finding_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ids TEXT[];
BEGIN
 IF TG_OP='INSERT' THEN ids:=ARRAY[NEW.id]; ELSIF TG_OP='DELETE' THEN ids:=ARRAY[OLD.id]; ELSE ids:=ARRAY[OLD.id,NEW.id]; END IF;
 UPDATE "CommitAssessment" SET "findingReadRevision"=nextval('preflyt_finding_read_revision')
 WHERE "findingArtifactIds" && ids;
 RETURN NULL;
END $$;
CREATE TRIGGER preflyt_artifact_finding_revision AFTER INSERT OR UPDATE OR DELETE ON "CiArtifactImport"
 FOR EACH ROW EXECUTE FUNCTION preflyt_artifact_finding_revision();
CREATE FUNCTION preflyt_evidence_finding_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE artifact TEXT;
BEGIN
 FOR artifact IN SELECT id FROM "CiArtifactImport" WHERE "deliveryId"=OLD."deliveryId" LOOP
  UPDATE "CommitAssessment" SET "findingReadRevision"=nextval('preflyt_finding_read_revision') WHERE "findingArtifactIds" @> ARRAY[artifact];
 END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER preflyt_evidence_finding_revision AFTER UPDATE OR DELETE ON "ImportedCiEvidence"
 FOR EACH ROW EXECUTE FUNCTION preflyt_evidence_finding_revision();
