import { BadRequestException, ConflictException } from "@nestjs/common";
import { parseArtifact } from "../github-events/ci-artifact-parser.js";
import { checkReportFormat } from "./check-report-adapters.js";

type Policy = {
  id: string;
  definitionHash: string;
  repositoryId: string;
  sourceSha: string;
  headSha: string;
  signerWorkflow?: string;
  checks: { id: string; title: string; required: boolean }[];
};
const invalid = () =>
  new BadRequestException("Pipeline results are invalid or exceed limits");
/** Runner assertions are retained separately from verified assessment/gate evidence. */
export function normalizePipelineSubmission(body: unknown, policy: Policy) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw invalid();
  const input = body as Record<string, any>;
  if (Buffer.byteLength(JSON.stringify(input), "utf8") > 900000)
    throw invalid();
  if (
    input.schemaVersion !== 1 ||
    input.policyId !== policy.id ||
    input.policyHash !== policy.definitionHash ||
    input.repositoryId !== policy.repositoryId ||
    input.sourceSha !== policy.sourceSha ||
    input.headSha !== policy.headSha
  )
    throw new ConflictException(
      "Results do not match the current published policy and commit",
    );
  if (
    !Array.isArray(input.results) ||
    input.results.length > 64 ||
    !Array.isArray(input.reports) ||
    input.reports.length > 10
  )
    throw invalid();
  const ids = new Set(policy.checks.map((rule) => rule.id));
  const statuses = new Map<string, string>();
  for (const result of input.results) {
    if (
      !result ||
      !ids.has(result.ruleId) ||
      statuses.has(result.ruleId) ||
      !["passed", "failed", "incomplete"].includes(result.status)
    )
      throw invalid();
    statuses.set(result.ruleId, result.status);
  }
  const reportIds = new Set<string>();
  const reports = input.reports.map((report: any) => {
    if (
      !report ||
      !ids.has(report.ruleId) ||
      reportIds.has(report.ruleId) ||
      report.format !== checkReportFormat(report.ruleId)
    )
      throw invalid();
    reportIds.add(report.ruleId);
    const parsed = parseArtifact(report.format, report.content, report.sha256);
    if (
      report.proof !== undefined &&
      (typeof report.proof !== "string" ||
        Buffer.byteLength(report.proof) > 524288)
    )
      throw invalid();
    return {
      ruleId: report.ruleId as string,
      format: parsed.format,
      content: Buffer.from(parsed.bytes).toString("utf8"),
      sha256: parsed.sha256,
      ...(report.proof ? { proof: report.proof as string } : {}),
    };
  });
  const results = policy.checks.map((rule) => ({
    ruleId: rule.id,
    title: rule.title,
    required: rule.required,
    status: statuses.get(rule.id) ?? "incomplete",
  }));
  const required = results.filter((rule) => rule.required);
  const result = required.some((rule) => rule.status === "failed")
    ? "failed"
    : !required.length || required.some((rule) => rule.status !== "passed")
      ? "incomplete"
      : "passed";
  return {
    signerWorkflow: policy.signerWorkflow ?? "",
    schemaVersion: 1,
    policyId: policy.id,
    policyHash: policy.definitionHash,
    sourceSha: policy.headSha,
    workflowSha: policy.sourceSha,
    results,
    reports,
    result,
  };
}
