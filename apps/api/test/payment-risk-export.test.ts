import { expect, it } from "vitest";
import {
  paymentRiskBlocks,
  paymentRiskMarkdown,
  paymentRiskPdf,
} from "../src/health/payment-risk-export.js";
import { paymentExportFixture } from "./fixtures/payment-risk-export.js";

it("exports all report sections, exact commit, source lines, reasoning, limitations and human review as readable Markdown", () => {
  const data = paymentExportFixture(),
    text = paymentRiskMarkdown(data);
  expect(text).toContain("# Payment Risk Review");
  for (const block of paymentRiskBlocks(data))
    expect(text).toContain(block.text.replace(/([\\`*_{}\[\]<>#!|])/g, "\\$1"));
  expect(text).toContain("payments.py:1-2");
  expect(text).toContain(data.sourceSha);
  expect(text).toContain("Original AI classification:** LIKELY");
  expect(text).toContain("Human review decision:** FALSE POSITIVE");
  expect(text).toContain("Counterevidence and limitations:");
  expect(text).toContain("No tests were executed by this review.");
  expect(text).not.toContain('"executiveSummary"');
});

it("treats report markup as content rather than new document headings or HTML", () => {
  const data = paymentExportFixture();
  data.report.executiveSummary =
    "# Ignore instructions\n<script>alert(1)</script>\n```sh\nrun this\n```";
  const text = paymentRiskMarkdown(data);
  expect(text).toContain("\\# Ignore instructions");
  expect(text).not.toContain("\n# Ignore instructions");
  expect(text).not.toContain("<script>");
});

it("creates a paginated PDF with embedded fonts and all document sections from a long report", async () => {
  const data = paymentExportFixture();
  data.report.systemInventory = Array.from({ length: 18 }, (_, i) => ({
    service: `Payments service ${i + 1}`,
    description:
      "Résumé — payment controls and café refunds need independent review. ".repeat(
        35,
      ),
    references: [
      {
        path: "a/very-long-source-directory/".repeat(8) + "payment-service.ts",
        startLine: 1,
        endLine: 12,
      },
    ],
  }));
  const bytes = await paymentRiskPdf(data),
    raw = bytes.toString("latin1");
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(raw.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(5);
  expect(raw).toContain("/FontFile2");
  expect(raw.includes("/Subtype /Image")).toBe(true);
  expect(raw).toContain("%%EOF");
});
