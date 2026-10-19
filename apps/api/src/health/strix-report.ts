import { digest } from "../assessments/assessment-digest.js";
import {
  safeSourcePath,
  type NativeSourceBundle,
} from "../execution/native-source.js";
import type {
  HealthFinding,
  HealthReport,
  VaptAnalysis,
  SourceReviewCoverage,
} from "./health-report.js";

export const STRIX_CHECK = "security.strix";
export const strixScope =
  "Optional Strix AI review of authentication, authorization, payment logic, concurrency and exposed data at this commit. Findings are suggestions until independently verified; complete vulnerability coverage is not established.";
const clean = (v: unknown, limit: number) =>
  typeof v === "string" &&
  !/-----BEGIN|Bearer\s|(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{8,}|(?:api[_ -]?key|password|secret|token)\s*[:=]/i.test(
    v,
  )
    ? v
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .trim()
        .slice(0, limit)
    : "";
export type StrixResult = {
  version: 1;
  assessmentId: string;
  sourceHash: string;
  state: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  toolVersion: string;
  exitCode?: number;
  cleanupConfirmed: boolean;
  sourceModified?: boolean;
  findings?: unknown[];
  coverage?: unknown;
  reason?: string;
};
function sourceCoverage(value: unknown): SourceReviewCoverage {
  const result: SourceReviewCoverage = {
    version: 1,
    scope: "SOURCE_ONLY",
    evidence: "AI_REPORTED",
    available: false,
    truncated: false,
    entries: [],
    gaps: [],
    caveats: [],
  };
  const raw = value as any;
  if (
    !raw ||
    raw.version !== 1 ||
    raw.available !== true ||
    !Array.isArray(raw.entries) ||
    !Array.isArray(raw.gaps) ||
    !Array.isArray(raw.caveats)
  ) {
    result.truncated = !!raw;
    result.caveats = [
      "Review coverage was not supplied in a usable format. Unreported areas remain unknown.",
    ];
    return result;
  }
  result.available = true;
  result.truncated = raw.truncated === true;
  const outcomes = [
    "reported",
    "no_issue_found",
    "ruled_out",
    "not_applicable",
    "needs_follow_up",
  ];
  for (const entry of raw.entries.slice(0, 100)) {
    const surface = clean(entry?.surface, 300),
      riskArea = clean(entry?.riskArea, 1000);
    if (surface && riskArea && outcomes.includes(entry?.outcome))
      result.entries.push({ surface, riskArea, outcome: entry.outcome });
  }
  for (const gap of raw.gaps.slice(0, 50)) {
    const detail = clean(gap?.detail, 12000);
    if (detail)
      result.gaps.push({
        surface: clean(gap?.surface, 300),
        riskArea: clean(gap?.riskArea, 1000),
        detail,
      });
  }
  result.caveats = raw.caveats
    .slice(0, 10)
    .map((v: unknown) => clean(v, 300))
    .filter(Boolean);
  if (
    result.entries.length !== raw.entries.length ||
    result.gaps.length !== raw.gaps.length ||
    result.caveats.length !== raw.caveats.length
  )
    result.truncated = true;
  return result;
}
export function strixReport(
  result: StrixResult,
  source: NativeSourceBundle,
  excludedFiles: number,
): HealthReport {
  if (
    result.version !== 1 ||
    result.sourceHash !== source.sourceHash ||
    result.toolVersion !== "1.7.0" ||
    !Array.isArray(result.findings) ||
    result.findings.length > 500
  )
    throw new Error("STRIX_REPORT_INVALID");
  const files = new Map(
    source.files.map((f) => [
      f.path,
      Buffer.from(f.content, "base64").toString("utf8").split("\n").length,
    ]),
  );
  const findings: HealthFinding[] = [];
  const seen = new Set<string>();
  let omitted = 0;
  for (const raw of result.findings) {
    const f = raw as any;
    if (!f || typeof f !== "object") {
      omitted++;
      continue;
    }
    let aiReview:VaptAnalysis|undefined
    if(f.source_analysis!==undefined) {
      const raw=f.source_analysis
      const fields={reasoning:12000,impact:4000,remediation:8000,preconditions:4000,verification_steps:4000,counterevidence:4000}
      if(f.review_status!=='NEEDS_REVIEW' || !raw || Object.entries(fields).some(([key,max])=>typeof raw[key]!=='string' || !raw[key].trim() || raw[key].length>max || !clean(raw[key],max))) {omitted++;continue}
      const text=(key:string)=>raw[key].replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim()
      aiReview={version:1,status:'NEEDS_REVIEW',reasoning:text('reasoning'),impact:text('impact'),remediation:text('remediation'),preconditions:text('preconditions'),verificationSteps:text('verification_steps'),counterevidence:text('counterevidence')}
    }
    const title = clean(f.title, 200),
      advice = clean(f.remediation_steps, 500),
      impact = clean(f.impact, 500);
    if (
      !title ||
      !["critical", "high", "medium", "low", "info"].includes(f.severity)
    ) {
      omitted++;
      continue;
    }
    const loc = Array.isArray(f.code_locations)
      ? f.code_locations[0]
      : undefined;
    // Never import Strix's synthetic SECURITY.md SARIF anchor as actual source.
    const path = loc?.file,
      line = loc?.start_line,
      endLine = loc?.end_line ?? line;
    const located =
      safeSourcePath(path) &&
      files.has(path) &&
      Number.isSafeInteger(line) &&
      line > 0 &&
      Number.isSafeInteger(endLine) &&
      endLine >= line &&
      endLine <= files.get(path)!;
    if ((loc || aiReview) && !located) {
      omitted++;
      continue;
    }
    const ruleId =
      typeof f.cwe === "string" && /^CWE-\d{1,6}$/.test(f.cwe)
        ? f.cwe
        : STRIX_CHECK;
    const fingerprint = digest({
      scanner: STRIX_CHECK,
      ruleId,
      path: located ? path : null,
      line: located ? line : null,
      title,
    });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    findings.push({
      fingerprint,
      category: "security",
      checkId: STRIX_CHECK,
      evidence: "AI_REPORTED",
      severity: f.severity === "info" ? "low" : f.severity,
      title,
      ruleId,
      path: located ? path : null,
      line: located ? line : null,
      endLine: located ? endLine : null,
      suppressed: false,
      ...(aiReview ? {aiReview} : {}),
      ...(impact || advice
        ? {
            reportGuidance: {
              version: 1,
              source: "ANALYZER_REPORT",
              ...(impact ? { explanation: impact } : {}),
              ...(advice ? { advice } : {}),
            },
          }
        : {}),
    });
  }
  return {
    sourceReviewCoverage: sourceCoverage(result.coverage),
    version: 1,
    selection: "security",
    mode: "EXECUTED",
    completeness: "PARTIAL",
    comparisonKey: "strix-advisory-v1",
    inspection: {
      complete: false,
      fileCount: source.files.length,
      languages: [],
    },
    analyses: [
      {
        id: STRIX_CHECK,
        title: "Strix security review",
        scope: strixScope,
        state: "INCOMPLETE",
        reason:
          result.state === "COMPLETED"
            ? "AI_REVIEW_REPORTED"
            : (result.reason ?? "STRIX_REVIEW_INCOMPLETE"),
        tool: result.toolVersion,
        reportHash: digest(result),
        findingsRetained: findings.length,
        findingsReported: result.findings.length,
        findingsSuppressed: 0,
      },
    ],
    findings,
    limits: [
      "Strix findings are AI suggestions, not independently verified vulnerabilities. This review does not change CI or merge evaluation.",
      "A completed review or zero suggestions does not establish complete repository security coverage.",
      ...(excludedFiles
        ? [
            `${excludedFiles} source entries were excluded from the supplied snapshot.`,
          ]
        : []),
      ...(omitted
        ? [
            `${omitted} findings with invalid or unsafe data were omitted; review coverage is incomplete.`,
          ]
        : []),
      ...(result.sourceModified
        ? [
            "Strix modified its disposable source copy. Findings have not been independently reproduced against the original commit.",
          ]
        : []),
      ...(!result.cleanupConfirmed
        ? ["Runner cleanup has not been confirmed."]
        : []),
    ],
  };
}
