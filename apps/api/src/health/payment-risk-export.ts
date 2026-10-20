import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import type {
  PaymentRiskReport,
  PaymentReference,
  PaymentOutcome,
} from "./payment-risk-report.js";

type ExportFinding = Omit<
  PaymentRiskReport["findings"][number],
  "classification"
> & {
  classification: string;
  modelClassification?: string;
  review?: { reason: string; updatedAt: string | Date };
};
export type PaymentRiskExport = {
  assessmentId: string;
  repository: string;
  branch: string;
  sourceSha: string;
  report: Omit<PaymentRiskReport, "findings"> & { findings: ExportFinding[] };
};
type Block = {
  kind: "title" | "heading" | "subheading" | "body" | "field";
  text: string;
  label?: string;
};
const label = (value: string) => value.replace(/_/g, " ");
const outcome = (value: string) =>
  value === "reviewed"
    ? "Source reviewed"
    : value === "needs_follow_up"
      ? "Further review needed"
      : "Not applicable";

/** One content model keeps reading and prompting exports complete and consistent. */
export function paymentRiskBlocks(data: PaymentRiskExport): Block[] {
  const { report } = data,
    blocks: Block[] = [];
  const add = (kind: Block["kind"], text: string) =>
    blocks.push({ kind, text });
  const field = (name: string, value: string | undefined) => {
    if (value) blocks.push({ kind: "field", label: name, text: value });
  };
  const references = (rows: PaymentReference[]) =>
    rows.forEach((r) =>
      field("Source", `${r.path}:${r.startLine}-${r.endLine}`),
    );
  const issues = (ids: string[]) => {
    if (ids.length) field("Related finding IDs", ids.join(", "));
  };
  const outcomes = (rows: Array<PaymentOutcome & { title: string }>) =>
    rows.forEach((row) => {
      add("subheading", label(row.title));
      field("Review outcome", outcome(row.outcome));
      add("body", row.reason);
      references(row.references);
      issues(row.issueIds);
    });
  add("title", "Payment Risk Review");
  field("Repository", data.repository);
  field("Branch", data.branch);
  field("Commit", data.sourceSha);
  field("Assessment ID", data.assessmentId);
  add(
    "body",
    "Source-only AI review. Findings need independent verification. Proposed attack scenarios and regression tests were not executed. This report does not establish full security coverage or authorize a merge.",
  );
  add("heading", "1. Executive summary");
  add("body", report.executiveSummary);
  add("heading", "2. System inventory");
  for (const item of report.systemInventory) {
    add("subheading", item.service);
    add("body", item.description);
    references(item.references);
  }
  add("heading", `3. Findings (${report.findings.length})`);
  add(
    "body",
    "Likelihood and impact are each scored 1-5. Scores and AI classifications are advisory; human review decisions are recorded separately when available.",
  );
  if (!report.findings.length)
    add(
      "body",
      "No source-backed issues were recorded. Review the scope gaps below.",
    );
  report.findings.forEach((f, i) => {
    add("subheading", `${i + 1}. ${f.title}`);
    field("Finding ID", f.issueId);
    field("Category", label(f.category));
    field("Service", f.service);
    field("Function", f.function);
    field("Classification", label(f.classification));
    field(
      "Original AI classification",
      f.modelClassification && label(f.modelClassification),
    );
    field("Severity", f.severity);
    field(
      "Risk score",
      `${f.likelihood} likelihood x ${f.impact} impact = ${f.score}/25`,
    );
    references(f.references);
    field("Reasoning", f.reasoning);
    field("Impact", f.impactDescription);
    field("Preconditions", f.preconditions);
    field("Counterevidence and limitations", f.counterevidence);
    field("Proposed attack scenario", f.attackScenario);
    field("Remediation", f.remediation);
    if (f.review) {
      field("Human review decision", label(f.classification));
      field("Human review reason", f.review.reason);
      field("Human review updated", new Date(f.review.updatedAt).toISOString());
    }
  });
  add("heading", "4. Payment risk register");
  outcomes(report.paymentRiskRegister.map((r) => ({ ...r, title: r.area })));
  add("subheading", "Review scope");
  outcomes(report.domains.map((r) => ({ ...r, title: r.domain })));
  add("heading", "5. Attack scenarios");
  add("body", "Conceptual source traces. These scenarios were not executed.");
  outcomes(report.attackScenarios.map((r) => ({ ...r, title: r.scenario })));
  add("heading", "6. Remediation plan");
  for (const item of report.remediationPlan) {
    add("subheading", label(item.timeframe));
    add("body", item.actions);
    issues(item.issueIds);
  }
  add("heading", "7. Proposed regression tests");
  add(
    "body",
    "Proposed test cases for your engineering team. No tests were executed by this review.",
  );
  for (const item of report.qaRegressionCases) {
    field("Finding ID", item.issueId);
    add("body", item.test);
  }
  add("heading", "8. Final risk summary");
  add("body", report.finalRiskSummary.summary);
  field("Immediate actions", report.finalRiskSummary.immediateActions);
  field("Priority finding IDs", report.finalRiskSummary.topIssueIds.join(", "));
  return blocks;
}

