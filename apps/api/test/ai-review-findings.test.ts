import { expect, it, vi } from "vitest";
import { digest } from "../src/assessments/assessment-digest.js";
import {
  aiReviewFindingRows,
  sameReviewedPrRevision,
} from "../src/findings/ai-review-findings.js";
import { SkillReviewService } from "../src/intelligence/skill-review.service.js";
import { FindingsService } from "../src/findings/findings.service.js";

const sha = "a".repeat(40);
const pr = {
  version: 1,
  number: 101,
  state: "open",
  draft: false,
  merged: false,
  head: { repositoryId: "51", ref: "feature", sha },
  base: { repositoryId: "51", ref: "development", sha: "b".repeat(40) },
};
function fixture() {
  const assessment = {
    id: "assessment",
    repositoryId: "repo",
    sourceSha: sha,
    request: { subjectKind: "PULL_REQUEST", pullRequest: pr },
    plan: {},
    report: {},
    assessmentHash: "",
  };
  assessment.assessmentHash = digest({
    request: assessment.request,
    plan: assessment.plan,
    report: assessment.report,
  });
  const context = {
    assessmentHash: assessment.assessmentHash,
    sourceSha: sha,
    evidence: [],
    source: {
      lines: [
        {
          ref: "diff:1",
          path: "src/file.ts",
          line: 42,
          side: "RIGHT",
          text: "private changed source",
        },
      ],
    },
  };
  const snapshot = {
    context,
    checks: [{ id: "review-check", title: "PR review" }],
    providers: [{ endpoint: "private provider configuration" }],
  };
  const review = {
    id: "review",
    organizationId: "org",
    repositoryId: "repo",
    stage: "pull_request",
    assessmentId: "assessment",
    assessment,
    snapshot,
    fingerprint: digest(snapshot),
    state: "SUCCEEDED",
    feedbackState: "PUBLISHED",
    createdAt: new Date("2026-10-13T18:30:00Z"),
    finishedAt: new Date("2026-10-13T18:30:10Z"),
    result: {
      context: { assessmentHash: context.assessmentHash, sourceSha: sha },
      findings: [
        {
          checkId: "review-check",
          summary: "A retry can be lost after a worker failure.",
          recommendation: "Keep a durable retry path.",
          evidenceRefs: ["diff:1"],
        },
      ],
    },
  };
  const repo = { id: "repo", githubId: 51n, fullName: "org/project" };
  const db: any = {
    aiSkillReview: {
      findMany: vi.fn().mockResolvedValue([review]),
      findUnique: vi.fn().mockResolvedValue(review),
    },
    findingDisposition: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const access: any = {
    requireRepository: vi.fn().mockResolvedValue(repo),
    requireOrganization: vi.fn(),
    repositoryScope: vi.fn().mockResolvedValue([repo]),
  };
  const service = new FindingsService(db, access, {} as any);
  const session = { organizationId: "org", identityId: "actor" } as any;
  return { review, assessment, repo, db, access, service, session };
}
it("shows retained PR suggestions with their original assessment, date and exact cited location, without private context", () => {
  const f = fixture();
  const rows = aiReviewFindingRows(f.review, f.repo);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    origin: "ai",
    status: "AI suggestion",
    verification: "Suggestions only",
    assessmentId: "assessment",
    sourceSha: sha,
    pullRequest: 101,
    observedAt: "2026-10-13T18:30:10.000Z",
    evidenceLocations: [{ path: "src/file.ts", line: 42, side: "RIGHT" }],
  });
  expect(JSON.stringify(rows)).not.toContain("private changed source");
  expect(JSON.stringify(rows)).not.toContain("private provider configuration");
});
it("rejects changed fingerprints, assessment bindings, result commits and uncited evidence", () => {
  for (const change of [
    (r: any) => {
      r.fingerprint = "changed";
    },
    (r: any) => {
      r.assessment.assessmentHash = "changed";
    },
    (r: any) => {
      r.result.context.sourceSha = "c".repeat(40);
    },
    (r: any) => {
      r.result.findings[0].evidenceRefs = ["unavailable"];
    },
    (r: any) => {
      r.state = "UNAVAILABLE";
    },
  ]) {
    const f = fixture();
    change(f.review);
    expect(aiReviewFindingRows(f.review, f.repo)).toEqual([]);
  }
});
it("aggregates advisory finding counts and deduplicates repeated suggestions", async () => {
  const f = fixture();
  f.db.aiSkillReview.findMany.mockResolvedValue([
    f.review,
    { ...f.review, id: "duplicate" },
  ]);
  const result = await f.service.list(f.session, { source: "ai", kind: "ai" });
  expect(result.total).toBe(1);
  expect(result.aiSummary).toEqual({
    suggestions: 1,
    repositories: 1,
    pullRequests: 1,
  });
  expect(result.summary).toMatchObject({
    reportedIssues: 1,
    criticalHigh: 0,
    evidenceGaps: 0,
    chartTotal: 1,
  });
  expect(f.db.aiSkillReview.findMany.mock.calls[0][0].where).toMatchObject({
    organizationId: "org",
    repositoryId: { in: ["repo"] },
    stage: "pull_request",
    state: "SUCCEEDED",
  });
});
it("searches recommendations, PRs and locations and retains honest empty results", async () => {
  const f = fixture();
  for (const q of ["durable", "101", "src/file.ts", sha])
    expect((await f.service.list(f.session, { source: "ai", q })).total).toBe(
      1,
    );
  expect(
    (await f.service.list(f.session, { source: "ai", q: "not-matched" })).total,
  ).toBe(0);
});
it("denies unauthorized repositories and access revoked during review retrieval", async () => {
  const denied = fixture();
  await expect(
    denied.service.list(denied.session, { source: "ai", repository: "99" }),
  ).rejects.toThrow("access");
  expect(denied.db.aiSkillReview.findMany).not.toHaveBeenCalled();
  const revoked = fixture();
  revoked.access.repositoryScope
    .mockResolvedValueOnce([revoked.repo])
    .mockResolvedValueOnce([]);
  await expect(
    revoked.service.list(revoked.session, { source: "ai" }),
  ).rejects.toThrow("access changed");
});
it("associates historical reviews only with the same PR number and complete head/base revision", () => {
  const f = fixture();
  expect(
    sameReviewedPrRevision(f.assessment, {
      ...f.assessment,
      id: "new-assessment",
    }),
  ).toBe(true);
  for (const patch of [
    { number: 102 },
    { head: { ...pr.head, sha: "c".repeat(40) } },
    { base: { ...pr.base, sha: "c".repeat(40) } },
    { base: { ...pr.base, ref: "main" } },
  ]) {
    expect(
      sameReviewedPrRevision(f.assessment, {
        ...f.assessment,
        request: {
          subjectKind: "PULL_REQUEST",
          pullRequest: { ...pr, ...patch },
        },
      }),
    ).toBe(false);
  }
  expect(
    sameReviewedPrRevision(f.assessment, {
      ...f.assessment,
      request: { subjectKind: "COMMIT" },
    }),
  ).toBe(false);
});
it("opens AI finding details at the original assessment and reuses commit-bound source retrieval", async () => {
  const f = fixture();
  const row = aiReviewFindingRows(f.review, f.repo)[0];
  const reader = vi
    .fn()
    .mockResolvedValue({
      lines: [{ number: 42, text: "safe code" }],
      reason: null,
      truncated: false,
    });
  const service = new FindingsService(f.db, f.access, { read: reader } as any);
  const result = await service.detail(f.session, row.id, "assessment", "ai");
  expect(result.finding).toMatchObject({
    origin: "ai",
    path: "src/file.ts",
    line: 42,
    assessmentId: "assessment",
  });
  expect(f.db.aiSkillReview.findMany.mock.calls[0][0].where.assessmentId).toBe(
    "assessment",
  );
  const source = await service.source(f.session, row.id, "assessment", "ai");
  expect(reader).toHaveBeenCalledWith(
    "repo",
    sha,
    expect.objectContaining({ path: "src/file.ts", line: 42 }),
  );
  expect(source.lines).toEqual([{ number: 42, text: "safe code" }]);
});
it("does not relabel a left-side diff line as head-commit source, and redacts stored excerpt text", async () => {
  const f = fixture();
  const line = f.review.snapshot.context.source.lines[0];
  line.side = "LEFT";
  line.text = "password = hidden-value";
  f.review.fingerprint = digest(f.review.snapshot);
  const row = aiReviewFindingRows(f.review, f.repo)[0];
  const reader = vi.fn();
  const service = new FindingsService(f.db, f.access, { read: reader } as any);
  const source = await service.source(f.session, row.id, "assessment", "ai");
  expect(reader).not.toHaveBeenCalled();
  expect(source.lines).toEqual([
    { number: 42, text: "[Sensitive source line hidden]" },
  ]);
  expect(source.truncated).toBe(true);
  expect(JSON.stringify(source)).not.toContain("hidden-value");
});
it("honors AI triage filters without changing check metrics", async () => {
  const f = fixture();
  const row = aiReviewFindingRows(f.review, f.repo)[0];
  f.db.findingDisposition.findMany.mockResolvedValue([
    {
      id: row.id,
      sourceSha: sha,
      state: "RESOLVED",
      note: "Reviewed",
      revision: 1,
    },
  ]);
  const result = await f.service.list(f.session, {
    source: "ai",
    triage: "RESOLVED",
  });
  expect(result.rows[0].triage.state).toBe("RESOLVED");
  expect(result.summary.reportedIssues).toBe(1);
  expect(
    (await f.service.list(f.session, { source: "ai", triage: "REPORTED" }))
      .total,
  ).toBe(0);
});
it("retains model-rated impact and severity while leaving historical unrated suggestions unknown", async () => {
  const f = fixture();
  expect(aiReviewFindingRows(f.review, f.repo)[0].severity).toBe("unknown");
  const originalId = aiReviewFindingRows(f.review, f.repo)[0].id;
  Object.assign(f.review.result.findings[0], {
    severity: "low",
    impact: "This has a minor effect on review visibility.",
  });
  const row = aiReviewFindingRows(f.review, f.repo)[0];
  expect(row).toMatchObject({
    id: originalId,
    severity: "low",
    impact: "This has a minor effect on review visibility.",
  });
  expect(
    (await f.service.list(f.session, { source: "ai", severity: "low" })).total,
  ).toBe(1);
  expect(
    (await f.service.list(f.session, { source: "ai", severity: "high" })).total,
  ).toBe(0);
});

