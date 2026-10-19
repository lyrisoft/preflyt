import "reflect-metadata";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { disposableDatabase } from "./disposable-database.js";
import { FindingsService } from "../src/findings/findings.service.js";
import { AuthorizationService } from "../src/auth/authorization.service.js";
import { digest } from "../src/assessments/assessment-digest.js";
let fixture: Awaited<ReturnType<typeof disposableDatabase>>,
  service: FindingsService,
  session: any;
const sha = "a".repeat(40);
beforeAll(async () => {
  fixture = await disposableDatabase("projection");
});
afterAll(async () => {
  await fixture.close();
});
beforeEach(async () => {
  await fixture.reset();
  const db = fixture.prisma;
  await db.organization.create({ data: { id: "org", name: "Fixture" } });
  await db.identity.create({
    data: { id: "owner", issuer: "fixture", subject: "owner" },
  });
  await db.organizationMembership.create({
    data: { organizationId: "org", identityId: "owner", role: "OWNER" },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 1n,
      organizationId: "org",
      connectedById: "owner",
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "all",
      permissions: {},
    },
  });
  await db.gitHubRepository.create({
    data: {
      id: "repo",
      githubId: 51n,
      installationId: 1n,
      name: "repo",
      fullName: "fixture/repo",
      ownerLogin: "fixture",
      isPrivate: true,
      selected: true,
    },
  });
  session = {
    authenticated: true,
    organizationId: "org",
    identityId: "owner",
    subject: "owner",
    role: "OWNER",
    email: null,
  };
  service = new FindingsService(db, new AuthorizationService(db), {} as any);
});
async function health() {
  return fixture.prisma.repositoryHealthAssessment.create({
    data: {
      id: "00000000-0000-4000-8000-000000000001",
      repositoryId: "repo",
      organizationId: "org",
      branch: "main",
      targetRevision: 1,
      requestKey: "scan",
      actorId: "owner",
      state: "COMPLETED",
      sourceSha: sha,
      report: {
        completeness: "COMPLETE",
        findings: [
          {
            fingerprint: "f".repeat(64),
            ruleId: "duplicates",
            title: "Repeated code",
            category: "duplication",
            severity: "low",
            path: "src/a.ts",
            line: 4,
            evidence: "ANALYZER_REPORTED",
          },
        ],
      },
    },
  });
}
it("filters VAPT findings on the server before summaries and pagination", async () => {
  const saved = await health();
  await ci();
  const report = saved.report as any;
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: saved.id },
    data: {
      report: {
        ...report,
        findings: [
          ...report.findings,
          {
            ...report.findings[0],
            fingerprint: "e".repeat(64),
            evidence: "AI_REPORTED",
            category: "security",
            title: "VAPT suggestion",
          },
        ],
      },
    },
  });
  const result = await service.list(session, {
    source: "vapt",
    pageSize: "10",
  });
  expect(result.total).toBe(1);
  expect(result.summary.reportedIssues).toBe(1);
  expect(result.rows.map((row) => row.title)).toEqual(["VAPT suggestion"]);
  expect(result.rows[0].status).toBe("Needs review");
  expect((await service.list(session, { source: "all" })).total).toBe(3);
});
async function ci() {
  const db = fixture.prisma,
    content =
      '<testsuite><testcase name="Fixture test"><failure>failed</failure></testcase></testsuite>',
    sha256 = createHash("sha256").update(content).digest("hex");
  await db.gitHubWebhookDelivery.create({
    data: {
      id: "delivery",
      event: "check_run",
      action: "completed",
      payloadHash: "fixture",
      installationId: 1n,
      repositoryGithubId: 51n,
      sourceSha: sha,
      sourceObjectId: "1",
    },
  });
  await db.importedCiEvidence.create({
    data: {
      deliveryId: "delivery",
      repositoryGithubId: 51n,
      installationId: 1n,
      sourceSha: sha,
      sourceKind: "CHECK_RUN",
      sourceObjectId: "1",
      sourceAction: "completed",
      result: "FAILED",
      sourcePayloadHash: "fixture",
      evidenceHash: "fixture",
      observedAt: new Date(),
    },
  });
  await db.ciArtifactImport.create({
    data: {
      id: "artifact",
      deliveryId: "delivery",
      format: "junit",
      sha256,
      content: Buffer.from(content),
      summary: {},
      uploadedById: "owner",
    },
  });
  const request = { subjectKind: "PULL_REQUEST", pullRequest: { number: 1 } },
    plan = { checks: [] },
    report = {
      observations: [
        { deliveryId: "delivery", artifacts: [{ id: "artifact", sha256 }] },
      ],
    };
  return db.commitAssessment.create({
    data: {
      id: "ci",
      repositoryId: "repo",
      sourceSha: sha,
      selectionId: "s",
      requestKey: "ci",
      inputHash: "fixture",
      request,
      plan,
      report,
      assessmentHash: digest({ request, plan, report }),
    },
  });
}
it("reuses normalized rows across pagination/filter changes, refreshes ignores and report edits, and never caches access", async () => {
  const db = fixture.prisma;
  await health();
  const reports = vi.spyOn(
    FindingsService.prototype as any,
    "collectCandidates",
  );
  try {
    const first = await service.list(session, {
      source: "health",
      pageSize: "10",
    });
    expect(first.rows[0].title).toBe("Repeated code");
    await service.list(session, {
      source: "health",
      q: "code",
      page: "2",
      pageSize: "10",
    });
    expect(reports).toHaveBeenCalledTimes(1);
    await service.setIgnore(
      session,
      "f".repeat(64),
      {
        origin: "health",
        repository: "51",
        assessment: "00000000-0000-4000-8000-000000000001",
      },
      { state: "IGNORED", reason: "Intentional", expectedRevision: 0 },
    );
    const ignored = await service.list(session, {
      source: "health",
      triage: "IGNORED",
    });
    expect(ignored.rows[0].status).toBe("Ignored");
    expect(ignored.summary.reportedIssues).toBe(0);
    await db.repositoryHealthAssessment.update({
      where: { id: "00000000-0000-4000-8000-000000000001" },
      data: { report: { completeness: "COMPLETE", findings: [] } },
    });
    expect((await service.list(session, { source: "health" })).rows).toEqual(
      [],
    );
    expect(reports).toHaveBeenCalledTimes(2);
    await db.organizationMembership.updateMany({ data: { active: false } });
    await expect(service.list(session, { source: "health" })).rejects.toThrow();
  } finally {
    reports.mockRestore();
  }
});
it("invalidates artifact bytes, imported evidence and assessment integrity before returning a cached CI finding", async () => {
  const db = fixture.prisma,
    assessment = await ci();
  expect((await service.list(session, { source: "ci" })).rows[0].title).toBe(
    "Fixture test",
  );
  await db.importedCiEvidence.update({
    where: { deliveryId: "delivery" },
    data: { sourceSha: "b".repeat(40) },
  });
  await expect(service.list(session, { source: "ci" })).rejects.toThrow(
    "scope or integrity",
  );
  await db.importedCiEvidence.update({
    where: { deliveryId: "delivery" },
    data: { sourceSha: sha },
  });
  expect((await service.list(session, { source: "ci" })).total).toBe(1);
  await db.ciArtifactImport.update({
    where: { id: "artifact" },
    data: { content: Buffer.from("tampered") },
  });
  await expect(service.list(session, { source: "ci" })).rejects.toThrow();
  await db.commitAssessment.update({
    where: { id: assessment.id },
    data: { report: { observations: [] } },
  });
  await expect(service.list(session, { source: "ci" })).rejects.toThrow(
    "integrity",
  );
});
it("invalidates missing/removed artifacts and never reuses a projection after source ID deletion and recreation", async () => {
  const db = fixture.prisma;
  await ci();
  expect((await service.list(session, { source: "ci" })).total).toBe(1);
  const artifact = await db.ciArtifactImport.findUniqueOrThrow({
    where: { id: "artifact" },
  });
  await db.ciArtifactImport.delete({ where: { id: "artifact" } });
  expect((await service.list(session, { source: "ci" })).rows).toEqual([]);
  await db.ciArtifactImport.create({ data: artifact });
  expect((await service.list(session, { source: "ci" })).total).toBe(1);
  await health();
  expect((await service.list(session, { source: "health" })).total).toBe(1);
  await db.repositoryHealthAssessment.delete({
    where: { id: "00000000-0000-4000-8000-000000000001" },
  });
  await health();
  await db.repositoryHealthAssessment.update({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    data: { report: { completeness: "COMPLETE", findings: [] } },
  });
  expect((await service.list(session, { source: "health" })).total).toBe(0);
});
it("invalidates advisory reviews when either their result or the bound assessment changes", async () => {
  const db = fixture.prisma,
    assessment = await ci();
  const context = {
    assessmentHash: assessment.assessmentHash,
    sourceSha: sha,
    evidence: [],
    source: {
      lines: [
        {
          ref: "diff:1",
          path: "src/a.ts",
          line: 1,
          side: "RIGHT",
          text: "fixture",
        },
      ],
    },
  };
  const snapshot = { context, checks: [{ id: "review", title: "Review" }] };
  await db.aiSkillReview.create({
    data: {
      id: "ai",
      organizationId: "org",
      repositoryId: "repo",
      assessmentId: assessment.id,
      actorId: "owner",
      stage: "pull_request",
      state: "SUCCEEDED",
      reservedMicroCents: 0n,
      snapshot,
      fingerprint: digest(snapshot),
      result: {
        context: { assessmentHash: context.assessmentHash, sourceSha: sha },
        findings: [
          {
            checkId: "review",
            summary: "Check retry handling",
            recommendation: "Retain pending work.",
            evidenceRefs: ["diff:1"],
          },
        ],
      },
    },
  });
  expect((await service.list(session, { source: "ai" })).total).toBe(1);
  await db.aiSkillReview.update({
    where: { id: "ai" },
    data: { feedbackState: "PUBLISHED" },
  });
  expect(
    (await service.list(session, { source: "ai" })).rows[0].feedbackState,
  ).toBe("PUBLISHED");
  await db.commitAssessment.update({
    where: { id: "ci" },
    data: { assessmentHash: "tampered" },
  });
  expect((await service.list(session, { source: "ai" })).total).toBe(0);
});
it("shares concurrent cold normalization without sharing mutable triage rows", async () => {
  await health();
  const collect = vi.spyOn(
    FindingsService.prototype as any,
    "collectCandidates",
  );
  try {
    const [a, b] = await Promise.all([
      service.list(session, { source: "health" }),
      service.list(session, { source: "health" }),
    ]);
    expect(collect).toHaveBeenCalledOnce();
    a.rows[0].title = "Local mutation";
    expect(b.rows[0].title).toBe("Repeated code");
  } finally {
    collect.mockRestore();
  }
});
it("retries a dependency change between the revision read and parent lock instead of serving a stale cache", async () => {
  const db = fixture.prisma;
  await ci();
  let armed = false;
  const wrapper = new Proxy(db, {
    get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (read: any, options: any) =>
        target.$transaction(
          async (tx) =>
            read(
              new Proxy(tx, {
                get(reader, property) {
                  if (property !== "$queryRaw")
                    return Reflect.get(reader, property);
                  return async (query: any) => {
                    const result = await reader.$queryRaw(query);
                    if (
                      armed &&
                      query.sql.includes(
                        'SELECT id,"findingReadRevision" FROM "CommitAssessment"',
                      )
                    ) {
                      armed = false;
                      await db.ciArtifactImport.update({
                        where: { id: "artifact" },
                        data: { content: Buffer.from("changed during read") },
                      });
                    }
                    return result;
                  };
                },
              }),
            ),
          options,
        );
    },
  });
  const reader = new FindingsService(
    wrapper as any,
    new AuthorizationService(db),
    {} as any,
  );
  expect((await reader.list(session, { source: "ci" })).total).toBe(1);
  const collect = vi.spyOn(
    FindingsService.prototype as any,
    "collectCandidates",
  );
  try {
    armed = true;
    await expect(reader.list(session, { source: "ci" })).rejects.toThrow();
    expect(collect).toHaveBeenCalledOnce();
  } finally {
    collect.mockRestore();
  }
});