const escapeMarkdown = (value: string) =>
  value.replace(/([\\`*_{}\[\]<>#!|])/g, "\\$1");
export function paymentRiskMarkdown(data: PaymentRiskExport): string {
  return (
    paymentRiskBlocks(data)
      .map((block) => {
        const text = escapeMarkdown(block.text);
        if (block.kind === "title") return `# ${text}`;
        if (block.kind === "heading") return `## ${text}`;
        if (block.kind === "subheading") return `### ${text}`;
        if (block.kind === "field")
          return `**${escapeMarkdown(block.label!)}:** ${text}`;
        return text;
      })
      .join("\n\n") + "\n"
  );
}

/** Local text rendering only: no HTML execution, remote fonts or external fetches. */
export async function paymentRiskPdf(data: PaymentRiskExport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 64, bottom: 58, left: 52, right: 52 },
    bufferPages: true,
    info: {
      Title: `Payment Risk Review - ${data.repository}`,
      Author: "Preflyt",
      Subject: `Saved assessment ${data.assessmentId} at ${data.sourceSha}`,
    },
  });
  doc.registerFont(
    "Body",
    fileURLToPath(
      new URL(
        "../../resources/report-fonts/NotoSans-Regular.ttf",
        import.meta.url,
      ),
    ),
  );
  doc.registerFont(
    "Heading",
    fileURLToPath(
      new URL(
        "../../resources/report-fonts/NotoSans-Bold.ttf",
        import.meta.url,
      ),
    ),
  );
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const block of paymentRiskBlocks(data)) {
    const heading = ["title", "heading", "subheading"].includes(block.kind);
    const keepSpace = block.kind === "heading" ? 150 : 85;
    if (
      heading &&
      doc.y > doc.page.height - doc.page.margins.bottom - keepSpace
    )
      doc.addPage();
    if (heading && doc.y > doc.page.margins.top) doc.moveDown(0.6);
    doc
      .font(heading ? "Heading" : "Body")
      .fontSize(
        block.kind === "title"
          ? 23
          : block.kind === "heading"
            ? 15
            : block.kind === "subheading"
              ? 11.5
              : 10,
      )
      .fillColor(heading ? "#142a3b" : "#263747")
      .text(
        block.kind === "field" ? `${block.label}: ${block.text}` : block.text,
        { lineGap: 3, paragraphGap: 5 },
      );
    doc.moveDown(heading ? 0.35 : 0.45);
  }
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save().rect(0, 0, doc.page.width, 52).fill("#0b1020").restore();
    doc.image(
      fileURLToPath(
        new URL("../../resources/preflyt-logo-color.png", import.meta.url),
      ),
      52,
      8,
      { width: 108 },
    );
    doc
      .font("Body")
      .fontSize(8)
      .fillColor("#dce3e9")
      .text("PAYMENT RISK REVIEW", doc.page.width - 168, 23, {
        lineBreak: false,
      });
    doc.fillColor("#617181");
    doc.text(
      `${data.sourceSha.slice(0, 12)}  |  Source-only AI review`,
      52,
      doc.page.height - 36,
      { lineBreak: false },
    );
    doc.text(
      `${i + 1} / ${range.count}`,
      doc.page.width - 90,
      doc.page.height - 36,
      { lineBreak: false },
    );
  }
  doc.end();
  return result;
}
