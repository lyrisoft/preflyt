import { expect, it } from "vitest";
import { strixReport } from "../src/health/strix-report.js";
import { healthTimeline } from "../src/health/health-report.js";
import { overallHealth } from "../src/health/health-overall.js";
import type { NativeSourceBundle } from "../src/execution/native-source.js";
const source = {
  sourceHash: "a".repeat(64),
  files: [
    {
      path: "routes/payments.ts",
      content: Buffer.from('router.post("/pay", pay)\n').toString("base64"),
    },
  ],
} as NativeSourceBundle;
const row = {
  title: "Missing authorization",
  severity: "high",
  cwe: "CWE-862",
  impact: "Another merchant can request a payout.",
  remediation_steps: "Check merchant ownership.",
  code_locations: [{ file: "routes/payments.ts", start_line: 1, end_line: 1 }],
};
const result = {
  version: 1 as const,
  assessmentId: "fixture",
  sourceHash: source.sourceHash,
  state: "COMPLETED" as const,
  toolVersion: "1.7.0",
  cleanupConfirmed: true,
  exitCode: 2,
  findings: [row],
};
it("retains source-linked suggestions without upgrading them to verified vulnerabilities or repository health failures", () => {
  const report = strixReport(result, source, 0);
  expect(report.findings[0]).toMatchObject({
    evidence: "AI_REPORTED",
    severity: "high",
    path: "routes/payments.ts",
    line: 1,
  });
  expect(report.completeness).toBe("PARTIAL");
  expect(overallHealth(report, "COMPLETED").status).toBe("INCOMPLETE");
});
it("never interprets zero findings or a completed model review as a complete security scan", () => {
  const report = strixReport(
    { ...result, exitCode: 0, findings: [] },
    source,
    3,
  );
  expect(report.analyses[0].state).toBe("INCOMPLETE");
  expect(report.limits.join(" ")).toContain("3 source entries");
});
it("rejects changed source and tool identity", () => {
  expect(() =>
    strixReport({ ...result, sourceHash: "b".repeat(64) }, source, 0),
  ).toThrow();
  expect(() =>
    strixReport({ ...result, toolVersion: "1.2.0" }, source, 0),
  ).toThrow();
});
it("rejects synthetic, traversing and out-of-range source claims but retains genuine locationless findings", () => {
  const report = strixReport(
    {
      ...result,
      findings: [
        row,
        { ...row, code_locations: [{ file: "SECURITY.md", start_line: 1 }] },
        { ...row, code_locations: [{ file: "../secrets", start_line: 1 }] },
        {
          ...row,
          code_locations: [{ file: "routes/payments.ts", start_line: 999 }],
        },
        { ...row, title: "Endpoint access risk", code_locations: [] },
      ],
    },
    source,
    0,
  );
  expect(report.findings).toHaveLength(2);
  expect(report.findings[1]).toMatchObject({ path: null, line: null });
  expect(report.limits.join(" ")).toContain("3 findings");
});
it("redacts credential-bearing text, deduplicates findings and does not imply source modifications were a valid reproduction", () => {
  const report = strixReport(
    {
      ...result,
      sourceModified: true,
      findings: [
        row,
        row,
        { ...row, title: "secret = secret-placeholder-value" },
      ],
    },
    source,
    0,
  );
  expect(report.findings).toHaveLength(1);
  expect(report.limits.join(" ")).toContain("disposable source copy");
});

it("retains bounded AI-reported scope and unresolved gaps without implying verified execution", () => {
  const report = strixReport(
    {
      ...result,
      coverage: {
        version: 1,
        available: true,
        truncated: false,
        entries: [
          {
            surface: "routes/payments.ts",
            riskArea: "Authorization",
            outcome: "needs_follow_up",
            evidence: "PRIVATE_LOG",
          },
        ],
        gaps: [
          {
            surface: "Payments",
            riskArea: "Concurrency",
            detail: "No local provider stub was available.",
          },
        ],
        caveats: ["The scan stopped at its budget limit."],
        complete: true,
      },
    },
    source,
    0,
  );
  expect(report.sourceReviewCoverage).toMatchObject({
    scope: "SOURCE_ONLY",
    evidence: "AI_REPORTED",
    available: true,
    entries: [
      {
        surface: "routes/payments.ts",
        riskArea: "Authorization",
        outcome: "needs_follow_up",
      },
    ],
    gaps: [{ detail: "No local provider stub was available." }],
  });
  expect(JSON.stringify(report)).not.toContain("PRIVATE_LOG");
  expect(report.completeness).toBe("PARTIAL");
  expect(report.analyses[0].state).toBe("INCOMPLETE");
});

it("keeps missing, malformed, oversized and sensitive coverage incomplete", () => {
  expect(strixReport(result, source, 0).sourceReviewCoverage?.available).toBe(
    false,
  );
  expect(
    strixReport(
      { ...result, coverage: { version: 1, available: true } },
      source,
      0,
    ).sourceReviewCoverage?.available,
  ).toBe(false);
  const report = strixReport(
    {
      ...result,
      coverage: {
        version: 1,
        available: true,
        entries: Array.from({ length: 101 }, () => ({
          surface: "routes/payments.ts",
          riskArea: "Authorization",
          outcome: "no_issue_found",
        })),
        gaps: [{ surface: "Payments", detail: "password = sensitive-value" }],
        caveats: [],
      },
    },
    source,
    0,
  );
  expect(report.sourceReviewCoverage?.entries).toHaveLength(100);
  expect(report.sourceReviewCoverage?.truncated).toBe(true);
  expect(JSON.stringify(report)).not.toContain("sensitive-value");
});

it('imports complete source-backed concerns as unverified issues with exact lines and full reasoning',()=>{
 const analysis={reasoning:'Data flow and missing ownership control. '.repeat(100),impact:'Cross-tenant access may be possible.',remediation:'Bind the record to the authenticated tenant.',preconditions:'Authenticated route access is required.',verification_steps:'Add a cross-tenant regression test.',counterevidence:'An inherited guard still needs confirmation.'};
 const issue={...row,review_status:'NEEDS_REVIEW',source_analysis:analysis};
 const report=strixReport({...result,findings:[issue]},source,0);
 expect(report.findings[0].aiReview).toMatchObject({status:'NEEDS_REVIEW',reasoning:analysis.reasoning.trim(),remediation:analysis.remediation,verificationSteps:analysis.verification_steps});
 expect(report.findings[0]).toMatchObject({path:'routes/payments.ts',line:1,endLine:1,evidence:'AI_REPORTED'});
 for(const broken of [{...issue,code_locations:[]},{...issue,source_analysis:{...analysis,reasoning:''}},{...issue,source_analysis:{...analysis,remediation:'x'.repeat(8001)}}]) expect(strixReport({...result,findings:[broken]},source,0).findings).toHaveLength(0);
 expect(overallHealth(report,'COMPLETED').status).toBe('INCOMPLETE');
});

it('charts completed security-only AI reviews including recorded zero issues without inventing comparable coverage',()=>{
 const report=strixReport({...result,findings:[]},source,0);
 const point=(id:string,value:any=report)=>({id,state:'COMPLETED',sourceSha:'a'.repeat(40),finishedAt:new Date(0),report:value});
 expect(healthTimeline(report,[point('zero'),point('one',strixReport(result,source,0))]).map(p=>[p.id,p.findings,p.comparableFindings])).toEqual([['one',1,null],['zero',0,null]]);
});