it("persists SQL pages and filtered summaries across service restarts without loading reports", async () => {
  const saved = await health();
  const base = (saved.report as any).findings[0];
  await fixture.prisma.repositoryHealthAssessment.update({
    where: { id: saved.id },
    data: {
      report: {
        completeness: "COMPLETE",
        findings: Array.from({ length: 25 }, (_, n) => ({
          ...base,
          fingerprint: String(n).padStart(64, "0"),
          title: `Issue ${n}`,
          severity: n < 12 ? "high" : "low",
          guidance: { explanation: "Detail-only reasoning" },
          aiReview: { reasoning: "Detail-only AI" },
        })),
      },
    },
  });
  const first = await service.list(session, {
    source: "health",
    pageSize: "10",
  });
  expect(first.total).toBe(25);
  expect(first.rows).toHaveLength(10);
  const collect = vi.spyOn(
    FindingsService.prototype as any,
    "collectCandidates",
  );
  const reader = new FindingsService(
    fixture.prisma,
    new AuthorizationService(fixture.prisma),
    {} as any,
  );
  try {
    const second = await reader.list(session, {
      source: "health",
      page: "2",
      pageSize: "10",
    });
    expect(second.rows).toHaveLength(10);
    expect(
      second.rows.every((row) => !first.rows.some((r) => r.id === row.id)),
    ).toBe(true);
    const high = await reader.list(session, {
      source: "health",
      severity: "high",
    });
    expect(high.total).toBe(12);
    expect(high.summary.criticalHigh).toBe(12);
    expect(high.rows.every((row) => row.severity === "high")).toBe(true);
    expect(collect).not.toHaveBeenCalled();
    expect(await fixture.prisma.findingIndexSnapshot.count()).toBe(1);
    expect(await fixture.prisma.findingIndexSummary.count()).toBe(2);
    const persisted = await fixture.prisma.findingIndexRow.findFirstOrThrow();
    expect(persisted.data).not.toHaveProperty("guidance");
    expect(persisted.data).not.toHaveProperty("aiReview");
  } finally {
    collect.mockRestore();
  }
});

