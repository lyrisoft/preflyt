import { expect, it } from "vitest";
import { securityFindingsSummary } from "../src/health/security-findings-summary.js";
import type { HealthReport } from "../src/health/health-report.js";
const saved = (
  id: string,
  checkId: string,
  count: number,
  complete = true,
) => ({
  id,
  finishedAt: new Date("2026-10-19T00:00:00Z"),
  report: {
    mode: "EXECUTED",
    completeness: complete ? "COMPLETE" : "PARTIAL",
    analyses: [
      {
        id: checkId,
        state: complete ? "FAIL" : "UNAVAILABLE",
        findingsReported: count,
        findingsRetained: count,
      },
    ],
    findings: [],
    findingSummary: {
      total: count,
      groups: [{ category: "security", checkId, count }],
    },
  } as unknown as HealthReport,
});
it("adds scanner and AI summary counts without requiring full finding bodies", () => {
  const scanner = saved("scanner", "security.sast", 230),
    ai = saved("ai", "security.strix", 1);
  expect(securityFindingsSummary(scanner, ai)).toMatchObject({
    value: "231",
    standardFindings: 230,
    aiFindings: 1,
    assessmentIds: ["scanner", "ai"],
  });
  expect(scanner.report.findingSummary?.total).toBe(230);
});
it("preserves partial and unavailable evidence instead of reporting a clean zero", () => {
  expect(
    securityFindingsSummary(
      saved("scanner", "security.sast", 230, false),
      saved("ai", "security.strix", 1),
    ),
  ).toMatchObject({ value: "≥231" });
  expect(
    securityFindingsSummary(undefined, saved("ai", "security.strix", 1)),
  ).toMatchObject({ value: "≥1" });
  expect(
    securityFindingsSummary(undefined, saved("ai", "security.strix", 0)),
  ).toMatchObject({ value: "Unavailable" });
  expect(securityFindingsSummary(undefined, undefined)).toBeNull();
});
it("links a combined report only once and counts each analysis once", () => {
  const combined = saved("both", "security.sast", 2);
  combined.report.findingSummary!.groups.push({
    category: "security",
    checkId: "security.strix",
    count: 1,
  });
  expect(securityFindingsSummary(combined, combined)).toMatchObject({
    value: "3",
    assessmentIds: ["both"],
  });
});
