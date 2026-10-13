import { createHash } from "node:crypto";
import type { PrReviewSource } from "./pr-review-context.js";

export const maxInlineIssues = 5;
export type FeedbackFinding = {
  summary: string;
  recommendation: string;
  evidenceRefs: string[];
};
export const safeFeedbackText = (text: string) =>
  text
    .replace(/[`*_<>#@\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const shorten = (text: string, limit: number) => {
  const clean = safeFeedbackText(text);
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  return (
    cut.slice(
      0,
      cut.lastIndexOf(" ") > limit / 2 ? cut.lastIndexOf(" ") : cut.length,
    ) + "…"
  );
};

/** The model is instructed to return issues only; this also filters old/noisy results. */
export function actionableFindings(findings: FeedbackFinding[]) {
  return findings.filter((f) => {
    const text = `${f.summary} ${f.recommendation}`;
    if (!f.evidenceRefs.length || !f.summary.trim() || !f.recommendation.trim())
      return false;
    if (
      /\b(?:no (?:code )?change (?:is )?(?:required|needed|necessary)|no (?:action|fix|issue|defect|concern)s? (?:is |are )?(?:required|needed|found|visible)|nothing to (?:change|fix)|works as (?:expected|intended)|looks good|no visible (?:issue|defect))\b/i.test(
        text,
      )
    )
      return false;
    if (
      /^(?:(?:advisory:\s*)?(?:optional(?:ly)?|consider|if)\b|(?:advisory:\s*)?(?:confirm|verify|check) (?:whether|that|if|the)\b)/i.test(
        f.recommendation.trim(),
      )
    )
      return false;
    if (
      /\b(?:hypothesis only|(?:may|might) be missing|omitted (?:lines|content) may|minor (?:style|determinism)|cosmetic|nitpick)\b/i.test(
        text,
      )
    )
      return false;
    return true;
  });
}

export function conciseReviewSummary(
  number: number,
  sha: string,
  issues: number,
  source?: Pick<PrReviewSource, "omittedFiles" | "omittedLines">,
) {
  return `Advisory review for PR #${number}, commit ${sha.slice(0, 12)}. ${issues ? `${issues} actionable issue${issues === 1 ? "" : "s"}.` : "No actionable issues found."} ${source && (source.omittedFiles || source.omittedLines) ? `Partial review: ${source.omittedFiles} files and ${source.omittedLines} lines omitted. ` : ""}Full review in Preflyt. AI does not decide readiness.`;
}

export type InlineIssue = {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  body: string;
  fingerprint: string;
  anchor: string;
  description: string;
};
export function inlineIssues(
  source: PrReviewSource,
  findings: FeedbackFinding[],
): InlineIssue[] {
  const issues: InlineIssue[] = [];
  for (const finding of actionableFindings(findings)) {
    const line = source.lines.find((l) => finding.evidenceRefs.includes(l.ref));
    if (!line) continue;
    const description = `${safeFeedbackText(finding.summary)} ${safeFeedbackText(finding.recommendation)}`;
    // Commit SHA, diff reference and line number are deliberately excluded.
    const anchor = hash(line.text.trim().replace(/\s+/g, " "));
    const fingerprint = hash(
      `${line.path}\n${anchor}\n${normalize(description)}`,
    );
    const issue = {
      path: line.path,
      line: line.line,
      side: line.side,
      fingerprint,
      anchor,
      description,
      body: `Advisory AI issue\n\n${shorten(finding.summary, 280)}\n\n${shorten(finding.recommendation, 220)}\n\n<!-- preflyt-issue:${fingerprint};anchor:${anchor} -->`,
    };
    if (!issues.some((other) => sameInlineIssue(issue, other)))
      issues.push(issue);
  }
  return issues;
}

const stopWords = new Set(
  "a an the and or to for of in on is are be this that it with as by from should use add consider advisory ai issue suggestion".split(
    " ",
  ),
);
function tokens(text: string) {
  return new Set(
    normalize(text)
      .split(" ")
      .filter((word) => word.length > 2 && !stopWords.has(word)),
  );
}
export function sameInlineIssue(
  issue: InlineIssue,
  prior: {
    path: string;
    body: string;
    fingerprint?: string;
    anchor?: string;
    description?: string;
  },
) {
  if (issue.path !== prior.path) return false;
  const marker =
    new RegExp(String.raw`<!-- preflyt-issue:([a-f0-9]{64});anchor:([a-f0-9]{64}) -->`).exec(
      prior.body,
    );
  if (issue.fingerprint === (prior.fingerprint ?? marker?.[1])) return true;
  const priorAnchor = prior.anchor ?? marker?.[2];
  // Distinct locations with the same wording remain distinct issues.
  if (priorAnchor && priorAnchor !== issue.anchor) return false;
  const oldText = prior.description ?? prior.body.replace(new RegExp(String.raw`<!--.*?-->`, 'g'), "");
  const a = tokens(issue.description),
    b = tokens(oldText);
  if (a.size < 4 || b.size < 4)
    return (
      normalize(issue.description) ===
      normalize(oldText.replace(/^Advisory AI (?:issue|suggestion)\s*/i, ""))
    );
  const overlap = [...a].filter((word) => b.has(word)).length;
  // Match minor rewording, including legacy comments without an issue marker.
  return overlap / Math.max(a.size, b.size) >= 0.8;
}