it("lists same-revision reviews on a newer assessment but rejects other base revisions and revoked access", async () => {
  const f = fixture();
  const displayed = { ...f.assessment, id: "new-assessment" };
  const original = {
    ...f.review,
    snapshot: { ...f.review.snapshot, skills: [] },
  };
  original.fingerprint = digest(original.snapshot);
  const other = {
    ...original,
    id: "other",
    assessmentId: "other-assessment",
    assessment: {
      ...f.assessment,
      request: {
        subjectKind: "PULL_REQUEST",
        pullRequest: { ...pr, base: { ...pr.base, sha: "c".repeat(40) } },
      },
    },
  };
  f.db.aiReviewSkill = { findMany: vi.fn().mockResolvedValue([]) };
  f.db.aiSkillReview.findMany.mockResolvedValue([other, original]);
  const service = new SkillReviewService(
    f.db,
    f.access,
    { get: vi.fn().mockResolvedValue(displayed) } as any,
    {} as any,
  );
  const result = await service.list(f.session, "51", displayed.id);
  expect(result.reviews).toHaveLength(1);
  expect(result.reviews[0]).toMatchObject({
    id: "review",
    assessmentId: "assessment",
    relatedAssessment: true,
    usage: null,
  });
  expect((result.reviews[0].result as any).findings[0].findingId).toBe(
    aiReviewFindingRows(f.review, f.repo)[0].id,
  );
  expect(f.db.aiSkillReview.findMany.mock.calls[0][0].where).toMatchObject({
    organizationId: "org",
    repositoryId: "repo",
  });
  f.access.requireRepository.mockRejectedValueOnce(new Error("Access revoked"));
  await expect(service.list(f.session, "51", displayed.id)).rejects.toThrow(
    "Access revoked",
  );
});

it('includes AI findings in the default list alongside CI and Health without changing saved check results', async () => {
  const f = fixture()
  f.db.commitAssessment = { findMany: vi.fn().mockResolvedValue([]) }
  f.db.repositoryHealthAssessment = { findMany: vi.fn().mockResolvedValue([]) }
  f.db.ciArtifactImport = { findMany: vi.fn().mockResolvedValue([]) }
  const before = JSON.stringify(f.assessment.report)
  const result = await f.service.list(f.session, {})
  expect(result.rows[0]).toMatchObject({ origin: 'ai', assessmentId: 'assessment' })
  expect(result.summary.reportedIssues).toBe(1)
  expect(result.assessedRevisions).toBe(1)
  expect(result.summary.byCheck).toEqual([{ name: 'PR review', count: 1 }])
  expect(JSON.stringify(f.assessment.report)).toBe(before)
  expect((await f.service.list(f.session, { source: 'ci' })).rows).toEqual([])
  expect((await f.service.list(f.session, { source: 'ai', kind: 'gaps' })).rows).toEqual([])
})