it("invalidates saved summaries on ignore updates and expiry without rebuilding source rows", async () => {
  await health();
  const before = await service.list(session, { source: "health" });
  expect(before.summary.reportedIssues).toBe(1);
  await service.setIgnore(
    session,
    "f".repeat(64),
    {
      origin: "health",
      repository: "51",
      assessment: "00000000-0000-4000-8000-000000000001",
    },
    {
      state: "IGNORED",
      reason: "Temporary",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      expectedRevision: 0,
    },
  );
  const ignored = await service.list(session, { source: "health" });
  expect(ignored.summary).toMatchObject({ reportedIssues: 0, ignored: 1 });
  expect(ignored.rows[0].status).toBe("Ignored");
  await fixture.prisma.findingIgnore.updateMany({
    data: { expiresAt: new Date(Date.now() - 1) },
  });
  const expired = await service.list(session, { source: "health" });
  expect(expired.summary).toMatchObject({ reportedIssues: 1, ignored: 0 });
  expect(expired.rows[0].ignore.expired).toBe(true);
  expect(await fixture.prisma.findingIndexSnapshot.count()).toBe(1);
});

it('opens both exact saved security reports with AI issues marked Needs review and rejects mismatched revisions', async () => {
 const saved=await health(),db=fixture.prisma,base=saved.report as any;
 const finding={...base.findings[0],category:'security',checkId:'security.sast',title:'Scanner issue'};
 await db.repositoryHealthAssessment.update({where:{id:saved.id},data:{report:{...base,analyses:[{id:'security.sast'}],findings:[finding]}}});
 const ai=await db.repositoryHealthAssessment.create({data:{...saved,id:'00000000-0000-4000-8000-000000000002',requestKey:'ai',report:{...base,analyses:[{id:'security.strix'}],findings:[{...finding,fingerprint:'e'.repeat(64),checkId:'security.strix',evidence:'AI_REPORTED',title:'AI issue'}]}}});
 const query={source:'health',repository:'51',category:'security',healthReports:saved.id+','+ai.id};
 const result=await service.list(session,query);
 expect(result.total).toBe(2);
 expect(result.summary.reportedIssues).toBe(2);
 expect(result.rows.find(r=>r.title==='AI issue')?.status).toBe('Needs review');
 expect(new Set(result.rows.map(r=>r.assessmentId))).toEqual(new Set([saved.id,ai.id]));
 await db.repositoryHealthAssessment.update({where:{id:ai.id},data:{sourceSha:'b'.repeat(40)}});
 await expect(service.list(session,query)).rejects.toThrow('same branch and commit');
 await db.repositoryHealthAssessment.update({where:{id:ai.id},data:{sourceSha:sha,branch:'other'}});
 await expect(service.list(session,query)).rejects.toThrow('same branch and commit');
 await expect(service.list(session,{...query,healthReports:saved.id+',00000000-0000-4000-8000-000000000003'})).rejects.toThrow('unavailable in your scope');
});

