import { afterAll, beforeAll, expect, it } from "vitest";
import { disposableDatabase } from "./disposable-database.js";
import {
  healthRemediation,
  remediationPlan,
} from "../src/health/health-remediation.js";
import {
  healthTimeline,
  type HealthReport,
} from "../src/health/health-report.js";

let fixture: Awaited<ReturnType<typeof disposableDatabase>>;
beforeAll(async () => {
  fixture = await disposableDatabase("remediation");
});
afterAll(async () => {
  await fixture?.close();
});
function report(
  ids: string[],
  patch: Partial<HealthReport> = {},
): HealthReport {
  return {
    version: 1,
    mode: "EXECUTED",
    completeness: "COMPLETE",
    comparisonKey: "fixed-plan",
    inspection: { complete: true, fileCount: 2, languages: ["TypeScript"] },
    limits: [],
    analyses: [
      {
        id: "security.sast",
        title: "SAST",
        state: ids.length ? "FAIL" : "PASS",
        reason: "RECORDED",
        reportHash: "a".repeat(64),
        tool: "fixture-1",
        configHash: "b".repeat(64),
        findingsRetained: ids.length,
        findingsReported: ids.length,
      },
    ],
    findings: ids.map((fingerprint) => ({
      fingerprint,
      category: "security",
      checkId: "security.sast",
      evidence: "ANALYZER_REPORTED",
      severity: "high",
      title: "Potential issue",
      path: "app.ts",
      line: 1,
      ruleId: "fixture",
      suppressed: false,
    })),
    ...patch,
  };
}
function row(
  id: string,
  value: HealthReport,
  index: number,
  state = "COMPLETED",
) {
  return {
    id,
    state,
    sourceSha: String(index).repeat(40),
    finishedAt: new Date(index * 1000),
    report: value,
  };
}
function multiReport(
  security: string[],
  reliability: string[],
  maintainability: string[],
) {
  const categories = [
    ["security", "security.sast", security],
    ["reliability", "quality.reliability", reliability],
    ["maintainability", "quality.maintainability", maintainability],
  ] as const;
  return report([], {
    analyses: categories.map(([, checkId, ids]) => ({
      ...report([...ids]).analyses[0],
      id: checkId,
    })),
    findings: categories.flatMap(([category, checkId, ids]) =>
      report([...ids]).findings.map((f) => ({ ...f, category, checkId })),
    ),
  });
}
it("compares with the last complete baseline across partial runs and requires equivalent scope", () => {
  const complete = report(["one", "two"]),
    records = [
      row("baseline", complete, 1),
      row("partial", report([], { completeness: "PARTIAL" }), 2),
      row("fixed", report(["two", "three"]), 3),
      row("changed", report([], { comparisonKey: "other-rules" }), 4),
      row("after-change", report([], { comparisonKey: "other-rules" }), 5),
    ];
  const plans = remediationPlan(
    healthTimeline(complete, records),
    records,
  ).filter((p) => p.category === "security");
  expect(
    plans.map((p) => [
      p.id,
      p.remediation.status,
      p.remediation.previousAssessmentId,
    ]),
  ).toEqual([
    ["baseline", "BASELINE", undefined],
    ["partial", "PARTIAL", undefined],
    ["fixed", "COMPARED", "baseline"],
    ["changed", "SCOPE_CHANGED", undefined],
    ["after-change", "COMPARED", "changed"],
  ]);
});
it("never credits truncated, suppressed, incomplete inspection or AI-only scans with fixes", () => {
  const complete = report(["one"]),
    invalid = [
      report([], {
        inspection: { complete: false, fileCount: 1, languages: [] },
      }),
      report([], {
        analyses: [{ ...complete.analyses[0], state: "INCOMPLETE" }],
      }),
      report([], {
        analyses: [{ ...complete.analyses[0], findingsSuppressed: 1 }],
      }),
      report([], {
        analyses: [
          { ...complete.analyses[0], findingsRetained: 0, findingsReported: 2 },
        ],
      }),
      report([], {
        analyses: [{ ...complete.analyses[0], configHash: undefined }],
      }),
    ];
  for (const bad of invalid) {
    const records = [row("first", complete, 1), row("bad", bad, 2)];
    expect(
      remediationPlan(healthTimeline(complete, records), records).at(-1)
        ?.remediation,
    ).toEqual({ status: "PARTIAL" });
  }
  const ai = report(["ai"], {
    completeness: "PARTIAL",
    analyses: [{ ...complete.analyses[0], id: "security.strix" }],
  });
  const records = [row("first", complete, 1), row("ai", ai, 2)];
  expect(
    remediationPlan(healthTimeline(complete, records), records).at(-1)
      ?.remediation,
  ).toEqual({ status: "AI_REVIEW" });
});
it("calculates independent category identities in PostgreSQL, including zero and organization isolation", async () => {
  const db = fixture.prisma;
  const org = await db.organization.create({
    data: { name: "Remediation fixture" },
  });
  const actor = await db.identity.create({
    data: { issuer: "fixture", subject: "remediation-owner" },
  });
  await db.gitHubInstallation.create({
    data: {
      id: 99n,
      organizationId: org.id,
      connectedById: actor.id,
      accountLogin: "fixture",
      accountType: "Organization",
      repositorySelection: "selected",
      permissions: {},
    },
  });
  const repo = await db.gitHubRepository.create({
    data: {
      githubId: 999n,
      installationId: 99n,
      ownerLogin: "fixture",
      name: "repo",
      fullName: "fixture/repo",
      isPrivate: true,
      selected: true,
    },
  });
  const reports = [
    multiReport(["a", "b", "c"], ["rel-a", "rel-b"], ["maint-a"]),
    { ...multiReport([], [], []), completeness: "PARTIAL" as const },
    multiReport(["b", "new"], ["rel-b"], []),
    multiReport([], [], []),
  ];
  const records = [];
  for (const [index, value] of reports.entries()) {
    const saved = await db.repositoryHealthAssessment.create({
      data: {
        organizationId: org.id,
        repositoryId: repo.id,
        actorId: actor.id,
        branch: "main",
        targetRevision: 1,
        requestKey: "fixture-" + index,
        state: "COMPLETED",
        sourceSha: String(index).repeat(40),
        finishedAt: new Date(index * 1000),
        report: JSON.parse(JSON.stringify(value)),
      },
    });
    records.push({ ...saved, report: value });
  }
  const points = healthTimeline(reports[3], records);
  const result = await healthRemediation(db, org.id, points, records);
  expect(result.map((p) => p.categories.security?.findings)).toEqual([
    3, 0, 2, 0,
  ]);
  expect(result[1].categories.security?.remediation).toEqual({
    status: "PARTIAL",
  });
  expect(result[2].categories.security?.remediation).toMatchObject({
    status: "COMPARED",
    introduced: 1,
    noLongerReported: 2,
    remaining: 2,
    previousAssessmentId: records[0].id,
  });
  expect(result[3].categories.security?.remediation).toMatchObject({
    status: "COMPARED",
    introduced: 0,
    noLongerReported: 2,
    remaining: 0,
  });
  expect(result[2].categories.reliability?.remediation).toMatchObject({
    status: "COMPARED",
    introduced: 0,
    noLongerReported: 1,
    remaining: 1,
  });
  expect(result[2].categories.maintainability?.remediation).toMatchObject({
    status: "COMPARED",
    introduced: 0,
    noLongerReported: 1,
    remaining: 0,
  });
  for (const category of ["security", "reliability", "maintainability"]) {
    expect(result[1].categories[category]?.remediation).toEqual({
      status: "PARTIAL",
    });
    expect(result[3].categories[category]?.remediation).toMatchObject({
      status: "COMPARED",
      remaining: 0,
    });
  }
  const outsider = await healthRemediation(db, "other-org", points, records);
  expect(outsider[2].categories.security?.remediation).toEqual({
    status: "PARTIAL",
  });
  await db.repositoryHealthAssessment.update({
    where: { id: records[3].id },
    data: { branch: "other-branch" },
  });
  const otherBranch = await healthRemediation(db, org.id, points, records);
  expect(otherBranch[3].categories.security?.remediation).toEqual({
    status: "PARTIAL",
  });
});
