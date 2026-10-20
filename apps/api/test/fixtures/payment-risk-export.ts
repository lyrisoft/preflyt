import { readFileSync } from "node:fs";
import type { PaymentRiskExport } from "../../src/health/payment-risk-export.js";

export function paymentExportFixture(): PaymentRiskExport {
  const id = "f".repeat(64);
  const report = JSON.parse(
    readFileSync(
      new URL(
        "../../../../tools/strix-runner/fixtures/payment-risk-v1.json",
        import.meta.url,
      ),
      "utf8",
    ).replaceAll("issue-1", id),
  );
  report.findings = [
    {
      ...report.findings[0],
      issueId: id,
      title: "Missing payout ownership check",
      classification: "FALSE_POSITIVE",
      modelClassification: "LIKELY",
      score: 20,
      severity: "critical",
      references: [{ path: "payments.py", startLine: 1, endLine: 2 }],
      reasoning: "The supplied merchant reaches the transfer.",
      impactDescription: "Another merchant may lose funds.",
      preconditions: "An authenticated caller reaches the handler.",
      counterevidence: "An inherited guard may enforce ownership.",
      remediation: "Bind the merchant to the authenticated caller.",
      review: {
        reason: "Independent guard inspection rules out this attack.",
        updatedAt: "2026-10-20T18:00:00.000Z",
      },
    },
  ];
  return {
    assessmentId: "11111111-1111-4111-8111-111111111111",
    repository: "fixture/payments",
    branch: "main",
    sourceSha: "a".repeat(40),
    report,
  };
}