it('prepares first-use source filters and summaries in the background, then refreshes after a saved report changes', async()=>{
 const saved=await health();
 await ci();
 await service.preparePendingIndexes();
 const build=vi.spyOn(service as any,'collectCandidates');
 // New readers have no process cache; the durable index must still be ready.
 const reader=new FindingsService(fixture.prisma,new AuthorizationService(fixture.prisma),{} as any);
 const normalize=vi.spyOn(FindingsService.prototype as any,'collectCandidates');
 for(const source of ['all','health','vapt','ci','ai'])await reader.list(session,{source});
 expect(normalize).not.toHaveBeenCalled();
 expect(await fixture.prisma.findingIndexSummary.count()).toBeGreaterThan(0);
 normalize.mockRestore();build.mockRestore();
 const before=await fixture.prisma.findingIndexTarget.findMany();
 expect(before.every(t=>t.lastPreparedAt)).toBe(true);
 const report=saved.report as any;
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:saved.id},data:{report:{...report,findings:[...report.findings,{...report.findings[0],fingerprint:'9'.repeat(64),title:'Newly saved issue'}]}}});
 const queued=await fixture.prisma.findingIndexTarget.findMany();
 expect(queued.every(t=>t.generation>0 && t.nextRunAt.getTime()<=Date.now())).toBe(true);
 await service.preparePendingIndexes();
 const after=vi.spyOn(FindingsService.prototype as any,'collectCandidates');
 const result=await reader.list(session,{source:'health'});
 expect(result.rows.some(r=>r.title==='Newly saved issue')).toBe(true);
 expect(after).not.toHaveBeenCalled();
 after.mockRestore();
});
it('does not use a prebuilt organization index after repository access is removed',async()=>{
 await health();await service.preparePendingIndexes();
 await fixture.prisma.gitHubRepository.update({where:{id:'repo'},data:{selected:false}});
 await expect(service.list(session,{repository:'51'})).rejects.toThrow('access');
 expect((await service.list(session,{})).rows).toEqual([]);
});
it('queues only committed changes and does not lose a change arriving during preparation',async()=>{
 const saved=await health();await service.preparePendingIndexes();
 const targets=await fixture.prisma.findingIndexTarget.findMany();
 await expect(fixture.prisma.$transaction(async tx=>{
  await tx.repositoryHealthAssessment.update({where:{id:saved.id},data:{report:{...(saved.report as any),limits:['rolled back']}}});
  throw Error('rollback');
 })).rejects.toThrow('rollback');
 expect((await fixture.prisma.findingIndexTarget.findMany()).map(t=>t.generation)).toEqual(targets.map(t=>t.generation));
 const target=targets[0];
 await fixture.prisma.repositoryHealthAssessment.update({where:{id:saved.id},data:{report:{...(saved.report as any),limits:['new report']}}});
 const cleared=await fixture.prisma.findingIndexTarget.updateMany({where:{id:target.id,generation:target.generation},data:{nextRunAt:new Date(Date.now()+300000)}});
 expect(cleared.count).toBe(0);
});
